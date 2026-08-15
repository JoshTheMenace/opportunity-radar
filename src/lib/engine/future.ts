// ============================================================
// Future fits — "not yet" matches. Deterministic, no LLM.
// A hard-failed opportunity qualifies when EVERY failing gate is
// something time can fix: a passed deadline (programs recur), no
// active R&D yet (they could start), or an award/need mismatch
// (capital needs move). Structural blocks (geography, for-profit
// exclusions, size caps, ownership) never appear here — telling a
// founder they'll "grow into" those would be false hope.
// ============================================================

import type { FutureFit, FutureFitReason, GatedOpportunity } from "../types";

const MAX_FUTURE_FITS = 6;

/** gate name -> reason, for gates that time can fix. */
const SOLVABLE: Record<string, FutureFitReason> = {
  deadline: "reopens",
  "sbir:rnd": "start_rnd",
  amount_overlap: "amount_mismatch",
};

function detailFor(reason: FutureFitReason, g: GatedOpportunity): string {
  const o = g.opportunity;
  switch (reason) {
    case "reopens":
      return `Everything else lines up, but the window closed ${o.closeDate ?? "recently"}. Programs like this typically reopen on an annual cycle — we'll flag the next one.`;
    case "start_rnd":
      return "This is R&D money (SBIR/STTR) and your profile says you're not doing active R&D. If you start a research effort, this opens up.";
    case "amount_mismatch": {
      const cap = o.awardCeilingUsd != null ? `$${Math.round(o.awardCeilingUsd).toLocaleString("en-US")}` : "its award cap";
      return `${cap} is too small against your current raise target — worth revisiting if your funding needs change or you'd take partial funding.`;
    }
  }
}

/**
 * From the full gated pool, pick hard-fails whose every failing gate is
 * solvable with time. Sorted by dollar value, capped. Pure.
 */
export function classifyFutureFits(gated: GatedOpportunity[]): FutureFit[] {
  const out: FutureFit[] = [];
  for (const g of gated) {
    if (g.verdict !== "fail") continue;
    const fails = g.gates.filter((x) => x.verdict === "fail");
    if (fails.length === 0 || !fails.every((x) => SOLVABLE[x.gate])) continue;
    // Lead with the most meaningful reason: reopens > start_rnd > amount.
    const order: FutureFitReason[] = ["reopens", "start_rnd", "amount_mismatch"];
    const reasons = fails.map((x) => SOLVABLE[x.gate]);
    const reason = order.find((r) => reasons.includes(r))!;
    const blocking = fails.find((x) => SOLVABLE[x.gate] === reason)!;
    out.push({
      opportunityId: g.opportunity.id,
      title: g.opportunity.title,
      agency: g.opportunity.agency,
      closeDate: g.opportunity.closeDate,
      reason,
      blockedBy: blocking.gate,
      detail: detailFor(reason, g),
      meterValueUsd: g.meterValueUsd,
    });
  }
  return out.sort((a, b) => b.meterValueUsd - a.meterValueUsd).slice(0, MAX_FUTURE_FITS);
}

/**
 * For the watcher: given a company's SAVED future fits and its CURRENT gated
 * results for those same opportunities, return the ones that now fully pass —
 * the "you grew into it" transitions.
 */
export function nowUnlocked(
  saved: FutureFit[],
  currentGated: Map<string, GatedOpportunity>,
): FutureFit[] {
  return saved.filter((f) => currentGated.get(f.opportunityId)?.verdict === "pass");
}
