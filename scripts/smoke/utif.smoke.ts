// UTIF special-case smoke: qualification gates, injection, and the DB row.
// Run: LLM_BACKEND=mock pnpm tsx scripts/smoke/utif.smoke.ts

import { UTIF_ID, UTIF_SCORE, injectUtif, utifMatch, utifQualifies } from "../../src/lib/engine/utif";
import { getOpportunityById } from "../../src/lib/engine/retrieve";
import type { CompanyProfile, RankedMatch } from "../../src/lib/types";

let failed = 0;
function assert(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failed++;
    console.error(`FAIL  ${name}`, detail ?? "");
  }
}

const base: CompanyProfile = {
  description: "x", name: null, industry: null, naicsGuesses: [],
  technologyKeywords: [], govKeywords: [], location: { city: "Provo", state: "UT" },
  employees: 10, annualRevenueUsd: 500_000, capitalRaisedUsd: null,
  fundingStage: null, isForProfit: true, isSmallBusiness: true,
  majorityUsOwned: true, hasActiveRnD: true, productMaturity: null,
  capitalNeedUsd: { min: null, max: null }, useOfFunds: null,
  targetCustomers: null, samRegistered: null, milestones: [],
};

assert("qualifies: UT small business with R&D", utifQualifies(base));
assert("rejects: out of state", !utifQualifies({ ...base, location: { city: null, state: "CO" } }));
assert("rejects: no location", !utifQualifies({ ...base, location: null }));
assert("rejects: no active R&D", !utifQualifies({ ...base, hasActiveRnD: null }));
assert("rejects: not small business", !utifQualifies({ ...base, isSmallBusiness: null }));
assert("rejects: nonprofit", !utifQualifies({ ...base, isForProfit: false }));

const m = utifMatch();
assert("match is likely_fit at deterministic score", m.tier === "likely_fit" && m.score === UTIF_SCORE);
assert("prose states the $3,000-$5,000 range", m.whyFit.includes("$3,000-$5,000"));
assert("first-time condition is surfaced", /first/i.test(m.whatCouldDisqualify) && /first/i.test(m.whatToVerify));

const others: RankedMatch[] = [
  { opportunityId: "a", tier: "likely_fit", score: 95, whyFit: "", whatCouldDisqualify: "", whatToVerify: "", nextSteps: "" },
  { opportunityId: UTIF_ID, tier: "adjacent", score: 40, whyFit: "llm read", whatCouldDisqualify: "", whatToVerify: "", nextSteps: "" },
  { opportunityId: "b", tier: "verify_eligibility", score: 60, whyFit: "", whatCouldDisqualify: "", whatToVerify: "", nextSteps: "" },
];
const injected = injectUtif(others, base, false);
assert("replaces the LLM's row exactly once", injected.filter((x) => x.opportunityId === UTIF_ID).length === 1);
assert("deterministic card wins over LLM read", injected.find((x) => x.opportunityId === UTIF_ID)?.score === UTIF_SCORE);
assert("score order kept", injected[0].opportunityId === "a" && injected[1].opportunityId === UTIF_ID);
assert("no-op on honest no", injectUtif(others, base, true) === others);
assert("no-op when unqualified", injectUtif(others, { ...base, hasActiveRnD: null }, false) === others);

const row = getOpportunityById(UTIF_ID);
assert("DB row ingested", row != null, "run: pnpm tsx scripts/ingest/utah.ts");
assert("DB row is rolling + open", row?.closeDate === null && row?.status === "open");
assert("DB award range 3k-5k", row?.awardFloorUsd === 3000 && row?.awardCeilingUsd === 5000);

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll UTIF tests passed");
