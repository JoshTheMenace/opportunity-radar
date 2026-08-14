// Smoke test: pnpm tsx scripts/smoke/freeform.smoke.ts
// Live check (default codex backend): one chat message settles several
// gate fields at once, and derivation fills what the answers imply.

import assert from "node:assert/strict";
import type { CompanyProfile } from "../../src/lib/types";
import { applyFreeformAnswer } from "../../src/lib/engine/profile";

const base: CompanyProfile = {
  description: "We build AI software that reduces nurse admin burden at rural hospitals.",
  name: "TestCo",
  industry: "healthcare AI",
  naicsGuesses: [],
  technologyKeywords: ["ai"],
  govKeywords: ["health information technology"],
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

async function main() {
  const { profile, answered } = await applyFreeformAnswer(
    base,
    "We're a team of 12 based in Provo, Utah. The company is fully owned by US " +
      "citizens, we registered on SAM.gov last year, and we run an active R&D program.",
  );
  console.log("answered:", answered);

  assert.equal(profile.employees, 12);
  assert.equal(profile.location?.state, "UT");
  assert.equal(profile.majorityUsOwned, true);
  assert.equal(profile.samRegistered, true);
  assert.equal(profile.hasActiveRnD, true);
  assert.equal(profile.isSmallBusiness, true, "derived from employees=12");
  assert.equal(profile.annualRevenueUsd, null, "not mentioned — must stay null");
  assert.equal(profile.productMaturity, null, "not mentioned — must stay null");
  assert.ok(answered.length >= 5, `expected >=5 recorded facts, got ${answered.length}`);

  // A message answering nothing must change nothing.
  const noop = await applyFreeformAnswer(base, "Thanks, sounds good!");
  assert.deepEqual(noop.answered, []);
  assert.deepEqual(noop.profile, base);

  console.log("\nFreeform answer smoke passed");
}

void main();
