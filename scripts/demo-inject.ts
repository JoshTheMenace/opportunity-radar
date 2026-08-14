// Stage the live Radar moment: inject a realistic "just posted" opportunity
// tailored to the first monitored company, then run one watch cycle so the
// notification + drafted email appear in the Radar feed within seconds.
//
//   pnpm tsx scripts/demo-inject.ts
//
// The injected row is clearly marked (id prefix "demo:") and can be removed
// with: pnpm tsx scripts/demo-inject.ts --clean

import { getDb, INSERT_OPPORTUNITY_SQL, opportunityToRow } from "../src/lib/db";
import type { Opportunity } from "../src/lib/types";
import { listCompanies } from "../src/lib/monitor/db";
import { runWatchCycle } from "../src/lib/monitor/watcher";
import { localIsoDate } from "../src/lib/engine/dates";

const db = getDb();

if (process.argv.includes("--clean")) {
  const n = db.prepare("DELETE FROM opportunities WHERE id LIKE 'demo:%'").run().changes;
  db.prepare("DELETE FROM watch_seen WHERE opportunity_id LIKE 'demo:%'").run();
  db.prepare("DELETE FROM notifications WHERE opportunity_id LIKE 'demo:%'").run();
  console.log(`removed ${n} demo opportunities (+ watch/notification rows)`);
  process.exit(0);
}

const companies = listCompanies(true);
if (companies.length === 0) {
  console.error("No monitored companies — save a profile first (home page → Save & monitor).");
  process.exit(1);
}
const target = companies[0];
const kw = target.profile.technologyKeywords.slice(0, 3).join(", ") || "advanced technology";
const gov = target.profile.govKeywords.slice(0, 4).join(", ") || "innovation";

const inFourMonths = new Date();
inFourMonths.setMonth(inFourMonths.getMonth() + 4);

const opp: Opportunity = {
  id: `demo:${Date.now()}`,
  source: "grants_gov",
  kind: "sbir_sttr",
  title: `FY26 SBIR Phase I: ${kw.split(",")[0]?.trim() ?? "Emerging Technology"} for Public-Sector Impact`,
  agency: "National Science Foundation",
  agencyCode: "NSF",
  description:
    `The National Science Foundation invites Small Business Innovation Research (SBIR) Phase I proposals ` +
    `from US small businesses developing ${kw}. This solicitation prioritizes commercially promising ` +
    `technology addressing ${gov}. Phase I awards support proof-of-concept R&D with commercialization potential. ` +
    `Eligible applicants are for-profit US small businesses (<500 employees, majority US-owned).`,
  alnNumbers: ["47.041"],
  eligibilityCodes: ["23"],
  eligibilityText: "For-profit US small businesses under 500 employees, majority US-owned.",
  openToSmallBusiness: true,
  awardFloorUsd: 275000,
  awardCeilingUsd: 305000,
  estimatedTotalUsd: null,
  expectedAwards: 25,
  expectedApplications: 300,
  openDate: localIsoDate(),
  closeDate: localIsoDate(inFourMonths),
  status: "posted",
  url: "https://seedfund.nsf.gov/",
  contactName: "NSF Seed Fund Team",
  contactEmail: "seedfund@nsf.gov",
  raw: null,
};

db.prepare(INSERT_OPPORTUNITY_SQL).run(opportunityToRow(opp));
console.log(`Injected "${opp.title}" (tailored to ${target.name}). Running watch cycle...`);

runWatchCycle((m) => console.log(`[watch] ${m}`)).then((r) => {
  console.log(
    r.notifications.length > 0
      ? `🔔 ${r.notifications.length} notification(s) created — check /radar and data/outbox/`
      : "No notifications created (check gates/profile — the injected opp should have matched).",
  );
  process.exit(0);
});
