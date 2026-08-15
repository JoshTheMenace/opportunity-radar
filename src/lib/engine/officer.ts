// ============================================================
// Program Officer Preview — one-company vs one-opportunity panel
// review. The LLM role-plays the program's senior program officer
// and writes prose + raw scores; snapping to multiples of 5,
// clamping, tier derivation, and list caps all happen HERE.
// ============================================================

import { completeJSON } from "../llm";
import type { CompanyProfile, Opportunity } from "../types";
import { PLAIN_LANGUAGE_RULE } from "./plain-language";

export interface OfficerPreview {
  score: number;
  tier: "Strong Fit" | "Competitive" | "Worth a Shot" | "Long Shot";
  breakdown: {
    technical_merit: number;
    mission_alignment: number;
    stage_readiness: number;
    budget_realism: number;
  };
  strengths: { headline: string; detail: string }[];
  concerns: { headline: string; detail: string }[];
  whatToImprove: { action: string; detail: string }[];
  officerNote: string;
  confidence: number;
  confidenceNote: string;
}

/** Snap to a multiple of 5, clamped to [0, max]. Exported for tests. */
export function snap5(x: unknown, max = 100): number {
  const n = Math.round((Number(x) || 0) / 5) * 5;
  return Math.max(0, Math.min(max, n));
}

/** Deterministic tier from score — never the LLM's call. Exported for tests. */
export function tierForScore(score: number): OfficerPreview["tier"] {
  if (score >= 80) return "Strong Fit";
  if (score >= 60) return "Competitive";
  if (score >= 40) return "Worth a Shot";
  return "Long Shot";
}

function money(n: number | null): string {
  return n == null ? "unspecified" : `$${Math.round(n).toLocaleString("en-US")}`;
}

function profileBlock(p: CompanyProfile): string {
  const loc = p.location ? [p.location.city, p.location.state].filter(Boolean).join(", ") : null;
  return [
    `Description (founder's words): ${p.description}`,
    `Name: ${p.name ?? "unknown"} | Industry: ${p.industry ?? "unknown"}`,
    `Technology keywords: ${p.technologyKeywords.join(", ") || "none"}`,
    `Government-language keywords: ${p.govKeywords.join(", ") || "none"}`,
    `Location: ${loc ?? "unknown"} | Employees: ${p.employees ?? "unknown"} | Revenue: ${p.annualRevenueUsd != null ? money(p.annualRevenueUsd) : "unknown"}`,
    `Stage: ${p.fundingStage ?? "unknown"} | Capital raised: ${p.capitalRaisedUsd != null ? money(p.capitalRaisedUsd) : "unknown"} | Product maturity: ${p.productMaturity ?? "unknown"} | Active R&D: ${p.hasActiveRnD ?? "unknown"}`,
    `For-profit: ${p.isForProfit ?? "unknown"} | Small business: ${p.isSmallBusiness ?? "unknown"} | Majority US-owned: ${p.majorityUsOwned ?? "unknown"} | SAM registered: ${p.samRegistered ?? "unknown"}`,
    `Capital need: ${money(p.capitalNeedUsd.min)} - ${money(p.capitalNeedUsd.max)} | Use of funds: ${p.useOfFunds ?? "unknown"}`,
    `Target customers: ${p.targetCustomers ?? "unknown"}`,
    `Milestones: ${p.milestones.join("; ") || "none stated"}`,
  ].join("\n");
}

function opportunityBlock(o: Opportunity): string {
  const desc = o.description.length > 1500 ? o.description.slice(0, 1500) + "…" : o.description;
  return [
    `title: ${o.title}`,
    `agency: ${o.agency}`,
    `kind: ${o.kind}`,
    `award range: ${money(o.awardFloorUsd)} - ${money(o.awardCeilingUsd)} | estimated total: ${money(o.estimatedTotalUsd)} | expected awards: ${o.expectedAwards ?? "unspecified"}`,
    `deadline: ${o.closeDate ?? "rolling / not stated"} | status: ${o.status}`,
    `eligibility: ${o.eligibilityText ?? "not stated"}`,
    `description: ${desc}`,
  ].join("\n");
}

const pair = (a: string) => ({
  type: "object",
  properties: { [a]: { type: "string" }, detail: { type: "string" } },
  required: [a, "detail"],
  additionalProperties: false,
});

/** Object root; structured-output backends reject array roots. */
export const OFFICER_SCHEMA = {
  type: "object",
  properties: {
    score: { type: "number", minimum: 0, maximum: 100 },
    breakdown: {
      type: "object",
      properties: {
        technical_merit: { type: "number", minimum: 0, maximum: 100 },
        mission_alignment: { type: "number", minimum: 0, maximum: 100 },
        stage_readiness: { type: "number", minimum: 0, maximum: 100 },
        budget_realism: { type: "number", minimum: 0, maximum: 100 },
      },
      required: ["technical_merit", "mission_alignment", "stage_readiness", "budget_realism"],
      additionalProperties: false,
    },
    strengths: { type: "array", items: pair("headline") },
    concerns: { type: "array", items: pair("headline") },
    whatToImprove: { type: "array", items: pair("action") },
    officerNote: { type: "string" },
    confidence: { type: "number", minimum: 0, maximum: 95 },
    confidenceNote: { type: "string" },
  },
  required: [
    "score",
    "breakdown",
    "strengths",
    "concerns",
    "whatToImprove",
    "officerNote",
    "confidence",
    "confidenceNote",
  ],
  additionalProperties: false,
} as const;

/** Raw LLM shape before deterministic post-processing. */
type RawPreview = Omit<OfficerPreview, "tier">;

function cap3<T extends { detail?: unknown }>(xs: T[] | undefined): T[] {
  return Array.isArray(xs) ? xs.slice(0, 3) : [];
}

export async function officerPreview(
  profile: CompanyProfile,
  opp: Opportunity,
): Promise<OfficerPreview> {
  const prompt = [
    `You are a senior program officer at ${opp.agency}, responsible for the program below. You have reviewed hundreds of applications to it. A colleague asks for your honest pre-submission read on one company. ${PLAIN_LANGUAGE_RULE}`,
    "",
    "THE PROGRAM:",
    opportunityBlock(opp),
    "",
    "THE COMPANY:",
    profileBlock(profile),
    "",
    "EVALUATION PROCESS — work through these in order BEFORE scoring:",
    "1. Technical merit: does the company's actual technology and R&D substance match what this program funds?",
    "2. Mission alignment: does the program's stated purpose name work like theirs, or are they merely eligible?",
    "3. Stage readiness: given their maturity, team size, and traction, could they credibly execute a project of this scope?",
    "4. Budget realism: does their capital need overlap the award range, and is the use of funds what this money is for?",
    "5. Only then assign scores.",
    "",
    "SCORING RULES:",
    "- Overall score and each breakdown score: integer 0-100 in MULTIPLES OF 5 (55, 60 — never 57).",
    "- Be calibrated: 80+ means you would genuinely champion this application; 30 means a long shot.",
    "- confidence: integer 0-95 in multiples of 5 — how sure you are of this read given the information provided.",
    "",
    "GROUNDING RULES:",
    "- Use ONLY the program and company data above. Never invent award amounts, deadlines, past performance, or program details.",
    '- Any company field marked "unknown" must NOT be asserted as fact — it lowers your confidence and belongs in concerns.',
    "- Every strength, concern, and improvement must trace to a specific fact above.",
    "",
    "Return JSON with: score; breakdown (technical_merit, mission_alignment, stage_readiness, budget_realism); strengths, concerns, whatToImprove (up to 3 each; headline/action 8-12 words, detail one sentence); officerNote (one paragraph, 4-6 sentences, in your voice as the senior program officer); confidence; confidenceNote (one sentence naming the single main driver of uncertainty).",
  ].join("\n");

  const raw = await completeJSON<RawPreview>(prompt, OFFICER_SCHEMA, {
    system: "You are a candid senior government program officer. Honesty over encouragement.",
    effort: "medium",
  });

  const score = snap5(raw.score);
  const b = raw.breakdown ?? ({} as RawPreview["breakdown"]);
  return {
    score,
    tier: tierForScore(score),
    breakdown: {
      technical_merit: snap5(b.technical_merit),
      mission_alignment: snap5(b.mission_alignment),
      stage_readiness: snap5(b.stage_readiness),
      budget_realism: snap5(b.budget_realism),
    },
    strengths: cap3(raw.strengths),
    concerns: cap3(raw.concerns),
    whatToImprove: cap3(raw.whatToImprove),
    officerNote: raw.officerNote ?? "",
    confidence: snap5(raw.confidence, 95),
    confidenceNote: raw.confidenceNote ?? "",
  };
}
