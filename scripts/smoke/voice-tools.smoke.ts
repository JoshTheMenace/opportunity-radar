// Smoke: voice tool executor loads under tsx (alias imports) and hits the DB.
// No LLM needed for these paths. Run: pnpm tsx scripts/smoke/voice-tools.smoke.ts

import { executeVoiceTool } from "../../src/lib/voice/execute";

async function main() {
  const search = await executeVoiceTool(
    "search_opportunities",
    { query: "water reuse", limit: 2 },
    null,
  );
  const rows = search.result as { id: string; title: string }[];
  console.log(`search_opportunities: ${rows.length} rows, first = ${rows[0]?.id}`);

  const detail = await executeVoiceTool("get_opportunity", { id: rows[0]?.id ?? "" }, null);
  console.log(`get_opportunity: ${(detail.result as { title?: string }).title ?? "MISSING"}`);

  const bad = await executeVoiceTool("get_opportunity", { id: "nope:0" }, null);
  console.log(`bad id → ${JSON.stringify(bad.result)}`);

  const noProfile = await executeVoiceTool(
    "answer_question",
    { field: "employees", answer: "12" },
    null,
  );
  console.log(`answer without profile → ${JSON.stringify(noProfile.result)}`);

  const unknown = await executeVoiceTool("frobnicate", {}, null);
  console.log(`unknown tool → ${JSON.stringify(unknown.result)}`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
