// Voice session-opening smoke: fresh vs. returning founder turns.
// Run: LLM_BACKEND=mock pnpm tsx scripts/smoke/voice-opening.smoke.ts

import { sessionOpening } from "../../src/lib/voice/opening";
import type { CompanyProfile, MatchReport } from "../../src/lib/types";

let failed = 0;
function assert(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`PASS  ${name}`);
  else { failed++; console.error(`FAIL  ${name}`, detail ?? ""); }
}

const profile: CompanyProfile = {
  description: "Water sensor startup in Provo doing active R&D on municipal leak detection.",
  name: "PipeSense", industry: "water tech", naicsGuesses: [],
  technologyKeywords: ["sensors"], govKeywords: ["water infrastructure"],
  location: { city: "Provo", state: "UT" }, employees: 8, annualRevenueUsd: 400_000,
  capitalRaisedUsd: 1_200_000, fundingStage: "seed", isForProfit: true, isSmallBusiness: true,
  majorityUsOwned: true, hasActiveRnD: true, productMaturity: "prototype",
  capitalNeedUsd: { min: 500_000, max: 2_000_000 }, useOfFunds: "R&D",
  targetCustomers: "municipal water districts", samRegistered: true, milestones: [],
};
const report: MatchReport = {
  profile, matches: [
    { opportunityId: "a", tier: "verify_eligibility", score: 62, whyFit: "", whatCouldDisqualify: "", whatToVerify: "", nextSteps: "" },
    { opportunityId: "b", tier: "likely_fit", score: 81, whyFit: "", whatCouldDisqualify: "", whatToVerify: "", nextSteps: "" },
  ],
  rejected: [], honestNo: false, honestNoExplanation: null,
  meter: { unlockedUsd: 0, unlockedCount: 0, potentialUsd: 0, unlocks: [] }, questions: [],
};

const fresh = sessionOpening(null, null);
assert("fresh visitor gets plain greeting prompt", fresh.includes("Greet them now") && !fresh.includes("RETURNING"));

const back = sessionOpening(profile, report);
assert("returning turn is marked RETURNING", back.includes("RETURNING founder"));
assert("company + location present", back.includes("PipeSense") && back.includes("Provo, UT"));
assert("known facts listed (employees, R&D, SAM)", /8 employees/.test(back) && /active R&D yes/.test(back) && /SAM\.gov registered yes/.test(back));
assert("top match by score in state", /top score 81|score 81/.test(back));
assert("forbids re-asking and re-analyzing", /Do NOT re-ask/i.test(back) && /do NOT call analyze_company/i.test(back));
assert("founder's own words included", back.includes("Water sensor startup in Provo"));

const honest = sessionOpening(profile, { ...report, matches: [], honestNo: true });
assert("honest-no state carried", honest.includes("honest no"));

const noReport = sessionOpening(profile, null);
assert("profile-without-scan says no scan yet", noReport.includes("no scan has run"));

if (failed) { console.error(`\n${failed} failed`); process.exit(1); }
console.log("\nAll voice-opening tests passed");
