// Smoke test for officer.ts against the mock LLM backend.
// Run: LLM_BACKEND=mock pnpm tsx scripts/smoke/officer.smoke.ts
// Mock completeJSON returns the schema skeleton (numbers -> 0, strings ->
// "mock", arrays -> []), so we assert the deterministic post-processing:
// snapping, clamping, tier derivation, and overall shape.

process.env.LLM_BACKEND = "mock";

import assert from "node:assert";
import type { CompanyProfile, Opportunity } from "../../src/lib/types";
import { officerPreview, snap5, tierForScore } from "../../src/lib/engine/officer";

const profile: CompanyProfile = {
  description: "AI triage software for rural hospital emergency departments.",
  name: "TriageAI",
  industry: "health IT",
  naicsGuesses: ["621999"],
  technologyKeywords: ["machine learning", "clinical decision support"],
  govKeywords: ["health IT", "rural health"],
  location: { city: "Salt Lake City", state: "UT" },
  employees: 8,
  annualRevenueUsd: null,
  capitalRaisedUsd: 500000,
  fundingStage: "seed",
  isForProfit: true,
  isSmallBusiness: true,
  majorityUsOwned: true,
  hasActiveRnD: true,
  productMaturity: "pilot",
  capitalNeedUsd: { min: 250000, max: 1500000 },
  useOfFunds: "clinical validation study",
  targetCustomers: "rural hospitals",
  samRegistered: null,
  milestones: ["pilot at 2 hospitals"],
};

const opp: Opportunity = {
  id: "sbir:TEST-1",
  source: "sbir",
  kind: "sbir_sttr",
  title: "SBIR Phase I: Health IT for Underserved Settings",
  agency: "National Institutes of Health",
  agencyCode: "NIH",
  description: "Funds early-stage R&D on health information technology improving care in underserved and rural settings.",
  alnNumbers: [],
  eligibilityCodes: ["23"],
  eligibilityText: "US small businesses, majority US-owned",
  openToSmallBusiness: true,
  awardFloorUsd: 100000,
  awardCeilingUsd: 300000,
  estimatedTotalUsd: null,
  expectedAwards: 10,
  expectedApplications: null,
  openDate: "2026-01-01",
  closeDate: "2027-01-01",
  status: "posted",
  url: null,
  contactName: null,
  contactEmail: null,
  raw: null,
};

async function main() {
  // Deterministic helpers: snapping + clamping.
  assert.equal(snap5(57), 55);
  assert.equal(snap5(63), 65);
  assert.equal(snap5(102.4), 100);
  assert.equal(snap5(-3), 0);
  assert.equal(snap5("not a number"), 0);
  assert.equal(snap5(97, 95), 95); // confidence clamp

  // Tier derivation thresholds.
  assert.equal(tierForScore(80), "Strong Fit");
  assert.equal(tierForScore(75), "Competitive");
  assert.equal(tierForScore(60), "Competitive");
  assert.equal(tierForScore(55), "Worth a Shot");
  assert.equal(tierForScore(40), "Worth a Shot");
  assert.equal(tierForScore(35), "Long Shot");
  assert.equal(tierForScore(0), "Long Shot");

  // End-to-end against the mock skeleton: zeros + "mock" strings + [] arrays.
  const p = await officerPreview(profile, opp);
  assert.equal(p.score, 0);
  assert.equal(p.tier, "Long Shot"); // derived from score 0, never the LLM's
  for (const v of Object.values(p.breakdown)) {
    assert.equal(typeof v, "number");
    assert.equal(v % 5, 0);
    assert.ok(v >= 0 && v <= 100);
  }
  for (const list of [p.strengths, p.concerns, p.whatToImprove]) {
    assert.ok(Array.isArray(list) && list.length <= 3);
  }
  assert.equal(typeof p.officerNote, "string");
  assert.equal(typeof p.confidenceNote, "string");
  assert.ok(p.confidence >= 0 && p.confidence <= 95 && p.confidence % 5 === 0);

  console.log("officer.smoke: all assertions passed");
  console.log(JSON.stringify({ score: p.score, tier: p.tier, confidence: p.confidence }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
