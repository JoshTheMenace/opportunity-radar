// Plain tsx test script — no framework, no LLM (intent lens is deterministic).
// Run: LLM_BACKEND=mock pnpm tsx scripts/smoke/intent.smoke.ts — exits 1 on failure.

import type { CompanyProfile } from "../../src/lib/types";
import { classifyFundingIntent, intentPromptLine } from "../../src/lib/engine/intent";

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

// 1. Aerospace: capacity scaling + continued R&D both detected.
const aero = classifyFundingIntent(
  makeProfile({
    description: "Aerospace components manufacturer",
    useOfFunds: "scale up manufacturing capacity and fund continued R&D",
    hasActiveRnD: true,
  }),
);
assert(
  "aerospace => capacity_scaling AND rnd present",
  aero.all.includes("capacity_scaling") && aero.all.includes("rnd"),
  aero.all,
);
assert("aerospace primary = capacity_scaling (stronger evidence)", aero.primary === "capacity_scaling", aero);
assert(
  "aerospace preferredKinds include loan + sbir_sttr (union of both intents)",
  aero.preferredKinds.includes("loan") && aero.preferredKinds.includes("sbir_sttr"),
  aero.preferredKinds,
);

// 2. Healthcare: product development + pilots.
const health = classifyFundingIntent(
  makeProfile({
    description: "AI clinical decision support for rural hospitals",
    useOfFunds: "accelerate product development and run pilot programs",
  }),
);
assert(
  "healthcare => rnd + pilot_deployment",
  health.all.includes("rnd") && health.all.includes("pilot_deployment"),
  health.all,
);

// 3. Cybersecurity: R&D + federal market entry.
const cyber = classifyFundingIntent(
  makeProfile({
    description: "Zero-trust cybersecurity platform",
    useOfFunds: "fund R&D and expand into the federal market",
  }),
);
assert(
  "cyber => rnd + federal_market_entry",
  cyber.all.includes("rnd") && cyber.all.includes("federal_market_entry"),
  cyber.all,
);
assert(
  "cyber preferredKinds include procurement",
  cyber.preferredKinds.includes("procurement"),
  cyber.preferredKinds,
);

// 4. Consumer expansion: no R&D words, hasActiveRnD null => must NOT contain rnd.
const consumer = classifyFundingIntent(
  makeProfile({
    description: "Consumer marketplace app for local services",
    useOfFunds: "expand into new metro areas",
    hasActiveRnD: null,
  }),
);
assert("consumer => no rnd intent", !consumer.all.includes("rnd"), consumer.all);
assert("consumer expansion => growth intent", consumer.primary === "growth", consumer);
assert("growth kinds are non-federal-ish", consumer.preferredKinds.includes("loan") && !consumer.preferredKinds.includes("sbir_sttr"), consumer.preferredKinds);

// 5. Default fallback: nothing matches.
const blankRnD = classifyFundingIntent(makeProfile({ hasActiveRnD: true }));
const blankNoRnD = classifyFundingIntent(makeProfile({ hasActiveRnD: null }));
assert("default + hasActiveRnD => rnd", blankRnD.primary === "rnd", blankRnD);
assert("default + no R&D signal => working_capital", blankNoRnD.primary === "working_capital", blankNoRnD);
assert("default result still has kinds + label", blankNoRnD.preferredKinds.length > 0 && blankNoRnD.label.length > 0);

// 6. Prompt line: one sentence, names label + kinds; R&D caveat only when rnd absent.
const line = intentPromptLine(
  makeProfile({ useOfFunds: "buy equipment to scale manufacturing capacity" }),
);
assert(
  "prompt line mentions label and kinds",
  line.startsWith("Funding intent: scale manufacturing capacity") && line.includes("loan/grant/procurement"),
  line,
);
assert("prompt line carries R&D caveat when no rnd intent", line.includes("active R&D"), line);
const rndLine = intentPromptLine(makeProfile({ useOfFunds: "fund R&D" }));
assert("no caveat when intent is rnd", !rndLine.includes("only if"), rndLine);

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll intent tests passed");
