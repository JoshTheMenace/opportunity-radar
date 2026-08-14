// ============================================================
// Eligibility meter + interview question builder. Deterministic,
// NO LLM calls, NO network. Consumes GatedOpportunity[] from gates.ts.
//
// Attribution note: an opportunity with several missing fields counts
// toward EACH field's unlock total (answering any one field moves it
// closer to unlocking), so unlock sums can overlap and exceed
// potentialUsd - unlockedUsd. potentialUsd itself counts every
// unknown opportunity exactly once.
// ============================================================

import type {
  CompanyProfile,
  EligibilityMeter,
  GateField,
  GatedOpportunity,
  InterviewQuestion,
  MeterUnlock,
} from "../types";

/** Compact dollars: $1.2M, $350K, $900. */
export function formatUsdCompact(n: number): string {
  if (n >= 1_000_000) {
    const m = n / 1_000_000;
    const s = m >= 10 ? Math.round(m).toString() : m.toFixed(1).replace(/\.0$/, "");
    return `$${s}M`;
  }
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}

interface QuestionTemplate {
  question: string;
  why: string; // prefix; meter appends "— answering unlocks up to $X across N programs"
  answerType: InterviewQuestion["answerType"];
  choices: string[] | null;
}

const TEMPLATES: Record<GateField, QuestionTemplate> = {
  majorityUsOwned: {
    question: "Is your company majority-owned by U.S. citizens or permanent residents?",
    why: "SBIR/STTR programs require it",
    answerType: "boolean",
    choices: null,
  },
  employees: {
    question: "How many people work at your company (full-time equivalents)?",
    why: "Small-business programs cap headcount at 500",
    answerType: "number",
    choices: null,
  },
  isForProfit: {
    question: "Is your company a for-profit business?",
    why: "Many federal programs restrict applicant type",
    answerType: "boolean",
    choices: null,
  },
  isSmallBusiness: {
    question: "Do you qualify as a small business under SBA size rules (roughly under 500 employees)?",
    why: "Several programs are restricted to small businesses",
    answerType: "boolean",
    choices: null,
  },
  hasActiveRnD: {
    question: "Is your company actively doing research and development?",
    why: "SBIR/STTR specifically funds R&D work",
    answerType: "boolean",
    choices: null,
  },
  annualRevenueUsd: {
    question: "What was your annual revenue last year, in U.S. dollars?",
    why: "Some programs use revenue-based size limits",
    answerType: "number",
    choices: null,
  },
  location: {
    question: "Where is your company headquartered (city and state)?",
    why: "State and regional programs are location-restricted",
    answerType: "text",
    choices: null,
  },
  samRegistered: {
    question: "Is your company registered in SAM.gov?",
    why: "Federal applications require an active SAM registration",
    answerType: "boolean",
    choices: null,
  },
  productMaturity: {
    question: "How mature is your product today?",
    why: "Programs target specific development stages",
    answerType: "choice",
    choices: ["concept", "prototype", "pilot", "in-market"],
  },
};

const ALL_GATE_FIELDS = Object.keys(TEMPLATES) as GateField[];

export function buildMeter(gated: GatedOpportunity[]): EligibilityMeter {
  const passing = gated.filter((g) => g.verdict === "pass");
  const unknowns = gated.filter((g) => g.verdict === "unknown");

  const unlockedUsd = passing.reduce((sum, g) => sum + g.meterValueUsd, 0);
  // Each unknown opportunity counted exactly once here...
  const potentialUsd = unlockedUsd + unknowns.reduce((sum, g) => sum + g.meterValueUsd, 0);

  // ...but may count toward multiple fields below (see attribution note).
  const unlocks: MeterUnlock[] = [];
  for (const field of ALL_GATE_FIELDS) {
    const opps = unknowns.filter((g) => g.missingFields.includes(field));
    if (opps.length === 0) continue;
    unlocks.push({
      field,
      question: TEMPLATES[field].question,
      unlockUsd: opps.reduce((sum, g) => sum + g.meterValueUsd, 0),
      opportunityCount: opps.length,
    });
  }
  unlocks.sort((a, b) => b.unlockUsd - a.unlockUsd);

  return { unlockedUsd, unlockedCount: passing.length, potentialUsd, unlocks };
}

/** Is this gate field still unanswered in the profile? */
function fieldUnanswered(profile: CompanyProfile, field: GateField): boolean {
  if (field === "location") return (profile.location?.state ?? null) === null;
  return profile[field] === null;
}

export function buildQuestions(
  meter: EligibilityMeter,
  profile: CompanyProfile,
): InterviewQuestion[] {
  return meter.unlocks
    .filter((u) => fieldUnanswered(profile, u.field))
    .slice(0, 3)
    .map((u) => {
      const t = TEMPLATES[u.field];
      const programs = u.opportunityCount === 1 ? "1 program" : `${u.opportunityCount} programs`;
      return {
        field: u.field,
        question: t.question,
        whyAsking: `${t.why} — answering unlocks up to ${formatUsdCompact(u.unlockUsd)} across ${programs}`,
        answerType: t.answerType,
        choices: t.choices,
      };
    });
}
