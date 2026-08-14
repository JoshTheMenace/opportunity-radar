// End-to-end proof of the proactive monitoring loop:
//   1. Extract a real profile from eval case 1 (LLM).
//   2. Save it as a monitored company (opt-in with email).
//   3. Watch cycle #1 -> seeds the seen-set silently.
//   4. Inject a fresh tailored opportunity (same as demo-inject).
//   5. Watch cycle #2 -> should produce a notification + drafted email.
//
// Run: pnpm tsx scripts/smoke/monitor-e2e.ts   (uses LLM_BACKEND from env)

import { EVAL_CASES } from "../../eval/cases";
import { extractProfile } from "../../src/lib/engine/profile";
import { localIsoDate } from "../../src/lib/engine/dates";
import { getDb, INSERT_OPPORTUNITY_SQL, opportunityToRow } from "../../src/lib/db";
import type { Opportunity } from "../../src/lib/types";
import { saveCompany, listNotifications } from "../../src/lib/monitor/db";
import { profileCompleteness } from "../../src/lib/monitor/completeness";
import { runWatchCycle } from "../../src/lib/monitor/watcher";

async function main() {
  const c1 = EVAL_CASES.find((c) => c.id === "ai-healthcare")!;
  console.log("1) extracting profile from eval case 1...");
  const profile = await extractProfile(c1.founderInput);
  // The founder text leaves ownership unknown; answer it like the interview would.
  profile.majorityUsOwned = true;
  profile.name = profile.name ?? "Nightingale Health AI";

  const comp = profileCompleteness(profile);
  console.log(`   completeness ${(comp.score * 100).toFixed(0)}%, monitorable=${comp.monitorable}`);
  if (!comp.monitorable) throw new Error(`profile not monitorable: missing ${comp.missing.join(", ")}`);

  console.log("2) saving as monitored company...");
  const company = saveCompany(profile.name!, "josh@mindsmith.ai", profile, true);

  console.log("3) watch cycle (seed or drain)...");
  await runWatchCycle((m) => console.log(`   [watch] ${m}`));

  console.log("4) injecting a fresh tailored opportunity...");
  const inFour = new Date();
  inFour.setMonth(inFour.getMonth() + 4);
  const kw = profile.technologyKeywords.slice(0, 3).join(", ");
  const opp: Opportunity = {
    id: `demo:e2e-${Date.now()}`,
    source: "grants_gov",
    kind: "sbir_sttr",
    title: `FY26 SBIR Phase I: AI Tools to Reduce Clinical Administrative Burden`,
    agency: "National Institutes of Health",
    agencyCode: "HHS-NIH11",
    description:
      `NIH invites SBIR Phase I proposals from US small businesses developing ${kw} to reduce ` +
      `administrative workload for clinical staff, including documentation automation, shift handoff ` +
      `support, and compliance reporting for hospital systems. Awards support proof-of-concept R&D ` +
      `with commercialization potential. Eligible: for-profit US small businesses (<500 employees, majority US-owned).`,
    alnNumbers: ["93.213"],
    eligibilityCodes: ["23"],
    eligibilityText: "For-profit US small businesses under 500 employees, majority US-owned.",
    openToSmallBusiness: true,
    awardFloorUsd: 250000,
    awardCeilingUsd: 314000,
    estimatedTotalUsd: null,
    expectedAwards: 20,
    expectedApplications: 240,
    openDate: localIsoDate(),
    closeDate: localIsoDate(inFour),
    status: "posted",
    url: "https://grants.nih.gov/",
    contactName: "NIH SBIR Program",
    contactEmail: "sbir@nih.gov",
    raw: null,
  };
  getDb().prepare(INSERT_OPPORTUNITY_SQL).run(opportunityToRow(opp));

  console.log("5) watch cycle #2 (should notify)...");
  const result = await runWatchCycle((m) => console.log(`   [watch] ${m}`));

  const notes = listNotifications(company.id, 5);
  const hit = notes.find((n) => n.opportunityId === opp.id);
  if (!hit) {
    console.error("FAIL: no notification for the injected opportunity.");
    console.error("cycle result:", JSON.stringify(result, null, 2));
    process.exit(1);
  }
  console.log(`\nPASS: notification #${hit.id} (${hit.tier}, score ${hit.score})`);
  console.log(`  subject: ${hit.emailSubject}`);
  console.log(`  email body preview:\n${(hit.emailBody ?? "").split("\n").slice(0, 12).join("\n")}`);
  process.exit(0);
}

main().catch((e) => {
  console.error("monitor-e2e failed:", e);
  process.exit(1);
});
