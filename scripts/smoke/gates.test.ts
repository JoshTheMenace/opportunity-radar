// Plain tsx test script — no framework. Run: pnpm tsx scripts/smoke/gates.test.ts
// Exits 1 on any failure.

import type { CompanyProfile, Opportunity } from "../../src/lib/types";
import { evaluateGates, meterValueUsd } from "../../src/lib/engine/gates";
import { buildMeter, buildQuestions, formatUsdCompact } from "../../src/lib/engine/meter";
import { deriveFields } from "../../src/lib/engine/profile";
import { sanitizeOpportunity } from "../../src/lib/engine/retrieve";
import { sanitizeProse } from "../../src/lib/engine/rank";

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
  "SBIR all-null => unknown; employees NOT asked (small business implies ≤500)",
  sbirUnknown.verdict === "unknown" &&
    (["majorityUsOwned", "hasActiveRnD"] as const).every((f) =>
      sbirUnknown.missingFields.includes(f),
    ) &&
    !sbirUnknown.missingFields.includes("employees"),
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
assert(
  "SBIR isSmallBusiness=true satisfies employee cap without headcount",
  sbir({ majorityUsOwned: true, hasActiveRnD: true })
    .gates.find((g) => g.gate === "sbir:employees")?.verdict === "pass",
);

// 7. amount_overlap: ceiling under 25% of min need fails; otherwise/missing passes.
const bigNeed = makeProfile({ capitalNeedUsd: { min: 1_000_000, max: 5_000_000 } });
const tiny = evaluateGates(bigNeed, makeOpp({ awardCeilingUsd: 100_000 }));
const okAmt = evaluateGates(bigNeed, makeOpp({ awardCeilingUsd: 300_000 }));
const noAmt = evaluateGates(bigNeed, makeOpp({ awardCeilingUsd: null }));
assert("ceiling < 25% of min need => fail", tiny.verdict === "fail");
assert("ceiling >= 25% of min need => pass", okAmt.verdict === "pass");
assert(
  "missing amounts => soft pass, phrased as 'not published' (never a fake figure)",
  noAmt.gates.find((g) => g.gate === "amount_overlap")?.detail ===
    "award size not published — not held against it",
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

// 9. meterValueUsd fallback chain + realism cap.
assert("meterValue: ceiling wins", meterValueUsd(makeOpp({ awardCeilingUsd: 750_000 })) === 750_000);
assert(
  "meterValue: estimatedTotal/expectedAwards",
  meterValueUsd(makeOpp({ estimatedTotalUsd: 1_000_000, expectedAwards: 4 })) === 250_000,
);
assert(
  "meterValue: absurd program-total ceiling capped at $5M",
  meterValueUsd(makeOpp({ awardCeilingUsd: 108_300_000_000_000 })) === 5_000_000,
);
assert(
  "meterValue: estimated/awards branch also capped",
  meterValueUsd(makeOpp({ estimatedTotalUsd: 7_000_000_000, expectedAwards: 2 })) === 5_000_000,
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
const smallBiz = meter.unlocks.find((u) => u.field === "isSmallBusiness");
assert(
  "unlock chips: only sole-missing-field opportunities count (SBIR opp missing 3 fields => no chip)",
  smallBiz?.unlockUsd === 50_000 &&
    smallBiz.opportunityCount === 1 &&
    meter.unlocks.length === 1 &&
    meter.unlocks.reduce((s, u) => s + u.unlockUsd, 0) <=
      meter.potentialUsd - meter.unlockedUsd,
  meter.unlocks,
);

// 11. buildQuestions: simulated-unlock ranking over gated opportunities.
const gatedAll = [passOpp, gatedSbir, gatedSb];
const qs = buildQuestions(gatedAll, p);
assert("questions: at most 3", qs.length <= 3 && qs.length > 0, qs.length);
assert(
  "questions: shared credit ranks SBIR fields above smaller direct unlock",
  qs[0].field === "majorityUsOwned",
  qs.map((q) => q.field),
);
assert(
  "questions: whyAsking is honest about partial progress",
  qs[0].whyAsking.includes("$275K") && qs[0].whyAsking.includes("one answer closer"),
  qs[0].whyAsking,
);
assert(
  "questions: direct unlock copy on sole-missing-field question",
  buildQuestions([gatedSb], p)[0].whyAsking.includes("directly unlocks up to $50K"),
  buildQuestions([gatedSb], p)[0]?.whyAsking,
);
assert(
  "questions: boolean answerType for ownership",
  qs.find((q) => q.field === "majorityUsOwned")?.answerType === "boolean",
);
const answeredQs = buildQuestions(gatedAll, makeProfile({ isSmallBusiness: true }));
assert(
  "questions: skips fields already answered in profile",
  !answeredQs.some((q) => q.field === "isSmallBusiness"),
  answeredQs.map((q) => q.field),
);

// 11b. Rival-scan borrows: sentinel hygiene, amount asymmetry, SAM lead time, prose sanitizer.
const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
assert(
  "sanitize: $0 ceiling => null (API sentinel for 'not specified')",
  sanitizeOpportunity(makeOpp({ awardCeilingUsd: 0 })).awardCeilingUsd === null,
);
assert(
  "sanitize: $108T program-total ceiling => null",
  sanitizeOpportunity(makeOpp({ awardCeilingUsd: 108_300_000_000_000 })).awardCeilingUsd === null,
);
assert(
  "sanitize: floor above ceiling => floor null (inconsistent source)",
  sanitizeOpportunity(makeOpp({ awardFloorUsd: 900_000, awardCeilingUsd: 500_000 })).awardFloorUsd ===
    null,
);
assert(
  "sanitize: plausible values untouched",
  sanitizeOpportunity(makeOpp({ awardFloorUsd: 50_000, awardCeilingUsd: 750_000 })).awardCeilingUsd ===
    750_000,
);
const bigFloor = evaluateGates(
  makeProfile({ capitalNeedUsd: { min: 250_000, max: 1_000_000 } }),
  makeOpp({ awardFloorUsd: 2_500_000, awardCeilingUsd: 10_000_000 }),
);
assert(
  "amount: floor more than 2x max need => fail (funds larger-scale work)",
  bigFloor.gates.find((g) => g.gate === "amount_overlap")?.verdict === "fail",
  bigFloor.gates.find((g) => g.gate === "amount_overlap"),
);
assert(
  "sam lead time: unregistered + closing in 10 days => fail",
  evaluateGates(makeProfile({ samRegistered: false }), makeOpp({ closeDate: soon }))
    .gates.find((g) => g.gate === "sam:lead_time")?.verdict === "fail",
);
assert(
  "sam lead time: unknown registration + near deadline => unknown(samRegistered)",
  evaluateGates(makeProfile(), makeOpp({ closeDate: soon }))
    .gates.find((g) => g.gate === "sam:lead_time")?.missingField === "samRegistered",
);
assert(
  "sam lead time: no gate when deadline is far or state program",
  evaluateGates(makeProfile(), makeOpp({ closeDate: "2099-12-31" })).gates.every(
    (g) => g.gate !== "sam:lead_time",
  ) &&
    evaluateGates(makeProfile({ samRegistered: false }), makeOpp({ source: "utah", closeDate: soon }))
      .gates.every((g) => g.gate !== "sam:lead_time"),
);
const allowed = [314_363, 2_000_000];
assert(
  "prose sanitizer: unknown dollar figure replaced",
  sanitizeProse("Awards up to $5 million are typical.", allowed) ===
    "Awards up to the listed amount are typical.",
);
assert(
  "prose sanitizer: figures from the data kept (5% rounding tolerance)",
  sanitizeProse("The $314K ceiling fits your $2M ask.", allowed) ===
    "The $314K ceiling fits your $2M ask.",
);
assert(
  "prose sanitizer: non-currency numbers untouched",
  sanitizeProse("Phase II awards 25% more over 24 months.", allowed) ===
    "Phase II awards 25% more over 24 months.",
);

// 12. deriveFields: derive instead of ask.
assert(
  "derive: 12 employees => isSmallBusiness true",
  deriveFields(makeProfile({ employees: 12 })).isSmallBusiness === true,
);
assert(
  "derive: 600 employees => isSmallBusiness false",
  deriveFields(makeProfile({ employees: 600 })).isSmallBusiness === false,
);
assert(
  "derive: <500 heads but $60M revenue => isSmallBusiness stays null (ask)",
  deriveFields(makeProfile({ employees: 12, annualRevenueUsd: 60_000_000 })).isSmallBusiness ===
    null,
);
assert(
  "derive: funding stage implies for-profit",
  deriveFields(makeProfile({ fundingStage: "seed" })).isForProfit === true,
);
assert(
  "derive: explicit answers never overwritten",
  deriveFields(makeProfile({ employees: 12, isSmallBusiness: false })).isSmallBusiness === false,
);

// 13. formatUsdCompact.
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
