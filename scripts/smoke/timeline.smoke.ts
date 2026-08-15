// Plain tsx test script — no framework. Run: pnpm tsx scripts/smoke/timeline.smoke.ts
// Deterministic (fixed `today`); exits 1 on any failure.

import type { CompanyProfile, Opportunity } from "../../src/lib/types";
import { buildTimeline, oddsLabel } from "../../src/lib/engine/timeline";

let failures = 0;
function assert(name: string, cond: boolean, extra?: unknown) {
  if (cond) {
    console.log(`ok   ${name}`);
  } else {
    failures++;
    console.error(`FAIL ${name}`, extra !== undefined ? JSON.stringify(extra) : "");
  }
}

const TODAY = "2026-08-15";

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

// 1. Far-out close date: all four steps, work-back dates, sorted ascending.
const far = buildTimeline(makeOpp({ closeDate: "2026-12-01" }), p, TODAY);
assert("far close: 4 steps (SAM included)", far.length === 4, far.length);
assert(
  "far close: work-back dues (close-42/-21/-14/-3)",
  far.map((s) => s.due).join(",") === "2026-10-20,2026-11-10,2026-11-17,2026-11-28",
  far.map((s) => s.due),
);
assert(
  "far close: order SAM -> workspace -> draft -> submit",
  far[0].title.includes("SAM") &&
    far[1].title.includes("Grants.gov") &&
    far[2].title.includes("draft") &&
    far[3].title.includes("Submit"),
  far.map((s) => s.title),
);
assert("far close: nothing urgent yet", far.every((s) => !s.urgent), far);

// 2. samRegistered === true omits the SAM step; false/null keep it.
const noSam = buildTimeline(
  makeOpp({ closeDate: "2026-12-01" }),
  makeProfile({ samRegistered: true }),
  TODAY,
);
assert("samRegistered=true: SAM step omitted", !noSam.some((s) => s.title.includes("SAM")), noSam);
assert("samRegistered=true: 3 steps remain", noSam.length === 3);
const samFalse = buildTimeline(
  makeOpp({ closeDate: "2026-12-01" }),
  makeProfile({ samRegistered: false }),
  TODAY,
);
assert("samRegistered=false: SAM step present", samFalse.some((s) => s.title.includes("SAM")));

// 3. Close < 42 days away: SAM due snaps to today with "start immediately".
const soon = buildTimeline(makeOpp({ closeDate: "2026-09-10" }), p, TODAY); // 26 days out
const samStep = soon.find((s) => s.title.includes("SAM"))!;
assert("soon close: SAM due = today", samStep.due === TODAY, samStep);
assert(
  "soon close: SAM detail says start immediately",
  samStep.detail.includes("start immediately") && samStep.detail.includes("2-6 weeks"),
  samStep.detail,
);
assert("soon close: SAM urgent", samStep.urgent);
assert("soon close: SAM sorts first", soon[0].title.includes("SAM"), soon.map((s) => s.due));

// 4. Urgent flags: within 14 days (or past) of today.
const draft = soon.find((s) => s.title.includes("draft"))!; // due 2026-08-27 (12d out)
const submit = soon.find((s) => s.title.includes("Submit"))!; // due 2026-09-07 (23d out)
assert("urgent: draft within 14d => urgent", draft.urgent, draft);
assert("urgent: submit 23d out => not urgent", !submit.urgent, submit);
const past = buildTimeline(makeOpp({ closeDate: "2026-08-20" }), p, TODAY);
assert("urgent: past-due steps flagged urgent", past.every((s) => s.urgent), past);

// 5. Rolling (closeDate null): same steps, due null, "start when ready" phrasing.
const rolling = buildTimeline(makeOpp({ closeDate: null }), p, TODAY);
assert("rolling: 4 steps, all due null", rolling.length === 4 && rolling.every((s) => s.due === null), rolling);
assert(
  "rolling: details say start when ready",
  rolling.every((s) => s.detail.includes("rolling — start when ready")),
  rolling.map((s) => s.detail),
);
assert("rolling: SAM still first", rolling[0].title.includes("SAM"));
assert("rolling: nothing urgent", rolling.every((s) => !s.urgent));
const rollingNoSam = buildTimeline(
  makeOpp({ closeDate: null }),
  makeProfile({ samRegistered: true }),
  TODAY,
);
assert("rolling + samRegistered: SAM omitted", !rollingNoSam.some((s) => s.title.includes("SAM")));

// 6. Grants.gov workspace step only for grant/coop/sbir kinds.
const proc = buildTimeline(makeOpp({ kind: "procurement", closeDate: "2026-12-01" }), p, TODAY);
assert("procurement: no Grants.gov step", !proc.some((s) => s.title.includes("Grants.gov")), proc);
const sbir = buildTimeline(makeOpp({ kind: "sbir_sttr", closeDate: "2026-12-01" }), p, TODAY);
assert("sbir_sttr: Grants.gov step present", sbir.some((s) => s.title.includes("Grants.gov")));

// 7. oddsLabel bands (both numbers).
assert("odds: null awards => null", oddsLabel(null, 100) === null);
assert("odds: null applications falls back to awards-only", oddsLabel(23, null) !== null);
assert(
  "odds: >=50% => strong",
  oddsLabel(60, 100)!.startsWith("strong odds") && oddsLabel(60, 100)!.includes("1-in-2"),
  oddsLabel(60, 100),
);
assert(
  "odds: >=20% => good target",
  oddsLabel(25, 100)!.includes("good target"),
  oddsLabel(25, 100),
);
assert(
  "odds: >=8% => competitive with concrete numbers",
  oddsLabel(11, 100) === "competitive — roughly 1-in-9 (11 awards / ~100 applicants)",
  oddsLabel(11, 100),
);
assert(
  "odds: <8% => long shot",
  oddsLabel(3, 100)!.includes("long shot") && oddsLabel(3, 100)!.includes("strong story"),
  oddsLabel(3, 100),
);

// 8. oddsLabel awards-only bands.
assert(
  "odds: 23 awards => many awards",
  oddsLabel(23, null) === "many awards given — good odds (23 expected awards)",
  oddsLabel(23, null),
);
assert("odds: 7 awards => a real shot", oddsLabel(7, null)!.includes("a real shot"), oddsLabel(7, null));
assert(
  "odds: 2 awards => selective",
  oddsLabel(2, null)!.includes("few awards — selective"),
  oddsLabel(2, null),
);
assert("odds: 1 award singular", oddsLabel(1, null)!.includes("1 expected award)"), oddsLabel(1, null));

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll timeline/odds tests passed");
