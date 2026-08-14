// ============================================================
// LLM ranking with honest-no calibration.
// Input: gated opportunities (verdict pass|unknown only).
// The LLM scores + writes prose; tiers are computed HERE from
// score + gate verdicts. Deterministic guards drop dead items.
// ============================================================

import { complete, completeJSON } from "../llm";
import { localIsoDate } from "./dates";
import type {
  CompanyProfile,
  FitTier,
  GatedOpportunity,
  RankedMatch,
} from "../types";

const BATCH_SIZE = 15;
const MAX_MATCHES = 25;

// Score thresholds — single source of truth for tierFor, honestNo, and the prompt.
const TIER_LIKELY = 70;
const TIER_VERIFY = 50;
const TIER_ADJACENT = 30;

export interface RankResult {
  matches: RankedMatch[];
  honestNo: boolean;
  honestNoExplanation: string | null;
}

/** What the LLM returns per opportunity. Tier is NOT the LLM's job. */
interface ScoredItem {
  opportunityId: string;
  score: number;
  whyFit: string;
  whatCouldDisqualify: string;
  whatToVerify: string;
  nextSteps: string;
}

/** JSON Schema for one batch response. Root must be an OBJECT (structured-output
 * backends reject array roots), so the scored items live under "matches". */
export const RANK_BATCH_SCHEMA = {
  type: "object",
  properties: {
    matches: {
      type: "array",
      items: {
        type: "object",
        properties: {
          opportunityId: { type: "string" },
          score: { type: "number", minimum: 0, maximum: 100 },
          whyFit: { type: "string" },
          whatCouldDisqualify: { type: "string" },
          whatToVerify: { type: "string" },
          nextSteps: { type: "string" },
        },
        required: [
          "opportunityId",
          "score",
          "whyFit",
          "whatCouldDisqualify",
          "whatToVerify",
          "nextSteps",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["matches"],
  additionalProperties: false,
} as const;

/** Pure tier mapping from score + gate verdict. Exported for tests. */
export function tierFor(score: number, gateVerdict: "pass" | "unknown"): FitTier {
  if (score >= TIER_LIKELY) return gateVerdict === "unknown" ? "verify_eligibility" : "likely_fit";
  if (score >= TIER_VERIFY) return "verify_eligibility";
  if (score >= TIER_ADJACENT) return "adjacent";
  return "not_a_fit";
}

function money(n: number | null): string {
  return n == null ? "unspecified" : `$${Math.round(n).toLocaleString("en-US")}`;
}

function profileSummary(p: CompanyProfile): string {
  const loc = p.location ? [p.location.city, p.location.state].filter(Boolean).join(", ") : null;
  const lines = [
    `Description (founder's words): ${p.description}`,
    `Name: ${p.name ?? "unknown"} | Industry: ${p.industry ?? "unknown"}`,
    `Technology keywords: ${p.technologyKeywords.join(", ") || "none"}`,
    `Government-language keywords: ${p.govKeywords.join(", ") || "none"}`,
    `NAICS guesses: ${p.naicsGuesses.join(", ") || "none"}`,
    `Location: ${loc ?? "unknown"} | Employees: ${p.employees ?? "unknown"} | Revenue: ${p.annualRevenueUsd != null ? money(p.annualRevenueUsd) : "unknown"}`,
    `Stage: ${p.fundingStage ?? "unknown"} | Product maturity: ${p.productMaturity ?? "unknown"} | Active R&D: ${p.hasActiveRnD ?? "unknown"}`,
    `For-profit: ${p.isForProfit ?? "unknown"} | Small business: ${p.isSmallBusiness ?? "unknown"} | Majority US-owned: ${p.majorityUsOwned ?? "unknown"}`,
    `Capital need: ${money(p.capitalNeedUsd.min)} - ${money(p.capitalNeedUsd.max)} | Use of funds: ${p.useOfFunds ?? "unknown"}`,
    `Target customers: ${p.targetCustomers ?? "unknown"}`,
  ];
  return lines.join("\n");
}

function gateSummary(g: GatedOpportunity): string {
  const unknowns = g.gates.filter((x) => x.verdict === "unknown");
  if (g.verdict === "pass") return "all eligibility gates pass";
  const parts = unknowns.map(
    (x) => `${x.gate} unknown${x.missingField ? ` (missing: ${x.missingField})` : ""}: ${x.detail}`,
  );
  return `verdict unknown — ${parts.join("; ") || "unresolved gates"}`;
}

function opportunityBlock(g: GatedOpportunity, idx: number): string {
  const o = g.opportunity;
  const desc = o.description.length > 600 ? o.description.slice(0, 600) + "…" : o.description;
  return [
    `--- Opportunity ${idx + 1} ---`,
    `id: ${o.id}`,
    `title: ${o.title}`,
    `agency: ${o.agency}`,
    `kind: ${o.kind}`,
    `award range: ${money(o.awardFloorUsd)} - ${money(o.awardCeilingUsd)}`,
    `deadline: ${o.closeDate ?? "rolling / not stated"}`,
    `gates: ${gateSummary(g)}`,
    `description: ${desc}`,
  ].join("\n");
}

const RUBRIC = `You are scoring US government funding opportunities for genuine relevance to ONE specific company.

Score each opportunity 0-100 on genuine fit across four dimensions:
1. Technology fit — does the company's actual technology match what the program funds?
2. Agency mission fit — would this agency plausibly fund this company's work?
3. Stage fit — does the company's maturity/stage match the program's intent?
4. Use-of-funds fit — does what the company needs money for match what the award pays for?

CALIBRATION (follow strictly):
- Most opportunities are NOT a fit. Scores above ${TIER_LIKELY} should be rare and defensible.
- Do not inflate scores to seem helpful.
- A generic small-business program that merely does not exclude the company is "adjacent" (${TIER_ADJACENT}-${TIER_VERIFY - 1}), not a fit.
- Generic capital-access programs (loans, loan participation/guarantees, revolving loan funds, co-investment, tax credits, counseling/mentoring services) that any small business could use score at most ${TIER_VERIFY - 1} — a genuine fit requires the program to specifically target the company's technology, industry, or mission.

For each opportunity write 1-2 sentences each for whyFit, whatCouldDisqualify, whatToVerify, nextSteps.
Ground every statement ONLY in the data provided above. Never invent numbers, deadlines, dollar amounts, or program details that are not given. If something is unknown, say it is unknown.

Return a JSON object {"matches": [...]} with one entry per opportunity, using each opportunity's exact "id" as opportunityId.`;

async function scoreBatch(
  profile: CompanyProfile,
  batch: GatedOpportunity[],
): Promise<ScoredItem[]> {
  const prompt = [
    "COMPANY PROFILE:",
    profileSummary(profile),
    "",
    "OPPORTUNITIES TO SCORE:",
    ...batch.map(opportunityBlock),
    "",
    RUBRIC,
  ].join("\n");
  const raw = await completeJSON<{ matches: ScoredItem[] }>(prompt, RANK_BATCH_SCHEMA, {
    system: "You are a rigorous, skeptical government-funding analyst. Honesty over helpfulness.",
    effort: "medium",
  });
  return Array.isArray(raw?.matches) ? raw.matches : [];
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export async function rankOpportunities(
  profile: CompanyProfile,
  gated: GatedOpportunity[],
): Promise<RankResult> {
  // Only pass/unknown ever reach the LLM (defensive re-filter).
  const candidates = gated.filter(
    (g) => g.verdict === "pass" || g.verdict === "unknown",
  );
  const byId = new Map(candidates.map((g) => [g.opportunity.id, g]));

  // Score batches in parallel; one failed batch degrades, all failing throws.
  const chunks = chunk(candidates, BATCH_SIZE);
  let failed = 0;
  const results = await Promise.all(
    chunks.map((batch) =>
      scoreBatch(profile, batch).catch((err) => {
        failed++;
        console.error(`rank: scoreBatch failed (${batch.length} items):`, err);
        return [] as ScoredItem[];
      }),
    ),
  );
  if (chunks.length > 0 && failed === chunks.length) {
    throw new Error(`rank: all ${chunks.length} scoring batches failed`);
  }
  const scored: ScoredItem[] = results.flat();

  const today = localIsoDate();
  const matches: RankedMatch[] = [];
  for (const item of scored) {
    const g = byId.get(item.opportunityId);
    if (!g) continue; // hallucinated or malformed id
    // Deterministic guard: never surface a closed opportunity.
    const close = g.opportunity.closeDate;
    if (close != null && close < today) continue;
    const score = Math.max(0, Math.min(100, Math.round(Number(item.score) || 0)));
    const tier = tierFor(score, g.verdict === "unknown" ? "unknown" : "pass");
    if (tier === "not_a_fit" && score < 20) continue; // clear misses dropped entirely
    matches.push({
      opportunityId: g.opportunity.id,
      tier,
      score,
      whyFit: item.whyFit ?? "",
      whatCouldDisqualify: item.whatCouldDisqualify ?? "",
      whatToVerify: item.whatToVerify ?? "",
      nextSteps: item.nextSteps ?? "",
    });
  }

  matches.sort((a, b) => b.score - a.score);
  const top = matches.slice(0, MAX_MATCHES);

  const honestNo = !top.some((m) => m.score >= TIER_VERIFY);
  let honestNoExplanation: string | null = null;
  if (honestNo) {
    const adjacent = top.filter((m) => m.tier === "adjacent");
    const adjacentTitles = adjacent
      .map((m) => byId.get(m.opportunityId)?.opportunity.title)
      .filter((t): t is string => !!t)
      .slice(0, 5);
    honestNoExplanation = (
      await complete(
        [
          "A startup was screened against US federal funding opportunities and NO genuine matches were found (no opportunity scored as a real fit).",
          "",
          "COMPANY PROFILE:",
          profileSummary(profile),
          "",
          adjacentTitles.length
            ? `Closest adjacent (weak, ${TIER_ADJACENT}-${TIER_VERIFY - 1} score) programs found: ${adjacentTitles.join("; ")}.`
            : "Not even adjacent programs were found.",
          "",
          "In 3-5 sentences, explain honestly WHY federal funding fit is weak for this company (e.g. consumer market, no federal R&D angle, agency missions don't cover it), and what adjacent federal or state/local/private options might be worth exploring instead. Be direct, not apologetic. Ground your reasoning only in the profile above — do not invent specific programs, dollar amounts, or deadlines.",
        ].join("\n"),
        { system: "You are a candid government-funding advisor. Honesty over helpfulness.", effort: "low" },
      )
    ).trim();
  }

  return { matches: top, honestNo, honestNoExplanation };
}
