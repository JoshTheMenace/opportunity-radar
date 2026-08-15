// Future-fit smoke: solvable-vs-structural classification, ordering, caps,
// and the watcher's nowUnlocked transition helper.
// Run: LLM_BACKEND=mock pnpm tsx scripts/smoke/future.smoke.ts

import { classifyFutureFits, nowUnlocked } from "../../src/lib/engine/future";
import type { FutureFit, GateResult, GatedOpportunity, Opportunity } from "../../src/lib/types";

let failed = 0;
function assert(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failed++;
    console.error(`FAIL  ${name}`, detail ?? "");
  }
}

function opp(id: string, over: Partial<Opportunity> = {}): Opportunity {
  return {
    id, source: "grants_gov", kind: "grant", title: `T ${id}`, agency: "A",
    agencyCode: null, description: "d", alnNumbers: [], eligibilityCodes: [],
    eligibilityText: null, openToSmallBusiness: null, awardFloorUsd: null,
    awardCeilingUsd: null, estimatedTotalUsd: null, expectedAwards: null,
    expectedApplications: null, openDate: null, closeDate: null,
    status: "posted", url: null, contactName: null, contactEmail: null, raw: null,
    ...over,
  };
}
const g = (gate: string, verdict: GateResult["verdict"]): GateResult => ({
  gate, verdict, missingField: null, detail: "detail",
});
function gated(id: string, gates: GateResult[], usd = 100_000): GatedOpportunity {
  const verdict = gates.some((x) => x.verdict === "fail")
    ? "fail"
    : gates.some((x) => x.verdict === "unknown")
      ? "unknown"
      : "pass";
  return { opportunity: opp(id, { closeDate: "2026-01-01" }), gates, verdict, missingFields: [], meterValueUsd: usd };
}

const pool: GatedOpportunity[] = [
  // deadline-only fail -> reopens
  gated("a", [g("deadline", "fail"), g("eligibility:small_business", "pass")], 500_000),
  // rnd-only fail -> start_rnd
  gated("b", [g("deadline", "pass"), g("sbir:rnd", "fail")], 300_000),
  // amount-only fail -> amount_mismatch
  gated("c", [g("amount_overlap", "fail")], 200_000),
  // solvable + STRUCTURAL fail -> excluded (geo can't be fixed by waiting)
  gated("d", [g("deadline", "fail"), g("geo:utah", "fail")], 900_000),
  // structural only -> excluded
  gated("e", [g("eligibility:small_business", "fail")], 800_000),
  // passes -> excluded (it's a real match, not a future one)
  gated("f", [g("deadline", "pass")]),
  // unknown -> excluded (interview handles unknowns)
  gated("h", [g("sbir:ownership", "unknown")]),
];

const fits = classifyFutureFits(pool);
assert("classifies exactly the 3 solvable fails", fits.length === 3, fits.map((f) => f.opportunityId));
assert("sorted by dollar value", fits[0].opportunityId === "a" && fits[1].opportunityId === "b" && fits[2].opportunityId === "c");
assert("reasons mapped", fits[0].reason === "reopens" && fits[1].reason === "start_rnd" && fits[2].reason === "amount_mismatch");
assert("structural+solvable mix excluded", !fits.some((f) => f.opportunityId === "d"));
assert("denormalized display fields present", fits.every((f) => f.title && f.agency && f.detail.length > 20));

// cap at 6
const many = classifyFutureFits(
  Array.from({ length: 9 }, (_, i) => gated(`m${i}`, [g("deadline", "fail")], 1000 * (i + 1))),
);
assert("caps at 6", many.length === 6);

// nowUnlocked: only fully-passing entries transition
const saved: FutureFit[] = fits.map((f) => f);
const current = new Map<string, GatedOpportunity>([
  ["a", gated("a", [g("deadline", "pass")])], // reopened -> unlock
  ["b", gated("b", [g("sbir:rnd", "fail")])], // still blocked
  // "c" missing from map -> not unlocked
]);
const unlocked = nowUnlocked(saved, current);
assert("unlocks only the now-passing entry", unlocked.length === 1 && unlocked[0].opportunityId === "a");

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll future-fit tests passed");
