// ============================================================
// Funding-intent lens (deterministic, no LLM, no DB).
// What a founder wants money FOR determines which FundingKind
// genuinely fits — keyword rules over useOfFunds/description/
// milestones, ported from Halda's interest-intent idea.
// ============================================================

import type { CompanyProfile, FundingKind } from "../types";

export type FundingIntent =
  | "rnd"
  | "capacity_scaling"
  | "pilot_deployment"
  | "federal_market_entry"
  | "working_capital"
  | "workforce_training";

interface IntentRule {
  intent: FundingIntent;
  keywords: string[]; // lowercase substrings
  kinds: FundingKind[];
  label: string;
}

const RULES: IntentRule[] = [
  {
    intent: "rnd",
    keywords: ["r&d", "research and development", "research", "product development", "prototype"],
    kinds: ["sbir_sttr", "grant", "cooperative_agreement"],
    label: "fund research & development",
  },
  {
    intent: "capacity_scaling",
    keywords: ["scale manufacturing", "manufacturing capacity", "capacity", "equipment", "facility", "scale up"],
    kinds: ["loan", "grant", "procurement", "tax_credit"],
    label: "scale manufacturing capacity",
  },
  {
    intent: "pilot_deployment",
    keywords: ["pilot", "deployment", "demonstration", "field trial"],
    kinds: ["grant", "cooperative_agreement", "procurement"],
    label: "run pilots and deployments",
  },
  {
    intent: "federal_market_entry",
    keywords: ["federal market", "government customers", "government contracts", "federal contracts"],
    kinds: ["procurement", "sbir_sttr"],
    label: "enter the federal market",
  },
  {
    intent: "working_capital",
    keywords: ["working capital", "runway", "hiring", "payroll", "operating costs"],
    kinds: ["loan", "equity"],
    label: "extend runway and working capital",
  },
  {
    intent: "workforce_training",
    keywords: ["training", "workforce", "upskill", "apprentice"],
    kinds: ["grant", "services"],
    label: "train and grow the workforce",
  },
];

export interface IntentResult {
  primary: FundingIntent;
  all: FundingIntent[];
  preferredKinds: FundingKind[];
  label: string;
}

/** Keyword-rule classification. useOfFunds hits count double (strongest signal). */
export function classifyFundingIntent(profile: CompanyProfile): IntentResult {
  const useOf = (profile.useOfFunds ?? "").toLowerCase();
  const rest = [profile.description, ...profile.milestones].join(" ").toLowerCase();

  const scored = RULES.map((rule) => {
    let score = 0;
    for (const k of rule.keywords) {
      if (useOf.includes(k)) score += 2;
      if (rest.includes(k)) score += 1;
    }
    return { rule, score };
  }).filter((s) => s.score > 0);
  scored.sort((a, b) => b.score - a.score); // stable: ties keep RULES order

  let rules = scored.map((s) => s.rule);
  if (rules.length === 0) {
    // Default: R&D if the company says it does R&D, else working capital.
    const fallback: FundingIntent = profile.hasActiveRnD ? "rnd" : "working_capital";
    rules = [RULES.find((r) => r.intent === fallback)!];
  }

  const preferredKinds = [...new Set(rules.flatMap((r) => r.kinds))];
  return {
    primary: rules[0].intent,
    all: rules.map((r) => r.intent),
    preferredKinds,
    label: rules[0].label,
  };
}

/** One prompt-ready sentence describing the funding intent for the ranker. */
export function intentPromptLine(profile: CompanyProfile): string {
  const { primary, all, preferredKinds, label } = classifyFundingIntent(profile);
  const alsoRnd = all.includes("rnd");
  const caveat =
    primary === "rnd" || alsoRnd
      ? ""
      : " Pure R&D programs fit only if the company also has active R&D.";
  return `Funding intent: ${label} — programs of kind ${preferredKinds.join("/")} serve this need best.${caveat}`;
}
