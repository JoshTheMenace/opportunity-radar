// ============================================================
// The watch cycle: new opportunities -> matching companies ->
// notifications + drafted emails. Run via scripts/watch.ts after
// each ingest (or on a loop). No button pressing.
//
// Flow per cycle:
//   1. Diff opportunities vs watch_seen -> newOpps.
//      (First ever run: seed the seen-set silently, notify nobody.)
//   2. For each monitorable company: deterministic gates over
//      newOpps -> pass/unknown survivors -> LLM ranking (same
//      rankOpportunities engine as the interactive path).
//   3. Matches at tier likely_fit / verify_eligibility become
//      notifications with a drafted email (deduped per
//      company+opportunity), written to data/outbox/.
// ============================================================

import { rowToOpportunity, getDb } from "../db";
import type { Opportunity } from "../types";
import { evaluateGates } from "../engine/gates";
import { nowUnlocked } from "../engine/future";
import { rankOpportunities } from "../engine/rank";
import { profileCompleteness } from "./completeness";
import {
  listCompanies,
  markSeen,
  recordNotification,
  seenCount,
  unseenOpportunityIds,
  type CompanyRecord,
} from "./db";
import { draftMatchEmail, writeEmlToOutbox, type DraftedEmail } from "./email";
import { resendEnabled, sendViaResend } from "./deliver";

export interface WatchCycleResult {
  seeded: boolean;
  newOpportunities: number;
  companiesChecked: number;
  companiesSkipped: { name: string; missing: string[] }[];
  notifications: { company: string; opportunity: string; tier: string; score: number }[];
}

const NOTIFY_MIN_SCORE = 50; // verify_eligibility and up — same bar as honestNo

/** Outbox .eml always (demo artifact); real Resend send when the key is set.
 *  Delivery failure is logged, never fatal — the notification already exists. */
async function deliverEmail(
  company: CompanyRecord,
  opp: Opportunity,
  email: DraftedEmail,
  log: (m: string) => void,
): Promise<void> {
  writeEmlToOutbox(company, opp, email);
  if (!resendEnabled() || !company.email) return;
  try {
    const id = await sendViaResend(company.email, email);
    log(`  emailed ${company.email} (resend ${id})`);
  } catch (e) {
    log(`  RESEND FAILED for ${company.email}: ${e instanceof Error ? e.message : e}`);
  }
}

/** "You grew into it": re-gate a company's saved future fits against its
 *  CURRENT profile; any that now fully pass become notifications + emails.
 *  Deterministic (gates only, no LLM) — the fit case was already made when
 *  the future fit was recorded; only the blocker changed. */
async function checkFutureFitUnlocks(
  company: CompanyRecord,
  log: (m: string) => void,
): Promise<WatchCycleResult["notifications"]> {
  if (company.futureFits.length === 0) return [];
  const opps = getOpportunities(company.futureFits.map((f) => f.opportunityId));
  const currentGated = new Map(
    opps.map((o) => [o.id, evaluateGates(company.profile, o)] as const),
  );
  const unlocked = nowUnlocked(company.futureFits, currentGated);
  const results: WatchCycleResult["notifications"] = [];
  const byId = new Map(opps.map((o) => [o.id, o]));
  for (const f of unlocked) {
    const opp = byId.get(f.opportunityId);
    if (!opp) continue;
    const match = {
      opportunityId: f.opportunityId,
      tier: "verify_eligibility" as const,
      score: NOTIFY_MIN_SCORE,
      whyFit: `Previously blocked (${f.blockedBy}) — your updated profile now clears every eligibility gate for this program.`,
      whatCouldDisqualify: "Re-check the current solicitation terms; they can change between cycles.",
      whatToVerify: "Confirm the program is in an open cycle before investing application time.",
      nextSteps: "Open the program page and re-run your analysis to get a fresh fit read.",
    };
    const email = company.email ? draftMatchEmail(company, opp, match) : null;
    const inserted = recordNotification({
      companyId: company.id,
      opportunityId: opp.id,
      score: match.score,
      tier: match.tier,
      whyFit: match.whyFit,
      emailSubject: email?.subject ?? null,
      emailBody: email?.body ?? null,
      emailedAt: email ? new Date().toISOString() : null,
    });
    if (inserted) {
      if (email) await deliverEmail(company, opp, email, log);
      log(`  ${company.name}: grew into ${opp.title}`);
      results.push({ company: company.name, opportunity: opp.title, tier: match.tier, score: match.score });
    }
  }
  return results;
}

function getOpportunities(ids: string[]): Opportunity[] {
  if (ids.length === 0) return [];
  const db = getDb();
  const out: Opportunity[] = [];
  const stmt = db.prepare("SELECT * FROM opportunities WHERE id = ?");
  for (const id of ids) {
    const row = stmt.get(id) as Record<string, unknown> | undefined;
    if (row) out.push(rowToOpportunity(row));
  }
  return out;
}

async function matchCompany(
  company: CompanyRecord,
  newOpps: Opportunity[],
  log: (m: string) => void,
): Promise<WatchCycleResult["notifications"]> {
  const gated = newOpps.map((opp) => evaluateGates(company.profile, opp));
  const survivors = gated.filter((g) => g.verdict !== "fail");
  if (survivors.length === 0) return [];
  log(`  ${company.name}: ${survivors.length}/${newOpps.length} pass gates, ranking...`);

  const { matches } = await rankOpportunities(company.profile, survivors);
  const keep = matches.filter(
    (m) => m.score >= NOTIFY_MIN_SCORE && (m.tier === "likely_fit" || m.tier === "verify_eligibility"),
  );

  const results: WatchCycleResult["notifications"] = [];
  const byId = new Map(newOpps.map((o) => [o.id, o]));
  for (const m of keep) {
    const opp = byId.get(m.opportunityId);
    if (!opp) continue;
    const email = company.email ? draftMatchEmail(company, opp, m) : null;
    const emailedAt = email ? new Date().toISOString() : null;
    const inserted = recordNotification({
      companyId: company.id,
      opportunityId: opp.id,
      score: m.score,
      tier: m.tier,
      whyFit: m.whyFit,
      emailSubject: email?.subject ?? null,
      emailBody: email?.body ?? null,
      emailedAt,
    });
    if (inserted) {
      if (email) await deliverEmail(company, opp, email, log);
      results.push({ company: company.name, opportunity: opp.title, tier: m.tier, score: m.score });
    }
  }
  return results;
}

export async function runWatchCycle(log: (m: string) => void = console.log): Promise<WatchCycleResult> {
  const unseen = unseenOpportunityIds();

  // First run: everything is "new" only because the watcher has no memory.
  // Seed silently so companies aren't spammed with the entire database.
  if (seenCount() === 0 && unseen.length > 0) {
    markSeen(unseen);
    log(`Seeded watch state with ${unseen.length} existing opportunities (no notifications).`);
    return {
      seeded: true,
      newOpportunities: 0,
      companiesChecked: 0,
      companiesSkipped: [],
      notifications: [],
    };
  }

  const newOpps = getOpportunities(unseen);
  log(`${newOpps.length} new opportunit${newOpps.length === 1 ? "y" : "ies"} since last cycle.`);

  const companies = listCompanies(true);
  const skipped: WatchCycleResult["companiesSkipped"] = [];
  const active: CompanyRecord[] = [];
  for (const c of companies) {
    const comp = profileCompleteness(c.profile);
    if (comp.monitorable) active.push(c);
    else skipped.push({ name: c.name, missing: comp.missing });
  }
  if (skipped.length) {
    for (const s of skipped) log(`  skipping ${s.name}: profile missing ${s.missing.join(", ")}`);
  }

  const notifications: WatchCycleResult["notifications"] = [];
  if (newOpps.length > 0 && active.length > 0) {
    // Companies matched sequentially; each company's LLM ranking batches
    // are already parallel internally.
    for (const company of active) {
      try {
        notifications.push(...(await matchCompany(company, newOpps, log)));
      } catch (e) {
        log(`  ERROR matching ${company.name}: ${e instanceof Error ? e.message : e}`);
      }
    }
  }

  // Grow-into transitions run every cycle (cheap, gates-only, no LLM) —
  // they fire on profile updates, not on new opportunities.
  for (const company of active) {
    try {
      notifications.push(...(await checkFutureFitUnlocks(company, log)));
    } catch (e) {
      log(`  ERROR future-fit check ${company.name}: ${e instanceof Error ? e.message : e}`);
    }
  }

  // Mark seen only after matching, so a crashed cycle retries next time.
  if (unseen.length > 0) markSeen(unseen);

  return {
    seeded: false,
    newOpportunities: newOpps.length,
    companiesChecked: active.length,
    companiesSkipped: skipped,
    notifications,
  };
}
