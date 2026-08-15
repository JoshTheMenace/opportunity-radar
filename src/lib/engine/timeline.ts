// ============================================================
// Work-back application timeline + plain-language odds.
// Deterministic — NO LLM, NO DB. Safe to import from client code
// (only pulls types and the pure date helper).
// ============================================================

import { localIsoDate } from "./dates";
import type { CompanyProfile, FundingKind, Opportunity } from "../types";

export interface TimelineStep {
  title: string;
  detail: string;
  due: string | null; // ISO yyyy-mm-dd; null = rolling/forecasted
  urgent: boolean;
}

/** iso + days, computed in local time (never UTC). */
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return localIsoDate(new Date(y, m - 1, d + days));
}

/** Whole days from `from` to `to` (negative = past). */
function daysBetween(from: string, to: string): number {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  return Math.round(
    (new Date(ty, tm - 1, td).getTime() - new Date(fy, fm - 1, fd).getTime()) / 86_400_000,
  );
}

const NEEDS_GRANTS_GOV: FundingKind[] = ["grant", "cooperative_agreement", "sbir_sttr"];

/**
 * Work backward from opp.closeDate through the real procedural prerequisites.
 * `today` is injectable for deterministic tests (defaults to local today).
 */
export function buildTimeline(
  opp: Opportunity,
  profile: CompanyProfile,
  today: string = localIsoDate(),
): TimelineStep[] {
  const close = opp.closeDate; // null = rolling/forecasted
  const dueBefore = (days: number) => (close ? addDays(close, -days) : null);
  const steps: TimelineStep[] = [];

  if (profile.samRegistered !== true) {
    let due = dueBefore(42);
    let detail =
      "Register at SAM.gov to get your UEI — takes 2-6 weeks and is required before you can apply.";
    if (close === null) {
      detail = "SAM.gov registration + UEI takes 2-6 weeks — rolling — start when ready.";
    } else if (due !== null && due < today) {
      due = today;
      detail =
        "start immediately — SAM registration takes 2-6 weeks and is required before you can apply";
    }
    steps.push({ title: "Register on SAM.gov (get UEI)", detail, due, urgent: false });
  }

  if (NEEDS_GRANTS_GOV.includes(opp.kind)) {
    steps.push({
      title: "Set up Grants.gov workspace + AOR",
      detail:
        close === null
          ? "Workspace + Authorized Organization Representative approval takes ~3-5 business days — rolling — start when ready."
          : "Workspace + Authorized Organization Representative approval takes ~3-5 business days.",
      due: dueBefore(21),
      urgent: false,
    });
  }

  steps.push({
    title: "Full draft complete",
    detail:
      close === null
        ? "Finish the full draft — rolling — start when ready; leave time for budget justification and internal review."
        : "Leave time for budget justification and internal review.",
    due: dueBefore(14),
    urgent: false,
  });

  steps.push({
    title: "Submit application",
    detail:
      close === null
        ? "Submit — rolling — start when ready."
        : "Never submit on deadline day — grants.gov rejections for format errors are common and final.",
    due: dueBefore(3),
    urgent: false,
  });

  for (const s of steps) s.urgent = s.due !== null && daysBetween(today, s.due) <= 14;
  return steps.sort((a, b) =>
    a.due === null ? (b.due === null ? 0 : 1) : b.due === null ? -1 : a.due.localeCompare(b.due),
  );
}

/**
 * Plain-language odds from real numbers (never invented by an LLM).
 * null when we have no expectedAwards to reason from.
 */
export function oddsLabel(
  expectedAwards: number | null,
  expectedApplications: number | null,
): string | null {
  if (expectedAwards === null) return null;
  const awards = expectedAwards;
  if (expectedApplications !== null && expectedApplications > 0 && awards > 0) {
    const apps = expectedApplications;
    const ratio = awards / apps;
    const oneIn = Math.max(1, Math.round(apps / awards));
    // A "1-in-1" ratio is noise, not information — show raw counts instead.
    const nums =
      oneIn >= 2
        ? `roughly 1-in-${oneIn} (${awards} awards / ~${apps} applicants)`
        : `${awards} awards / ~${apps} applicants`;
    if (ratio >= 0.5) return `strong odds — ${nums}`;
    if (ratio >= 0.2) return `competitive — good target, ${nums}`;
    if (ratio >= 0.08) return `competitive — ${nums}`;
    return `long shot — apply only with a strong story, ${nums}`;
  }
  if (awards >= 20) return `many awards given — good odds (${awards} expected awards)`;
  if (awards >= 5) return `a real shot (${awards} expected awards)`;
  return `few awards — selective (${awards} expected award${awards === 1 ? "" : "s"})`;
}
