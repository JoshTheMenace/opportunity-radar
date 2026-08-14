// ============================================================
// End-to-end analysis pipeline: founder text -> MatchReport.
// Orchestrates profile -> retrieve -> gates -> meter -> rank ->
// evidence, emitting AnalyzeEvents along the way for the SSE feed.
//
// Callable two ways:
//   runAnalysis(text)                      — eval harness
//   runAnalysis(text, prior, emit)         — API facade
// ============================================================

import type {
  AnalyzeEvent,
  CompanyProfile,
  GatedOpportunity,
  MatchReport,
} from "../types";
import { extractProfile } from "./profile";
import { retrieveCandidates, countBySource } from "./retrieve";
import { evaluateGates } from "./gates";
import { buildMeter, buildQuestions, formatUsdCompact } from "./meter";
import { rankOpportunities } from "./rank";
import { getEvidence } from "./evidence";

const EVIDENCE_TOP_N = 5;
const REJECTED_MAX = 8;

/** Hard-fails worth showing: prefer non-deadline failures (a lapsed
 *  deadline is boring; a geography/ownership/size failure is a story). */
function pickRejected(gated: GatedOpportunity[]): GatedOpportunity[] {
  const fails = gated.filter((g) => g.verdict === "fail");
  const interesting = (g: GatedOpportunity) =>
    g.gates.some((x) => x.verdict === "fail" && x.gate !== "deadline") ? 1 : 0;
  return fails
    .sort((a, b) => interesting(b) - interesting(a) || b.meterValueUsd - a.meterValueUsd)
    .slice(0, REJECTED_MAX);
}

export async function runAnalysis(
  founderText: string,
  prior: Partial<CompanyProfile> | null = null,
  emit: (e: AnalyzeEvent) => void = () => {},
): Promise<MatchReport> {
  emit({ type: "activity", message: "Reading your company description..." });
  const profile = await extractProfile(founderText, prior ?? undefined);
  emit({ type: "profile", profile });

  const counts = countBySource();
  const total = Object.values(counts).reduce((a, n) => a + n, 0);
  const perSource = Object.entries(counts)
    .map(([s, n]) => `${s} ${n}`)
    .join(", ");
  emit({
    type: "activity",
    message: `Searching ${total.toLocaleString("en-US")} cached opportunities (${perSource || "empty database"})...`,
  });

  const candidates = retrieveCandidates(profile);
  emit({
    type: "activity",
    message: `Screening ${candidates.length} opportunities against eligibility gates...`,
  });
  const gated = candidates.map((opp) => evaluateGates(profile, opp));

  const meter = buildMeter(gated);
  const questions = buildQuestions(meter, profile);
  emit({ type: "questions", questions, meter });

  emit({
    type: "activity",
    message: `Ranking ${gated.filter((g) => g.verdict !== "fail").length} eligible candidates for genuine fit...`,
  });
  const { matches, honestNo, honestNoExplanation } = await rankOpportunities(profile, gated);

  // Historical-award evidence for the top matches. Surfaced as activity
  // lines only — MatchReport has no evidence field yet (see
  // NOTES-integration.md); do not mutate the shared contract here.
  const byId = new Map(gated.map((g) => [g.opportunity.id, g.opportunity]));
  const top = matches.slice(0, EVIDENCE_TOP_N);
  await Promise.all(
    top.map(async (m) => {
      const opp = byId.get(m.opportunityId);
      if (!opp) return;
      try {
        const ev = await getEvidence(opp, profile);
        const bits: string[] = [];
        if (ev.similarAwards.length) bits.push(`${ev.similarAwards.length} similar awards`);
        if (ev.alnStats) bits.push(`${formatUsdCompact(ev.alnStats.medianUsd)} median award`);
        if (ev.nearbyWinners.length) bits.push(`${ev.nearbyWinners.length} nearby winners`);
        if (bits.length) {
          emit({ type: "activity", message: `Evidence: ${bits.join(", ")} for ${opp.title}` });
        }
      } catch {
        // evidence is best-effort; a failed source never breaks the report
      }
    }),
  );

  const report: MatchReport = {
    profile,
    matches,
    rejected: pickRejected(gated),
    honestNo,
    honestNoExplanation,
    meter,
    questions,
  };
  emit({ type: "report", report });
  return report;
}
