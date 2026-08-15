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
  // A complete prior profile (interview follow-up) skips re-extraction.
  const priorComplete =
    prior != null &&
    Array.isArray(prior.technologyKeywords) &&
    prior.technologyKeywords.length > 0 &&
    typeof prior.description === "string";
  let profile: CompanyProfile;
  if (priorComplete) {
    emit({ type: "activity", message: "Updating your profile..." });
    profile = { ...(prior as CompanyProfile), description: founderText };
  } else {
    emit({ type: "activity", message: "Reading your company description..." });
    profile = await extractProfile(founderText, prior ?? undefined);
  }
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
  const questions = buildQuestions(gated, profile);
  emit({ type: "questions", questions, meter });

  emit({
    type: "activity",
    message: `Ranking ${gated.filter((g) => g.verdict !== "fail").length} eligible candidates for genuine fit...`,
  });
  // Stream partial reports as scoring batches land, so matches appear live.
  // The facade/UI keep only the latest report event; the final one wins.
  const rejected = pickRejected(gated);
  const { matches, honestNo, honestNoExplanation } = await rankOpportunities(
    profile,
    gated,
    (matchesSoFar, scoredCount, totalCount) => {
      emit({
        type: "activity",
        message: `Scored ${scoredCount}/${totalCount} candidates — ${matchesSoFar.length} matches so far...`,
      });
      if (matchesSoFar.length > 0) {
        emit({
          type: "report",
          report: {
            profile,
            matches: matchesSoFar,
            rejected,
            honestNo: false, // never claim "no match" before scoring finishes
            honestNoExplanation: null,
            meter,
            questions,
          },
        });
      }
    },
  );

  // Historical-award evidence for the top matches: surfaced live as
  // activity lines AND attached to the report (MatchReport.evidence).
  const byId = new Map(gated.map((g) => [g.opportunity.id, g.opportunity]));
  const top = matches.slice(0, EVIDENCE_TOP_N);
  const evidence: NonNullable<MatchReport["evidence"]> = {};
  await Promise.all(
    top.map(async (m) => {
      const opp = byId.get(m.opportunityId);
      if (!opp) return;
      try {
        const ev = await getEvidence(opp, profile);
        evidence[m.opportunityId] = {
          totalAwards: ev.alnStats?.totalAwards ?? null,
          totalUsd: ev.alnStats?.totalUsd ?? null,
          medianUsd: ev.alnStats?.medianUsd ?? null,
          utahCount: ev.alnStats?.utahCount ?? null,
          similarAwards: ev.similarAwards.slice(0, 5).map((a) => ({
            recipient: a.recipient,
            amountUsd: a.amountUsd,
            year: a.year,
            state: a.state,
            link: a.link,
          })),
        };
        const bits: string[] = [];
        if (ev.similarAwards.length) bits.push(`${ev.similarAwards.length} similar awards`);
        if (ev.alnStats?.medianUsd != null)
          bits.push(`${formatUsdCompact(ev.alnStats.medianUsd)} median award`);
        if (ev.nearbyWinners.length) bits.push(`${ev.nearbyWinners.length} nearby winners`);
        if (bits.length) {
          emit({ type: "activity", message: `Evidence: ${bits.join(", ")} for ${opp.title}` });
        }
      } catch {
        // evidence is best-effort; a failed source never breaks the report
      }
    }),
  );

  // NOTE: the API facade owns the final {type:"report"} SSE event.
  return {
    profile,
    matches,
    rejected,
    honestNo,
    honestNoExplanation,
    meter,
    questions,
    evidence,
  };
}
