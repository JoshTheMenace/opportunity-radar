// ============================================================
// Scores one MatchReport against one EvalCase.
//
//   coverage    — deterministic keyword check (theme synonyms below)
//   honesty     — did honestNo come out the right way for this case?
//   noDead      — no matches whose closeDate is already past
//   explanation — LLM judge (skipped → 0 + "n/a" note under mock backend)
//
//   total = 0.35*coverage + 0.3*honesty + 0.15*noDead + 0.2*explanation
// ============================================================

import { getDb, rowToOpportunity } from "../src/lib/db";
import { localIsoDate } from "../src/lib/engine/dates";
import { completeJSON } from "../src/lib/llm";
import type { EvalCase, EvalScore, MatchReport, Opportunity } from "../src/lib/types";

// ---------- coverage (deterministic; no LLM) ----------

/** Case-insensitive synonyms per mustSee theme. Matched on word boundaries. */
const THEME_SYNONYMS: Record<string, string[]> = {
  nih: ["nih", "national institutes of health"],
  nsf: ["nsf", "national science foundation"],
  hhs: ["hhs", "health and human services"],
  sbir: ["sbir", "sttr", "small business innovation research", "small business technology transfer"],
  workforce: ["workforce", "job training", "apprenticeship", "apprentice"],
  dod: ["dod", "department of defense", "defense", "darpa", "afwerx", "air force", "army", "navy", "space force"],
  nasa: ["nasa", "aeronautics and space"],
  doe: ["doe", "department of energy"],
  procurement: ["procurement", "contract", "contracting", "acquisition"],
  epa: ["epa", "environmental protection"],
  infrastructure: ["infrastructure", "state revolving fund", "srf", "bipartisan infrastructure"],
  dhs: ["dhs", "homeland security", "cisa"],
  education: ["education", "after-school", "afterschool", "stem"],
  "small business": ["small business", "sba", "small business administration"],
  community: ["community", "community development", "cdbg"],
};

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function themePresent(theme: string, haystack: string): boolean {
  const synonyms = THEME_SYNONYMS[theme.toLowerCase()] ?? [theme.toLowerCase()];
  return synonyms.some((syn) => new RegExp(`\\b${escapeRegExp(syn)}\\b`, "i").test(haystack));
}

function lookupOpportunity(id: string): Opportunity | null {
  try {
    const row = getDb().prepare("SELECT * FROM opportunities WHERE id = ?").get(id);
    return row ? rowToOpportunity(row as Record<string, unknown>) : null;
  } catch {
    return null; // DB missing/empty — judge still works off whyFit text
  }
}

// ---------- LLM explanation judge ----------

const JUDGE_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "number", minimum: 0, maximum: 1 },
    notes: { type: "string" },
  },
  required: ["score", "notes"],
  additionalProperties: false,
};

async function judgeExplanations(
  evalCase: EvalCase,
  report: MatchReport,
  spokenTranscript?: string,
): Promise<{ score: number; notes: string }> {
  if ((process.env.LLM_BACKEND ?? "codex") === "mock") {
    return { score: 0, notes: "explanationQuality n/a (mock backend)" };
  }
  const excerpts = report.matches.slice(0, 8).map((m) => ({
    opportunityId: m.opportunityId,
    tier: m.tier,
    whyFit: m.whyFit,
    whatToVerify: m.whatToVerify,
    nextSteps: m.nextSteps,
  }));
  // Voice provider: grade what the agent actually said to the founder,
  // with the report data it was grounded in for hallucination-checking.
  const prompt = (spokenTranscript
    ? [
        "You are grading what a VOICE agent said to a startup founder about a government-funding matching report.",
        "Rubric (score 0-1): replies are grounded in the founder's actual situation and the report data,",
        "specific (not generic boilerplate), invent no facts, numbers, or program details not in the data,",
        "honest about weak fits, and give actionable next steps in a natural spoken register.",
        "",
        `FOUNDER INPUT:\n${evalCase.founderInput}`,
        "",
        `HONEST NO: ${report.honestNo}${report.honestNoExplanation ? ` — ${report.honestNoExplanation}` : ""}`,
        "",
        // The agent also saw the meter and interview questions — include them
        // so real figures it quotes aren't scored as inventions.
        `REPORT DATA the agent saw (JSON):\n${JSON.stringify(
          {
            totalMatches: report.matches.length,
            meter: {
              unlockedUsd: report.meter.unlockedUsd,
              potentialUsd: report.meter.potentialUsd,
              eligibleCount: report.meter.unlockedCount,
            },
            questionsToAsk: report.questions.map((q) => ({
              field: q.field,
              question: q.question,
              whyAsking: q.whyAsking,
            })),
            // Merge in the opportunity fields the voice agent reads (title,
            // agency, amounts, deadline) so quoting them isn't "invention".
            topMatches: excerpts.map((e) => {
              const opp = lookupOpportunity(e.opportunityId);
              return {
                ...e,
                title: opp?.title ?? null,
                agency: opp?.agency ?? null,
                awardFloorUsd: opp?.awardFloorUsd ?? null,
                awardCeilingUsd: opp?.awardCeilingUsd ?? null,
                closeDate: opp?.closeDate ?? null,
              };
            }),
          },
          null,
          2,
        )}`,
        "",
        `AGENT'S SPOKEN REPLIES:\n${spokenTranscript}`,
        "",
        'Return JSON: {"score": <0-1>, "notes": "<one-sentence justification>"}',
      ]
    : [
        "You are grading the explanation quality of a startup-to-government-funding matching report.",
        "Rubric (score 0-1): explanations are grounded in the founder's actual situation,",
        "specific to each opportunity (not generic boilerplate), invent no facts, numbers,",
        "or program details not plausibly from the data, and give actionable next steps.",
        "",
        `FOUNDER INPUT:\n${evalCase.founderInput}`,
        "",
        `HONEST NO: ${report.honestNo}${report.honestNoExplanation ? ` — ${report.honestNoExplanation}` : ""}`,
        "",
        `MATCH EXPLANATIONS (JSON):\n${JSON.stringify(excerpts, null, 2)}`,
        "",
        'Return JSON: {"score": <0-1>, "notes": "<one-sentence justification>"}',
      ]
  ).join("\n");
  try {
    const out = await completeJSON<{ score: number; notes: string }>(prompt, JUDGE_SCHEMA, {
      effort: "low",
      maxTokens: 500,
    });
    return { score: Math.min(1, Math.max(0, out.score)), notes: out.notes };
  } catch (err) {
    return { score: 0, notes: `explanation judge failed: ${(err as Error).message}` };
  }
}

// ---------- main entry ----------

export async function judgeReport(
  evalCase: EvalCase,
  report: MatchReport,
  opts?: { spokenTranscript?: string },
): Promise<EvalScore> {
  // coverage — search titles + agencies + whyFit of surfaced matches
  const haystack = report.matches
    .map((m) => {
      const opp = lookupOpportunity(m.opportunityId);
      return [opp?.title ?? "", opp?.agency ?? "", m.whyFit].join(" ");
    })
    .join(" ")
    .toLowerCase();
  const hits = evalCase.mustSee.filter((t) => themePresent(t, haystack));
  const missed = evalCase.mustSee.filter((t) => !themePresent(t, haystack));
  const coverage = evalCase.mustSee.length === 0 ? 1 : hits.length / evalCase.mustSee.length;

  // honesty
  const honesty = evalCase.expectHonestNo ? (report.honestNo ? 1 : 0) : report.honestNo ? 0 : 1;

  // no dead opportunities (closeDate strictly before today)
  const today = localIsoDate();
  const dead = report.matches.filter((m) => {
    const close = lookupOpportunity(m.opportunityId)?.closeDate;
    return close != null && close < today;
  });
  const noDeadOpportunities =
    report.matches.length === 0 ? 1 : 1 - dead.length / report.matches.length;

  // explanation quality (LLM judge; n/a under mock)
  const explanation = await judgeExplanations(evalCase, report, opts?.spokenTranscript);

  const total =
    0.35 * coverage + 0.3 * honesty + 0.15 * noDeadOpportunities + 0.2 * explanation.score;

  const notes = [
    missed.length ? `missed themes: ${missed.join(", ")}` : "all mustSee themes covered",
    dead.length ? `dead matches: ${dead.map((m) => m.opportunityId).join(", ")}` : null,
    honesty === 0
      ? `honesty wrong: expected honestNo=${evalCase.expectHonestNo}, got ${report.honestNo}`
      : null,
    explanation.notes,
  ]
    .filter(Boolean)
    .join(" | ");

  return {
    caseId: evalCase.id,
    coverage,
    honesty,
    noDeadOpportunities,
    explanationQuality: explanation.score,
    total,
    notes,
  };
}
