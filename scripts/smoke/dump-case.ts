// Prompt-tuning aid: run one eval case through the pipeline and print a
// compact match table (score, tier, kind, title) + honestNo. Usage:
//   pnpm tsx scripts/smoke/dump-case.ts youth-marketplace
import { getCase } from "../../eval/cases";
import { getHeldoutCase } from "../../eval/cases-heldout";
import { runAnalysis } from "../../src/lib/engine/pipeline";
import { getOpportunityById } from "../../src/lib/engine/retrieve";

async function main() {
  const id = process.argv[2] ?? "youth-marketplace";
  const c = getCase(id) ?? getHeldoutCase(id);
  if (!c) throw new Error(`unknown case ${id}`);
  const report = await runAnalysis(c.founderInput);
  console.log(`honestNo=${report.honestNo} matches=${report.matches.length}`);
  if (report.honestNoExplanation) console.log(`explanation: ${report.honestNoExplanation}\n`);
  for (const m of report.matches) {
    const o = getOpportunityById(m.opportunityId);
    console.log(
      `${String(m.score).padStart(3)}  ${m.tier.padEnd(18)} ${(o?.kind ?? "?").padEnd(12)} [${o?.agency?.slice(0, 32) ?? "?"}] ${o?.title?.slice(0, 60) ?? m.opportunityId}`,
    );
    if (m.score >= 50) console.log(`     whyFit: ${m.whyFit}`);
  }
}

main().then(() => process.exit(0), (e) => { console.error(e); process.exit(1); });
