// ============================================================
// Ranking readiness: the minimum profile facts required before
// we run (and show) the expensive LLM ranking. Without them the
// numbers are inflated and collapse as answers arrive.
//
// The set is DATA-DERIVED (scripts/investigate-readiness.ts,
// run 2026-08-15 against 4,594 open opportunities):
//   - capitalNeedUsd: the amount gate passes SOFTLY while need is
//     unknown — at a $1M ask, 326 "passing" opportunities flip to
//     fail once known ($104M vanishes). The #1 inflation source.
//   - hasActiveRnD + majorityUsOwned + employees: the SBIR trio
//     gates 63 opportunities / $86M (35% of unknown-gated dollars);
//     a "no" subtracts the whole SBIR set.
//   - location.state: gates Utah's 24 programs ($12M) and any
//     future state-restricted sources.
//   - isSmallBusiness (or employees, which derives it): gates
//     small-business-restricted programs ($8M) + SBIR size.
// The remaining unknown-gated dollars (~57%) are "eligibility not
// machine-readable" — no answer can resolve them; they surface as
// verify_eligibility, which is honest.
// ============================================================

import type { CompanyProfile, GateField } from "../types";

export interface ReadinessItem {
  key: string;
  /** Short human label for "we still need…" lists. */
  label: string;
  /** How to ask it in conversation. */
  question: string;
  known: (p: CompanyProfile) => boolean;
}

export const READINESS_REQUIREMENTS: ReadinessItem[] = [
  {
    key: "capitalNeed",
    label: "how much funding you're looking for",
    question: "Roughly how much funding are you looking for?",
    known: (p) => p.capitalNeedUsd.min != null || p.capitalNeedUsd.max != null,
  },
  {
    key: "location",
    label: "where you're based (state)",
    question: "Where is the company based — which city and state?",
    known: (p) => p.location?.state != null,
  },
  {
    key: "size",
    label: "team size (or small-business status)",
    question: "How many people work at the company?",
    known: (p) => p.employees != null || p.isSmallBusiness != null,
  },
  {
    key: "hasActiveRnD",
    label: "whether you do active R&D",
    question: "Are you actively doing research and development?",
    known: (p) => p.hasActiveRnD != null,
  },
  {
    key: "majorityUsOwned",
    label: "whether you're majority US-owned",
    question: "Is the company majority-owned by US citizens or permanent residents?",
    known: (p) => p.majorityUsOwned != null,
  },
];

export interface Readiness {
  ready: boolean;
  /** Requirements still unmet, in ask-first order. */
  missing: ReadinessItem[];
  knownCount: number;
  requiredCount: number;
}

export function profileReadiness(p: CompanyProfile): Readiness {
  const missing = READINESS_REQUIREMENTS.filter((r) => !r.known(p));
  return {
    ready: missing.length === 0,
    missing,
    knownCount: READINESS_REQUIREMENTS.length - missing.length,
    requiredCount: READINESS_REQUIREMENTS.length,
  };
}

/** Gate fields backing the readiness set — used to sort interview questions
 *  so required answers come first. (capitalNeed has no GateField; it's asked
 *  via freeform/voice.) */
const REQUIRED_GATE_FIELDS: GateField[] = [
  "location",
  "employees",
  "isSmallBusiness",
  "hasActiveRnD",
  "majorityUsOwned",
];

export function isRequiredField(field: GateField): boolean {
  return REQUIRED_GATE_FIELDS.includes(field);
}

/** Required-for-ranking questions first, original order otherwise. */
export function sortQuestionsRequiredFirst<T extends { field: GateField }>(qs: T[]): T[] {
  return [...qs].sort(
    (a, b) => Number(isRequiredField(b.field)) - Number(isRequiredField(a.field)),
  );
}
