// ============================================================
// UTIF special case — Utah Technology Innovation Funding
// microgrant ($3K-$5K, Utah Innovation Center / Go Utah).
// It reimburses the cost of PREPARING a first SBIR/STTR Phase I
// proposal, so for an eligible company it's near-certain money:
// the award is for doing the work with the center, not for
// winning the federal grant. Deterministic — the LLM ranker's
// generic-program calibration would otherwise underrate it.
// Verified against business.utah.gov (UTIF Application Guide),
// probed 2026-08-15.
// ============================================================

import type { CompanyProfile, RankedMatch } from "../types";

export const UTIF_ID = "utah:utif-sbir-microgrant";
export const UTIF_SCORE = 92;

/**
 * Deterministic qualification: Utah HQ + small business + real R&D signal
 * (SBIR is R&D money — without R&D there is no first proposal to prepare).
 * The one condition we can never see in a profile — "never applied to
 * SBIR/STTR before" — stays in whatToVerify.
 */
export function utifQualifies(p: CompanyProfile): boolean {
  return (
    p.location?.state === "UT" &&
    p.isSmallBusiness === true &&
    p.hasActiveRnD === true &&
    p.isForProfit !== false
  );
}

/** The injected likely-fit match. All facts trace to the DB row / program guide. */
export function utifMatch(): RankedMatch {
  return {
    opportunityId: UTIF_ID,
    tier: "likely_fit",
    score: UTIF_SCORE,
    whyFit:
      "Reimburses $3,000-$5,000 of the cost of preparing your first SBIR/STTR Phase I proposal — grant writing, strategy, and compliance review. Unlike the federal grants below, this pays for the preparation work itself: engage the Utah Innovation Center, submit a real Phase I proposal, and the microgrant applies whether or not the federal award comes through.",
    whatCouldDisqualify:
      "First-timers only: if your company has ever submitted an SBIR/STTR proposal before, you are not eligible. The business must be headquartered in Utah.",
    whatToVerify:
      "Confirm this would be your company's first-ever SBIR/STTR Phase I submission, and pick the specific federal solicitation you'll name in the UTIF application.",
    nextSteps:
      "Contact the Utah Innovation Center (start with their free SBIR 101 workshop), choose a target Phase I solicitation from the matches below, then file the rolling UTIF application before you start paying for proposal help.",
  };
}

/**
 * Inject into a ranked match list: replaces whatever the LLM said about the
 * UTIF row with the deterministic card, keeps score order. No-op when the
 * profile doesn't qualify (the LLM's own read stands) or when the report is
 * an honest no (pushing SBIR prep money at a company with no federal fit
 * would undercut the determination).
 */
export function injectUtif(
  matches: RankedMatch[],
  profile: CompanyProfile,
  honestNo: boolean,
  /** True when the ranked matches already include an SBIR/STTR program. */
  recommendsSbir = false,
): RankedMatch[] {
  // Recommending an SBIR/STTR already implies the small-business + R&D
  // conditions, so the microgrant rides along for any Utah company even
  // while those profile fields are still null. Utah HQ stays required —
  // it is Utah money.
  const qualifies =
    utifQualifies(profile) ||
    (recommendsSbir && profile.location?.state === "UT" && profile.isForProfit !== false);
  if (honestNo || !qualifies) return matches;
  const rest = matches.filter((m) => m.opportunityId !== UTIF_ID);
  return [...rest, utifMatch()].sort((a, b) => b.score - a.score);
}
