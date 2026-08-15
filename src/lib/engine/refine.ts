// ============================================================
// Incremental refine: fold one interview answer into an EXISTING
// report without re-ranking. Interview answers only ever fill
// unknown fields (never change known ones), so eligibility is
// monotone — the eligible set can only shrink. That means:
//   - gates re-run deterministically (milliseconds)
//   - previous LLM scores/explanations are reused as-is
//   - newly-failed opportunities are subtracted
//   - tiers upgrade for free when a gate flips unknown -> pass
// No LLM calls. Answers go from ~30s (full re-rank) to instant.
// ============================================================

import type {
  CompanyProfile,
  GatedOpportunity,
  MatchReport,
  RankedMatch,
} from "../types";
import { retrieveCandidates } from "./retrieve";
import { evaluateGates } from "./gates";
import { buildMeter, buildQuestions } from "./meter";
import { sortQuestionsRequiredFirst } from "./readiness";
import { tierFor } from "./rank";

const REJECTED_MAX = 8;

/** Same "interesting fails first" selection the full pipeline uses. */
function pickRejected(gated: GatedOpportunity[]): GatedOpportunity[] {
  const fails = gated.filter((g) => g.verdict === "fail");
  const interesting = (g: GatedOpportunity) =>
    g.gates.some((x) => x.verdict === "fail" && x.gate !== "deadline") ? 1 : 0;
  return fails
    .sort((a, b) => interesting(b) - interesting(a) || b.meterValueUsd - a.meterValueUsd)
    .slice(0, REJECTED_MAX);
}

/** Deterministic honest-no explanation when answers ruled everything out. */
function explainHonestNo(dropped: RankedMatch[], gated: GatedOpportunity[]): string {
  const failsById = new Map(gated.map((g) => [g.opportunity.id, g]));
  const reasons = new Set<string>();
  for (const m of dropped) {
    const detail = failsById
      .get(m.opportunityId)
      ?.gates.find((x) => x.verdict === "fail")?.detail;
    if (detail) reasons.add(detail);
    if (reasons.size >= 3) break;
  }
  return (
    "Your answers ruled out the remaining strong matches" +
    (reasons.size ? ` — ${[...reasons].join("; ")}` : "") +
    ". The adjacent options below may still be worth a look."
  );
}

/**
 * Re-gate with the updated profile and subtract from the prior report.
 * `profile` must be the prior report's profile with answers applied.
 */
export function refineReport(prior: MatchReport, profile: CompanyProfile): MatchReport {
  const candidates = retrieveCandidates(profile);
  const gated = candidates.map((o) => evaluateGates(profile, o));
  const verdictById = new Map(gated.map((g) => [g.opportunity.id, g.verdict]));

  const matches: RankedMatch[] = [];
  const dropped: RankedMatch[] = [];
  for (const m of prior.matches) {
    // Absent from retrieval (e.g. SBIR set removed after hasActiveRnD=false)
    // counts as failed — subtraction only, never re-adding.
    const verdict = verdictById.get(m.opportunityId) ?? "fail";
    if (verdict === "fail") {
      dropped.push(m);
    } else {
      matches.push({ ...m, tier: tierFor(m.score, verdict) });
    }
  }

  const honestNo = !matches.some(
    (m) => m.tier === "likely_fit" || m.tier === "verify_eligibility",
  );
  const evidence = prior.evidence
    ? Object.fromEntries(
        Object.entries(prior.evidence).filter(([id]) =>
          matches.some((m) => m.opportunityId === id),
        ),
      )
    : undefined;

  return {
    profile,
    matches,
    rejected: pickRejected(gated),
    honestNo,
    honestNoExplanation: honestNo
      ? prior.honestNo
        ? prior.honestNoExplanation
        : explainHonestNo(dropped, gated)
      : null,
    meter: buildMeter(gated),
    questions: sortQuestionsRequiredFirst(buildQuestions(gated, profile)),
    evidence,
  };
}
