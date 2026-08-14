// Smoke test: pnpm tsx src/lib/engine/profile.smoke.ts
// Runs extractProfile against the mock LLM backend and checks the merge
// guarantees plus applyAnswer parsing.
process.env.LLM_BACKEND = "mock";

import assert from "node:assert/strict";
import { extractProfile, applyAnswer } from "./profile";

async function main() {
  const founderText =
    "We build AI software that reduces nurse admin burden at rural hospitals. " +
    "8 employees in Provo, Utah, $300k ARR, raised a $1.5M seed.";

  // 1) Mock returns "mock" for description — verbatim guarantee must win.
  const p = await extractProfile(founderText);
  assert.equal(typeof p, "object");
  assert.equal(p.description, founderText, "description must be founder text verbatim");
  assert.ok(Array.isArray(p.govKeywords) && Array.isArray(p.naicsGuesses));

  // 2) Prior (interview answers) override extraction nulls.
  const p2 = await extractProfile(founderText, { employees: 8, samRegistered: true });
  assert.equal(p2.employees, 8);
  assert.equal(p2.samRegistered, true);
  assert.equal(p2.description, founderText);

  // 3) applyAnswer is pure and parses answers.
  const l1 = applyAnswer(p, "location", "Provo, UT");
  assert.deepEqual(l1.location, { city: "Provo", state: "UT" });
  assert.notEqual(l1, p);
  assert.equal(p.location, null, "original profile must be unchanged");
  assert.deepEqual(applyAnswer(p, "location", "utah").location, { city: null, state: "UT" });
  assert.equal(applyAnswer(p, "majorityUsOwned", "yes").majorityUsOwned, true);
  assert.equal(applyAnswer(p, "employees", "42").employees, 42);
  assert.equal(applyAnswer(p, "annualRevenueUsd", "$1.2M").annualRevenueUsd, 1_200_000);
  assert.equal(applyAnswer(p, "isSmallBusiness", false).isSmallBusiness, false);

  console.log("profile.smoke: all assertions passed");
}

main().catch((e) => {
  console.error("profile.smoke FAILED:", e);
  process.exit(1);
});
