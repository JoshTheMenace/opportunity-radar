// ============================================================
// Eligibility meter + interview question builder. Deterministic,
// NO LLM calls, NO network. Consumes GatedOpportunity[] from gates.ts.
//
// Attribution note (simulated unlock): a field's unlockUsd counts only
// opportunities where it is the SOLE missing field — i.e. what answering
// it favorably would actually flip to "pass". Opportunities missing 2+
// fields count toward no chip (so chip sums never exceed
// potentialUsd - unlockedUsd) but DO feed question ranking as shared
// progress at half weight.
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

export const ALL_GATE_FIELDS = Object.keys(TEMPLATES) as GateField[];

interface FieldStat {
  fullUsd: number; // opportunities where this is the ONLY missing field
  fullCount: number;
  sharedUsd: number; // opportunities also missing other fields
  sharedCount: number;
}

/** Per-field simulated unlock: what answering it flips outright vs. advances. */
function fieldStats(unknowns: GatedOpportunity[]): Map<GateField, FieldStat> {
  const stats = new Map<GateField, FieldStat>();
  for (const g of unknowns) {
    for (const field of g.missingFields) {
      const s =
        stats.get(field) ?? { fullUsd: 0, fullCount: 0, sharedUsd: 0, sharedCount: 0 };
      if (g.missingFields.length === 1) {
        s.fullUsd += g.meterValueUsd;
        s.fullCount += 1;
      } else {
        s.sharedUsd += g.meterValueUsd;
        s.sharedCount += 1;
      }
      stats.set(field, s);
    }
  }
  return stats;
}

export function buildMeter(gated: GatedOpportunity[]): EligibilityMeter {
  const passing = gated.filter((g) => g.verdict === "pass");
  const unknowns = gated.filter((g) => g.verdict === "unknown");

  const unlockedUsd = passing.reduce((sum, g) => sum + g.meterValueUsd, 0);
  const potentialUsd = unlockedUsd + unknowns.reduce((sum, g) => sum + g.meterValueUsd, 0);

  const unlocks: MeterUnlock[] = [...fieldStats(unknowns)]
    .filter(([, s]) => s.fullUsd > 0)
    .map(([field, s]) => ({
      field,
      question: TEMPLATES[field].question,
      unlockUsd: s.fullUsd,
      opportunityCount: s.fullCount,
    }))
    .sort((a, b) => b.unlockUsd - a.unlockUsd);

  return { unlockedUsd, unlockedCount: passing.length, potentialUsd, unlocks };
}

/** Is this gate field still unanswered in the profile? */
function fieldUnanswered(profile: CompanyProfile, field: GateField): boolean {
  if (field === "location") return (profile.location?.state ?? null) === null;
  return profile[field] === null;
}

/** Cheaper answers win near-ties: a yes/no costs the founder less than a lookup. */
const EFFORT_WEIGHT: Record<InterviewQuestion["answerType"], number> = {
  boolean: 1,
  choice: 0.95,
  number: 0.9,
  text: 0.85,
};

function programs(n: number): string {
  return n === 1 ? "1 program" : `${n} programs`;
}

/**
 * Pick the top 3 questions by simulated unlock: full unlocks count whole,
 * shared progress (opportunities needing other answers too) counts half,
 * scaled by answer effort. Copy stays honest about direct vs. partial.
 */
export function buildQuestions(
  gated: GatedOpportunity[],
  profile: CompanyProfile,
): InterviewQuestion[] {
  const stats = fieldStats(gated.filter((g) => g.verdict === "unknown"));
  return [...stats]
    .filter(([field]) => fieldUnanswered(profile, field))
    .map(([field, s]) => ({
      field,
      s,
      score:
        (s.fullUsd + 0.5 * s.sharedUsd) * EFFORT_WEIGHT[TEMPLATES[field].answerType],
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ field, s }) => {
      const t = TEMPLATES[field];
      const parts: string[] = [];
      if (s.fullUsd > 0)
        parts.push(
          `directly unlocks up to ${formatUsdCompact(s.fullUsd)} across ${programs(s.fullCount)}`,
        );
      if (s.sharedUsd > 0)
        parts.push(
          `moves ${formatUsdCompact(s.sharedUsd)} across ${programs(s.sharedCount)} one answer closer`,
        );
      return {
        field,
        question: t.question,
        whyAsking: `${t.why} — ${parts.join("; ")}`,
        answerType: t.answerType,
        choices: t.choices,
      };
    });
}
