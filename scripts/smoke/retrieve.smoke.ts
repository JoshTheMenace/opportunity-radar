// Smoke test for retrieve.ts. getDb() uses the fixed data/radar.db path,
// so we insert 5 clearly-marked "smoke:" rows into the real DB, run the
// retrieval functions, then delete the smoke rows (FTS cleaned by trigger).
// Run: pnpm tsx scripts/smoke/retrieve.smoke.ts

import { getDb, INSERT_OPPORTUNITY_SQL, opportunityToRow } from "../../src/lib/db";
import type { CompanyProfile, Opportunity } from "../../src/lib/types";
import { retrieveCandidates, getOpportunityById, countBySource } from "../../src/lib/engine/retrieve";

const base: Omit<Opportunity, "id" | "source" | "kind" | "title" | "agency" | "description"> = {
  agencyCode: null,
  alnNumbers: [],
  eligibilityCodes: ["23"],
  eligibilityText: null,
  openToSmallBusiness: true,
  awardFloorUsd: null,
  awardCeilingUsd: 250000,
  estimatedTotalUsd: null,
  expectedAwards: null,
  expectedApplications: null,
  openDate: "2026-08-01",
  closeDate: "2026-11-01",
  status: "posted",
  url: null,
  contactName: null,
  contactEmail: null,
  raw: null,
};

const fakes: Opportunity[] = [
  { ...base, id: "smoke:1", source: "grants_gov", kind: "grant", title: "Remote patient monitoring innovation grant", agency: "HHS", description: "Funding for health IT and remote patient monitoring platforms." },
  { ...base, id: "smoke:2", source: "grants_gov", kind: "grant", title: "Advanced manufacturing pilot", agency: "DOE", description: "Aerospace composites and advanced manufacturing pilots." },
  { ...base, id: "smoke:3", source: "sbir", kind: "sbir_sttr", title: "SBIR Phase I: AI diagnostics", agency: "NIH", description: "Small business R&D on AI-driven diagnostics." },
  { ...base, id: "smoke:4", source: "utah", kind: "services", title: "Utah rural business accelerator", agency: "GOEO", description: "State services for Utah startups." },
  { ...base, id: "smoke:5", source: "assistance_listing", kind: "grant", title: "Water reuse infrastructure", agency: "EPA", description: "Water technology and reuse infrastructure assistance." },
];

const profile: CompanyProfile = {
  description: "We build a remote patient monitoring platform.",
  name: "SmokeCo",
  industry: "digital health",
  naicsGuesses: [],
  technologyKeywords: ["remote patient monitoring", "AI diagnostics"],
  govKeywords: ["health IT"],
  location: { city: "Provo", state: "UT" },
  employees: 8,
  annualRevenueUsd: null,
  capitalRaisedUsd: null,
  fundingStage: "seed",
  isForProfit: true,
  isSmallBusiness: true,
  majorityUsOwned: true,
  hasActiveRnD: null, // !== false, so sbir_sttr union should apply
  productMaturity: "pilot",
  capitalNeedUsd: { min: null, max: null },
  useOfFunds: null,
  targetCustomers: null,
  samRegistered: null,
  milestones: [],
};

function assert(cond: boolean, label: string) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}`);
  if (!cond) process.exitCode = 1;
}

const db = getDb();
const insert = db.prepare(INSERT_OPPORTUNITY_SQL);
try {
  for (const f of fakes) insert.run(opportunityToRow(f));

  const ids = retrieveCandidates(profile).map((o) => o.id);
  const smoke = ids.filter((id) => id.startsWith("smoke:"));
  console.log("retrieved smoke ids:", smoke);

  assert(smoke.includes("smoke:1"), "FTS match on tech keyword (health IT / monitoring)");
  assert(smoke.includes("smoke:3"), "sbir_sttr always unioned when hasActiveRnD !== false");
  assert(smoke.includes("smoke:4"), "utah source always unioned");
  assert(smoke.indexOf("smoke:1") < smoke.indexOf("smoke:4"), "FTS hits ranked before union-only rows");
  assert(new Set(ids).size === ids.length, "no duplicate ids");

  const noRnD = retrieveCandidates({ ...profile, hasActiveRnD: false, technologyKeywords: [], govKeywords: [], industry: null }).map((o) => o.id);
  assert(!noRnD.includes("smoke:3"), "sbir_sttr excluded when hasActiveRnD === false");
  assert(noRnD.includes("smoke:4"), "utah still included with zero keywords");

  const weird = retrieveCandidates({ ...profile, technologyKeywords: ['patient* "(monitoring)" platforms:'], govKeywords: [], industry: null }).map((o) => o.id);
  assert(weird.includes("smoke:1"), "fts5 special chars sanitized, still matches");

  assert(getOpportunityById("smoke:2")?.title === "Advanced manufacturing pilot", "getOpportunityById round-trips");
  assert(getOpportunityById("smoke:nope") === null, "getOpportunityById returns null for missing id");

  const counts = countBySource();
  console.log("countBySource:", counts);
  assert((counts["utah"] ?? 0) >= 1, "countBySource sees utah row");
} finally {
  db.prepare(`DELETE FROM opportunities WHERE id LIKE 'smoke:%'`).run();
  const left = db.prepare(`SELECT COUNT(*) AS n FROM opportunities WHERE id LIKE 'smoke:%'`).get() as { n: number };
  console.log(`cleanup: ${left.n} smoke rows remain`);
}
