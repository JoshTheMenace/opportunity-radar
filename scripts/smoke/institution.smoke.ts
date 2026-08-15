// Institution-gate smoke: the hard-fail tier only fires on unambiguous
// prose; business escapes and machine-readable codes always win.
// Run: LLM_BACKEND=mock pnpm tsx scripts/smoke/institution.smoke.ts

import { evaluateGates } from "../../src/lib/engine/gates";
import type { CompanyProfile, Opportunity } from "../../src/lib/types";

let failed = 0;
function assert(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`PASS  ${name}`);
  else { failed++; console.error(`FAIL  ${name}`, detail ?? ""); }
}

const profile: CompanyProfile = {
  description: "startup", name: "X", industry: "tech", naicsGuesses: [],
  technologyKeywords: ["software"], govKeywords: [], location: { city: null, state: "UT" },
  employees: 10, annualRevenueUsd: 1e6, capitalRaisedUsd: null, fundingStage: null,
  isForProfit: true, isSmallBusiness: true, majorityUsOwned: true, hasActiveRnD: true,
  productMaturity: "pilot", capitalNeedUsd: { min: null, max: null }, useOfFunds: null,
  targetCustomers: null, samRegistered: true, milestones: [],
};

function opp(eligibilityText: string | null, over: Partial<Opportunity> = {}): Opportunity {
  return {
    id: "grants_gov:t", source: "grants_gov", kind: "grant", title: "T", agency: "A",
    agencyCode: null, description: "d", alnNumbers: [], eligibilityCodes: [],
    eligibilityText, openToSmallBusiness: null, awardFloorUsd: null, awardCeilingUsd: null,
    estimatedTotalUsd: null, expectedAwards: null, expectedApplications: null,
    openDate: null, closeDate: null, status: "posted", url: null,
    contactName: null, contactEmail: null, raw: null, ...over,
  };
}
const hard = (o: Opportunity) =>
  evaluateGates(profile, o).gates.find((g) => g.gate === "eligibility:institution_hard");

assert("land-grant only => hard fail",
  hard(opp("This program supports land-grant universities conducting extension work."))?.verdict === "fail");
assert("'must be a state entity or university' => hard fail",
  hard(opp("To be eligible an applicant must be a state entity or university with cyber training experience."))?.verdict === "fail");
assert("'eligible applicants are institutions of higher education' => hard fail",
  hard(opp("Eligible applicants are institutions of higher education accredited in the US."))?.verdict === "fail");
assert("business escape hatch => no hard fail",
  hard(opp("Eligible applicants are institutions of higher education and small business concerns.")) === undefined);
assert("institution-flavored without limiter => no hard fail (demote-tier handles it)",
  hard(opp("Universities and nonprofit organizations frequently apply to this program.")) === undefined);
assert("business-friendly codes skip prose entirely",
  hard(opp("Eligibility is limited to institutions of higher education.", { eligibilityCodes: ["23"] })) === undefined);
assert("no prose => no gate", hard(opp(null)) === undefined);

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log("\nAll institution-gate tests passed");
