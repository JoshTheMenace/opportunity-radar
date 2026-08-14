// Smoke test for rank.ts against the mock LLM backend.
// Run: pnpm tsx src/lib/engine/rank.smoke.ts
// Mock completeJSON returns the schema skeleton (top-level array -> []),
// so zero matches come back and the honest-no path must fire.

process.env.LLM_BACKEND = "mock";

import assert from "node:assert";
import type { CompanyProfile, GatedOpportunity, Opportunity } from "../types";
import { rankOpportunities, tierFor } from "./rank";

const profile: CompanyProfile = {
  description: "Consumer marketplace app for teens to trade sneakers.",
  name: "KickSwap",
  industry: "consumer marketplace",
  naicsGuesses: ["454110"],
  technologyKeywords: ["mobile app", "marketplace"],
  govKeywords: [],
  location: { city: "Provo", state: "UT" },
  employees: 4,
  annualRevenueUsd: 50000,
  capitalRaisedUsd: 200000,
  fundingStage: "seed",
  isForProfit: true,
  isSmallBusiness: true,
  majorityUsOwned: null,
  hasActiveRnD: false,
  productMaturity: "in-market",
  capitalNeedUsd: { min: 250000, max: 1000000 },
  useOfFunds: "marketing and hiring",
  targetCustomers: "US teenagers",
  samRegistered: null,
  milestones: [],
};

function opp(id: string, closeDate: string | null): Opportunity {
  return {
    id,
    source: "grants_gov",
    kind: "grant",
    title: `Test opportunity ${id}`,
    agency: "Test Agency",
    agencyCode: null,
    description: "x".repeat(700), // exercises truncation
    alnNumbers: [],
    eligibilityCodes: ["99"],
    eligibilityText: null,
    openToSmallBusiness: true,
    awardFloorUsd: 50000,
    awardCeilingUsd: 250000,
    estimatedTotalUsd: null,
    expectedAwards: null,
    expectedApplications: null,
    openDate: "2026-01-01",
    closeDate,
    status: "posted",
    url: null,
    contactName: null,
    contactEmail: null,
    raw: null,
  };
}

function gated(id: string, verdict: "pass" | "unknown", closeDate: string | null): GatedOpportunity {
  return {
    opportunity: opp(id, closeDate),
    gates: verdict === "unknown"
      ? [{ gate: "sbir:us_ownership", verdict: "unknown", missingField: "majorityUsOwned", detail: "Requires >50% US ownership" }]
      : [],
    verdict,
    missingFields: verdict === "unknown" ? ["majorityUsOwned"] : [],
    meterValueUsd: 250000,
  };
}

async function main() {
  // Pure tier mapping.
  assert.equal(tierFor(85, "pass"), "likely_fit");
  assert.equal(tierFor(85, "unknown"), "verify_eligibility");
  assert.equal(tierFor(60, "pass"), "verify_eligibility");
  assert.equal(tierFor(40, "pass"), "adjacent");
  assert.equal(tierFor(10, "pass"), "not_a_fit");

  // Honest-no path with mock backend (empty array from skeleton).
  const input = [gated("grants_gov:1", "pass", "2027-01-01"), gated("grants_gov:2", "unknown", "2020-01-01")];
  const result = await rankOpportunities(profile, input);
  assert.equal(result.matches.length, 0, "mock skeleton should yield zero matches");
  assert.equal(result.honestNo, true, "honestNo must be true with zero matches >= 50");
  assert.ok(
    typeof result.honestNoExplanation === "string" && result.honestNoExplanation.length > 0,
    "honestNoExplanation must be generated on honest-no",
  );

  // Empty input also takes the honest-no path without any completeJSON calls.
  const empty = await rankOpportunities(profile, []);
  assert.equal(empty.honestNo, true);
  assert.ok(empty.honestNoExplanation);

  console.log("rank.smoke: all assertions passed");
  console.log(JSON.stringify({ honestNo: result.honestNo, explanation: result.honestNoExplanation }, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
