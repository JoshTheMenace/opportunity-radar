// Smoke test for the evidence module.
//   pnpm tsx src/lib/engine/evidence.smoke.ts               -> cache-only (no network)
//   RUN_NETWORK=1 pnpm tsx src/lib/engine/evidence.smoke.ts -> live API calls
// Cache-only mode seeds evidence_cache rows for every key getEvidence
// will read, verifies the bundle is built purely from cache, then
// deletes the seeded rows so real requests never see fake data.

import { getDb } from "../db";
import { getEvidence, evidenceCacheKeys } from "./evidence";
import type { CompanyProfile, Opportunity } from "../types";

const opp: Opportunity = {
  id: "grants_gov:smoke-1",
  source: "grants_gov",
  kind: "grant",
  title: "Smoke Test Opportunity",
  agency: "Department of Health and Human Services",
  agencyCode: "HHS",
  description: "Fake opportunity for the evidence smoke test.",
  alnNumbers: ["93.310"],
  eligibilityCodes: ["23"],
  eligibilityText: null,
  openToSmallBusiness: true,
  awardFloorUsd: null,
  awardCeilingUsd: 500_000,
  estimatedTotalUsd: null,
  expectedAwards: null,
  expectedApplications: null,
  openDate: null,
  closeDate: null,
  status: "posted",
  url: null,
  contactName: null,
  contactEmail: null,
  raw: null,
};

const profile: CompanyProfile = {
  description: "Utah digital-health startup doing remote patient monitoring.",
  name: "Smoke Health",
  industry: "digital health",
  naicsGuesses: ["621999"],
  technologyKeywords: ["remote monitoring", "digital health", "machine learning"],
  govKeywords: ["health IT"],
  location: { city: "Provo", state: "UT" },
  employees: 8,
  annualRevenueUsd: 200_000,
  capitalRaisedUsd: 1_000_000,
  fundingStage: "seed",
  isForProfit: true,
  isSmallBusiness: true,
  majorityUsOwned: true,
  hasActiveRnD: true,
  productMaturity: "pilot",
  capitalNeedUsd: { min: 250_000, max: 1_500_000 },
  useOfFunds: "R&D and pilots",
  targetCustomers: "rural clinics",
  samRegistered: null,
  milestones: [],
};

function seedPayloadFor(key: string): unknown {
  if (key.startsWith("usaspending:")) {
    return {
      results: [
        {
          "Recipient Name": "SEEDED CACHE CO",
          "Award Amount": 123_456,
          "Start Date": "2025-01-15",
          Description: "Seeded cache row (not a real award).",
          generated_internal_id: "ASST_NON_SEEDED",
        },
      ],
      page_metadata: { hasNext: false },
    };
  }
  if (key.startsWith("nih:")) {
    return {
      results: [
        {
          organization: { org_name: "SEEDED NIH ORG", org_city: "Provo" },
          award_amount: 999_999,
          activity_code: "R44",
          abstract_text: "Seeded NIH abstract. ".repeat(60), // >100 words
        },
      ],
    };
  }
  if (key.startsWith("nsf:")) {
    return {
      response: {
        award: [
          {
            awardeeName: "SEEDED NSF ORG",
            awardeeCity: "Lehi",
            fundsObligatedAmt: "275000",
            abstractText: "Seeded NSF abstract.",
          },
        ],
      },
    };
  }
  throw new Error(`Unexpected cache key: ${key}`);
}

async function main() {
  if (process.env.RUN_NETWORK === "1") {
    console.log("Live network mode...");
    const ev = await getEvidence(opp, profile);
    console.log(JSON.stringify(ev, null, 2));
    console.log(
      `alnStats=${ev.alnStats ? "ok" : "null"} similar=${ev.similarAwards.length} nearby=${ev.nearbyWinners.length}`,
    );
    return;
  }

  console.log("Cache-only mode (no network)...");
  const db = getDb();
  const keys = evidenceCacheKeys(opp, profile);
  const put = db.prepare(
    "INSERT OR REPLACE INTO evidence_cache (key, payload, fetched_at) VALUES (?, ?, ?)",
  );
  for (const key of keys)
    put.run(key, JSON.stringify(seedPayloadFor(key)), new Date().toISOString());

  try {
    const ev = await getEvidence(opp, profile);
    console.log(JSON.stringify(ev, null, 2));
    const checks: Array<[string, boolean]> = [
      ["alnStats from cache", ev.alnStats?.totalAwards === 1],
      ["alnStats median", ev.alnStats?.medianUsd === 123_456],
      ["alnStats utahCount", ev.alnStats?.utahCount === 1],
      ["similarAwards from cache", ev.similarAwards.length === 1],
      [
        "similarAwards link",
        ev.similarAwards[0]?.link ===
          "https://www.usaspending.gov/award/ASST_NON_SEEDED",
      ],
      ["nearbyWinners merged (NIH+NSF)", ev.nearbyWinners.length === 2],
      [
        "abstract truncated to 100 words",
        (ev.nearbyWinners[0]?.abstract100.split(/\s+/).length ?? 0) <= 101,
      ],
    ];
    let ok = true;
    for (const [name, pass] of checks) {
      console.log(`${pass ? "PASS" : "FAIL"}: ${name}`);
      if (!pass) ok = false;
    }
    if (!ok) process.exitCode = 1;
  } finally {
    const del = db.prepare("DELETE FROM evidence_cache WHERE key = ?");
    for (const key of keys) del.run(key);
  }
}

main().catch((err) => {
  console.error("Smoke test crashed:", err);
  process.exitCode = 1;
});
