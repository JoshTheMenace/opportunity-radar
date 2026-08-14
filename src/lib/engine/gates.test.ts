// Plain tsx test script — no framework. Run: pnpm tsx src/lib/engine/gates.test.ts
// Exits 1 on any failure.

import type { CompanyProfile, Opportunity } from "../types";
import { evaluateGates, meterValueUsd } from "./gates";
import { buildMeter, buildQuestions, formatUsdCompact } from "./meter";

let failures = 0;
function assert(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    console.log(`ok   ${name}`);
  } else {
    failures++;
    console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : "");
  }
}

function makeProfile(over: Partial<CompanyProfile> = {}): CompanyProfile {
  return {
    description: "test co",
    name: "TestCo",
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
    ...over,
  };
}

function makeOpp(over: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "grants_gov:1",
    source: "grants_gov",
    kind: "grant",
    title: "Test Grant",
    agency: "Test Agency",
    agencyCode: null,
    description: "desc",
    alnNumbers: [],
    eligibilityCodes: ["99"],
    eligibilityText: null,
    openToSmallBusiness: null,
    awardFloorUsd: null,
    awardCeilingUsd: null,
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
    ...over,
  };
}

const p = makeProfile();

// 1. Expired deadline fails.
const expired = evaluateGates(p, makeOpp({ closeDate: "2020-01-01" }));
assert("expired closeDate => fail", expired.verdict === "fail", expired.gates);

// 2. Future/rolling deadlines pass.
const future = evaluateGates(p, makeOpp({ closeDate: "2099-12-31" }));
const rolling = evaluateGates(p, makeOpp({ closeDate: null }));
assert(
  "future + rolling closeDate => deadline passes",
  future.gates.find((g) => g.gate === "deadline")?.verdict === "pass" &&
    rolling.gates.find((g) => g.gate === "deadline")?.verdict === "pass",
);

// 3. grants_gov codes exclude for-profits: fail when for-profit, unknown when null.
const govOnly = makeOpp({ eligibilityCodes: ["01", "02"] });
const fpFail = evaluateGates(makeProfile({ isForProfit: true }), govOnly);
const fpUnknown = evaluateGates(makeProfile({ isForProfit: null }), govOnly);
assert("govt-only codes + for-profit => fail", fpFail.verdict === "fail", fpFail.gates);
assert(
  "govt-only codes + unknown for-profit => unknown(isForProfit)",
  fpUnknown.verdict === "unknown" && fpUnknown.missingFields.includes("isForProfit"),
  fpUnknown.missingFields,
);

// 4. Empty eligibility codes => unknown with missingField null.
const noCodes = evaluateGates(p, makeOpp({ eligibilityCodes: [] }));
const fpGate = noCodes.gates.find((g) => g.gate === "eligibility:for_profit");
assert(
  "empty codes => unknown, missingField null, verify detail",
  noCodes.verdict === "unknown" &&
    fpGate?.verdict === "unknown" &&
    fpGate.missingField === null &&
    fpGate.detail.includes("verify"),
  fpGate,
);

// 5. Small-business-only program, size status unknown => unknown(isSmallBusiness).
const sbOnly = makeOpp({ eligibilityCodes: ["23"] });
const sbUnknown = evaluateGates(makeProfile({ isSmallBusiness: null }), sbOnly);
assert(
  "codes [23] + unknown size => unknown(isSmallBusiness)",
  sbUnknown.verdict === "unknown" && sbUnknown.missingFields.includes("isSmallBusiness"),
  sbUnknown.missingFields,
);
const sbClosed = evaluateGates(p, makeOpp({ openToSmallBusiness: false }));
assert("openToSmallBusiness=false => fail", sbClosed.verdict === "fail");

// 6. SBIR gates: ownership, employees, R&D.
const sbir = (over: Partial<CompanyProfile>) =>
  evaluateGates(
    makeProfile({ isForProfit: true, isSmallBusiness: true, ...over }),
    makeOpp({ kind: "sbir_sttr", eligibilityCodes: ["23"] }),
  );
assert("SBIR foreign-owned => fail", sbir({ majorityUsOwned: false }).verdict === "fail");
const sbirUnknown = sbir({});
assert(
  "SBIR all-null => unknown with 3 missing fields",
  sbirUnknown.verdict === "unknown" &&
    (["majorityUsOwned", "employees", "hasActiveRnD"] as const).every((f) =>
      sbirUnknown.missingFields.includes(f),
    ),
  sbirUnknown.missingFields,
);
assert(
  "SBIR 600 employees => fail",
  sbir({ majorityUsOwned: true, employees: 600, hasActiveRnD: true }).verdict === "fail",
);
assert(
  "SBIR clean profile => pass",
  sbir({ majorityUsOwned: true, employees: 12, hasActiveRnD: true }).verdict === "pass",
);

// 7. amount_overlap: ceiling under 25% of min need fails; otherwise/missing passes.
const bigNeed = makeProfile({ capitalNeedUsd: { min: 1_000_000, max: 5_000_000 } });
const tiny = evaluateGates(bigNeed, makeOpp({ awardCeilingUsd: 100_000 }));
const okAmt = evaluateGates(bigNeed, makeOpp({ awardCeilingUsd: 300_000 }));
const noAmt = evaluateGates(bigNeed, makeOpp({ awardCeilingUsd: null }));
assert("ceiling < 25% of min need => fail", tiny.verdict === "fail");
assert("ceiling >= 25% of min need => pass", okAmt.verdict === "pass");
assert(
  "missing amounts => pass with 'award size unverified'",
  noAmt.gates.find((g) => g.gate === "amount_overlap")?.detail === "award size unverified",
);

// 8. geo:utah — case-insensitive state match; null location => unknown.
const utOpp = makeOpp({ source: "utah" });
const inUtah = evaluateGates(makeProfile({ location: { city: "Provo", state: "ut" } }), utOpp);
const inCa = evaluateGates(makeProfile({ location: { city: "SF", state: "CA" } }), utOpp);
const noWhere = evaluateGates(makeProfile({ location: null }), utOpp);
assert("utah source + state 'ut' => geo pass", inUtah.verdict === "pass", inUtah.gates);
assert("utah source + CA => fail", inCa.verdict === "fail");
assert(
  "utah source + no location => unknown(location)",
  noWhere.verdict === "unknown" && noWhere.missingFields.includes("location"),
);

// 9. meterValueUsd fallback chain.
assert("meterValue: ceiling wins", meterValueUsd(makeOpp({ awardCeilingUsd: 750_000 })) === 750_000);
assert(
  "meterValue: estimatedTotal/expectedAwards",
  meterValueUsd(makeOpp({ estimatedTotalUsd: 1_000_000, expectedAwards: 4 })) === 250_000,
);
assert("meterValue: grant default 250K", meterValueUsd(makeOpp()) === 250_000);
assert(
  "meterValue: sbir default 275K",
  meterValueUsd(makeOpp({ kind: "sbir_sttr" })) === 275_000,
);

// 10. buildMeter aggregation (overlapping missing fields, unknowns counted once).
const passOpp = evaluateGates(
  makeProfile({ isForProfit: true }),
  makeOpp({ awardCeilingUsd: 100_000 }),
);
const gatedSbir = sbirUnknown; // unknown, 3 missing fields, $275K
const gatedSb = evaluateGates(p, makeOpp({ eligibilityCodes: ["23"], awardCeilingUsd: 50_000 }));
const meter = buildMeter([passOpp, gatedSbir, gatedSb]);
assert("meter.unlockedUsd", meter.unlockedUsd === 100_000, meter);
assert("meter.unlockedCount", meter.unlockedCount === 1);
assert(
  "meter.potentialUsd counts each unknown once",
  meter.potentialUsd === 100_000 + 275_000 + 50_000,
  meter.potentialUsd,
);
const owned = meter.unlocks.find((u) => u.field === "majorityUsOwned");
const rnd = meter.unlocks.find((u) => u.field === "hasActiveRnD");
const smallBiz = meter.unlocks.find((u) => u.field === "isSmallBusiness");
assert(
  "unlock sums: SBIR opp counts toward multiple fields (overlap ok), sb opp toward isSmallBusiness",
  owned?.unlockUsd === 275_000 &&
    owned.opportunityCount === 1 &&
    rnd?.unlockUsd === 275_000 &&
    smallBiz?.unlockUsd === 50_000 &&
    smallBiz.opportunityCount === 1,
  meter.unlocks,
);
assert(
  "unlocks sorted by unlockUsd desc",
  meter.unlocks.every((u, i, a) => i === 0 || a[i - 1].unlockUsd >= u.unlockUsd),
);

// 11. buildQuestions: top 3, phrased, skips already-answered fields.
const qs = buildQuestions(meter, p);
assert("questions: at most 3", qs.length <= 3 && qs.length > 0, qs.length);
assert("questions: top unlock first", qs[0].field === "majorityUsOwned", qs[0]);
assert(
  "questions: whyAsking has compact $ and program count",
  qs[0].whyAsking.includes("$275K") && qs[0].whyAsking.includes("1 program"),
  qs[0].whyAsking,
);
assert(
  "questions: boolean answerType for ownership",
  qs.find((q) => q.field === "majorityUsOwned")?.answerType === "boolean",
);
const answeredQs = buildQuestions(meter, makeProfile({ isSmallBusiness: true }));
assert(
  "questions: skips fields already answered in profile",
  !answeredQs.some((q) => q.field === "isSmallBusiness"),
  answeredQs.map((q) => q.field),
);

// 12. formatUsdCompact.
assert(
  "formatUsdCompact",
  formatUsdCompact(1_200_000) === "$1.2M" &&
    formatUsdCompact(350_000) === "$350K" &&
    formatUsdCompact(2_000_000) === "$2M" &&
    formatUsdCompact(900) === "$900",
  [formatUsdCompact(1_200_000), formatUsdCompact(350_000), formatUsdCompact(2_000_000)],
);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll gate/meter tests passed");
