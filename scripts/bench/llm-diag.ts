// Diagnoses the two pipeline bottlenecks:
// 1. Codex app-server concurrency: 8 identical small calls fired at once —
//    completion times reveal how many run in parallel.
// 2. Extraction latency: sol (current, effort medium) vs luna (cheap) A/B
//    on the real extraction schema.
// Run: pnpm tsx scripts/bench/llm-diag.ts

import { complete, completeJSON } from "../../src/lib/llm";
import { PROFILE_SCHEMA } from "../../src/lib/engine/profile";

const s = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

async function main() {
  console.log("1) codex concurrency probe: 8 parallel one-word completions (low effort)");
  const t0 = Date.now();
  await Promise.all(
    Array.from({ length: 8 }, (_, i) =>
      complete(`Reply with exactly one word: ok`, { effort: "low", maxTokens: 10 }).then(() =>
        console.log(`   call ${i + 1} done at ${s(Date.now() - t0)}`),
      ),
    ),
  );
  console.log(`   all done in ${s(Date.now() - t0)}`);

  const founder =
    "We build robotics kits that teach middle school science classes hands-on engineering. Based in Tucson, Arizona, 6 people, doing active R&D, looking for about $400K.";
  const prompt = `Extract a CompanyProfile JSON object from the founder text below. Every field is required; use null when unsupported. description = the text verbatim. location.state as 2-letter code. technologyKeywords 5-10 terms; govKeywords 8-15 federal-vocabulary terms; naicsGuesses up to 3.\n\nFounder text:\n"""\n${founder}\n"""`;

  console.log("\n2) extraction A/B on the real schema");
  for (const [label, opts] of [
    ["sol effort=medium (current)", { effort: "medium" as const, maxTokens: 2000 }],
    ["sol effort=low", { effort: "low" as const, maxTokens: 2000 }],
    ["luna effort=low", { effort: "low" as const, maxTokens: 2000, model: "gpt-5.6-luna" }],
  ] as const) {
    const t = Date.now();
    try {
      const out = await completeJSON<{
        govKeywords: string[];
        location: { state: string | null } | null;
      }>(prompt, PROFILE_SCHEMA, opts);
      console.log(
        `   ${label}: ${s(Date.now() - t)} (state=${out.location?.state}, govKeywords=${out.govKeywords.length}: ${out.govKeywords.slice(0, 4).join(", ")}…)`,
      );
    } catch (e) {
      console.log(`   ${label}: FAILED ${s(Date.now() - t)} — ${(e as Error).message}`);
    }
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
