// Investigation: which profile fields actually decide eligibility across the
// whole corpus, and how many dollars each unknown holds hostage? Output
// informs REQUIRED_FIELDS in src/lib/engine/readiness.ts.
// Run: pnpm tsx scripts/investigate-readiness.ts

import { getDb, rowToOpportunity } from "../src/lib/db";
import { evaluateGates } from "../src/lib/engine/gates";
import type { CompanyProfile, GateField, Opportunity } from "../src/lib/types";

const blank: CompanyProfile = {
  description: "x",
  name: null,
  industry: null,
  naicsGuesses: [],
  technologyKeywords: [],
  govKeywords: [],
  location: null,
  employees: null,
  annualRevenueUsd: null,
  capitalRaisedUsd: null,
  fundingStage: null,
  isForProfit: null,
  isSmallBusiness: null,
  majorityUsOwned: null,
  hasActiveRnD: null,
  productMaturity: null,
  capitalNeedUsd: { min: null, max: null },
  useOfFunds: null,
  targetCustomers: null,
  samRegistered: null,
  milestones: [],
};

const opps = (
  getDb().prepare("SELECT * FROM opportunities").all() as Record<string, unknown>[]
).map(rowToOpportunity);

const fmtM = (n: number) => `$${(n / 1e6).toFixed(0)}M`;

// 1) All-unknown baseline: which fields gate how much?
const perField = new Map<GateField, { count: number; usd: number }>();
let unknownCount = 0;
let unknownUsd = 0;
let passCount = 0;
let passUsd = 0;
let openCount = 0;
for (const o of opps) {
  const g = evaluateGates(blank, o);
  if (g.gates.some((x) => x.gate === "deadline" && x.verdict === "fail")) continue; // dead
  openCount++;
  if (g.verdict === "unknown") {
    unknownCount++;
    unknownUsd += g.meterValueUsd;
    for (const f of g.missingFields) {
      const e = perField.get(f) ?? { count: 0, usd: 0 };
      e.count++;
      e.usd += g.meterValueUsd;
      perField.set(f, e);
    }
  } else if (g.verdict === "pass") {
    passCount++;
    passUsd += g.meterValueUsd;
  }
}
console.log(`open opportunities: ${openCount}`);
console.log(
  `all-unknown profile → pass ${passCount} (${fmtM(passUsd)}), unknown-gated ${unknownCount} (${fmtM(unknownUsd)})\n`,
);
console.log("field → opportunities gated | dollars held hostage (share of unknown-gated $)");
for (const [f, e] of [...perField.entries()].sort((a, b) => b[1].usd - a[1].usd)) {
  console.log(
    `  ${f.padEnd(16)} ${String(e.count).padStart(5)} | ${fmtM(e.usd).padStart(8)} (${((e.usd / unknownUsd) * 100).toFixed(0)}%)`,
  );
}

// 2) Collapse risk of capitalNeedUsd: unknown passes softly, but once known it
// can FAIL amount_overlap. Measure for typical asks.
console.log("\ncapitalNeedUsd collapse risk (opps passing while unknown that FAIL once need is known):");
for (const needMin of [100_000, 250_000, 500_000, 1_000_000, 2_000_000]) {
  let flips = 0;
  let flipUsd = 0;
  const withNeed: CompanyProfile = { ...blank, capitalNeedUsd: { min: needMin, max: null } };
  for (const o of opps) {
    const before = evaluateGates(blank, o);
    if (before.gates.some((x) => x.gate === "deadline" && x.verdict === "fail")) continue;
    if (before.verdict === "fail") continue;
    const after = evaluateGates(withNeed, o);
    if (after.gates.some((x) => x.gate === "amount_overlap" && x.verdict === "fail")) {
      flips++;
      flipUsd += before.meterValueUsd;
    }
  }
  console.log(
    `  min need $${(needMin / 1000).toFixed(0)}K → ${flips} opportunities flip to fail (${fmtM(flipUsd)} vanishes from the meter)`,
  );
}

// 3) Required-set coverage: what share of unknown-gated dollars do candidate
// sets resolve?
const SETS: GateField[][] = [
  ["isForProfit"],
  ["isForProfit", "isSmallBusiness"],
  ["isForProfit", "isSmallBusiness", "location"],
  ["isForProfit", "isSmallBusiness", "location", "hasActiveRnD", "majorityUsOwned", "employees"],
];
console.log("\nrequired-set coverage of unknown-gated dollars:");
for (const set of SETS) {
  let resolvedUsd = 0;
  for (const o of opps) {
    const g = evaluateGates(blank, o);
    if (g.gates.some((x) => x.gate === "deadline" && x.verdict === "fail")) continue;
    if (g.verdict !== "unknown") continue;
    if (g.missingFields.every((f) => set.includes(f))) resolvedUsd += g.meterValueUsd;
  }
  console.log(
    `  {${set.join(", ")}} → resolves ${((resolvedUsd / unknownUsd) * 100).toFixed(1)}% of unknown-gated dollars`,
  );
}

process.exit(0);
