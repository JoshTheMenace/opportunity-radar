// The weekly dream cycle: web-research every saved company and refresh
// drift-prone profile facts with full provenance. Run (e.g. weekly cron):
//
//   pnpm tsx scripts/dream.ts               # all saved companies
//   pnpm tsx scripts/dream.ts --dry-run     # research + record, change nothing
//   pnpm tsx scripts/dream.ts --company "PipeSense"
//
// After profile updates land, the standard watch cycle picks up any
// future-fit unlocks ("you grew into it") on its next run — so a company
// that raised a round or crossed a threshold gets the right follow-up
// email without anyone re-typing their profile.

import { listCompanies } from "../src/lib/monitor/db";
import { dreamCompany } from "../src/lib/dream/researcher";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const nameIdx = args.indexOf("--company");
  const only = nameIdx >= 0 ? args[nameIdx + 1] : null;

  let companies = listCompanies();
  if (only) companies = companies.filter((c) => c.name.toLowerCase() === only.toLowerCase());
  if (companies.length === 0) {
    console.log(only ? `No saved company named "${only}".` : "No saved companies to dream about.");
    return;
  }

  console.log(`Dreaming about ${companies.length} compan${companies.length === 1 ? "y" : "ies"}${dryRun ? " (dry run)" : ""}...`);
  let updated = 0;
  for (const c of companies) {
    try {
      const r = await dreamCompany(c, { dryRun });
      const tag = r.identityConfident ? "identity OK" : "IDENTITY UNCERTAIN — no changes";
      console.log(`\n■ ${c.name} — ${tag}`);
      console.log(`  ${r.identityEvidence.slice(0, 160)}`);
      for (const p of r.proposals) {
        console.log(`  proposal [${p.confidence}] ${p.field} -> ${p.newValue}  (${p.sourceUrl.slice(0, 60)})`);
      }
      for (const a of r.applied) {
        console.log(`  APPLIED ${a.field}: ${a.oldValue ?? "unknown"} -> ${a.newValue}`);
        updated++;
      }
      if (r.proposals.length === 0) console.log("  nothing new found");
    } catch (e) {
      console.error(`  ERROR ${c.name}: ${e instanceof Error ? e.message : e}`);
    }
    await sleep(1500); // polite pacing between companies
  }
  console.log(`\nDream cycle done — ${updated} field update${updated === 1 ? "" : "s"} applied.`);
  console.log("Run the watch cycle next to catch future-fit unlocks: pnpm tsx scripts/watch.ts");
}

void main();
