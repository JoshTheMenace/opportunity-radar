// "Filled out enough" — the gate for standing monitoring. The required
// fields are exactly what the interview loop naturally collects, so
// answering unlock questions is the path to switching monitoring on.

import type { CompanyProfile } from "../types";

export interface Completeness {
  score: number; // 0-1
  monitorable: boolean; // all required fields present
  missing: string[]; // human-readable field names still needed
}

export function profileCompleteness(p: CompanyProfile): Completeness {
  const required: Array<[string, boolean]> = [
    ["company description", (p.description ?? "").trim().length >= 20],
    ["technology keywords", p.technologyKeywords.length >= 3],
    ["state / location", p.location?.state != null],
    ["for-profit status", p.isForProfit != null],
    ["small-business status", p.isSmallBusiness != null],
  ];
  const optional: Array<[string, boolean]> = [
    ["employee count", p.employees != null],
    ["capital need", p.capitalNeedUsd.min != null || p.capitalNeedUsd.max != null],
    ["R&D activity", p.hasActiveRnD != null],
    ["US ownership", p.majorityUsOwned != null],
    ["revenue", p.annualRevenueUsd != null],
  ];
  const all = [...required, ...optional];
  const score = all.filter(([, ok]) => ok).length / all.length;
  const missing = required.filter(([, ok]) => !ok).map(([name]) => name);
  return { score, monitorable: missing.length === 0, missing };
}
