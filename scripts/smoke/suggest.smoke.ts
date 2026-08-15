// Smoke test: pnpm tsx scripts/smoke/suggest.smoke.ts
// Live check (gpt-5.6-luna): quick replies obey the tuning rules —
// threshold buckets yes, exact-value questions no.

import assert from "node:assert/strict";
import type { InterviewQuestion } from "../../src/lib/types";
import { suggestQuickReplies } from "../../src/lib/engine/suggest";

const questions: InterviewQuestion[] = [
  {
    field: "majorityUsOwned",
    question: "Is your company majority-owned by U.S. citizens or permanent residents?",
    whyAsking: "SBIR/STTR programs require it — moves $232M across 63 programs one answer closer",
    answerType: "boolean",
    choices: null,
  },
  {
    field: "employees",
    question: "How many people work at your company (full-time equivalents)?",
    whyAsking:
      "Small-business programs cap headcount at 500 — moves $232M across 63 programs one answer closer",
    answerType: "number",
    choices: null,
  },
  {
    field: "location",
    question: "Where is your company headquartered (city and state)?",
    whyAsking: "State and regional programs are location-restricted — directly unlocks up to $12M",
    answerType: "text",
    choices: null,
  },
];

async function main() {
  const replies = await suggestQuickReplies(questions);
  console.log("replies:", JSON.stringify(replies, null, 2));

  assert.ok(replies.length >= 1 && replies.length <= 4, "expected 1-4 replies");
  const all = replies.map((r) => `${r.label} ${r.message}`.toLowerCase()).join(" | ");
  assert.ok(
    /fewer than 500|under 500|less than 500|500 or fewer/.test(all),
    "expected a <500 headcount threshold reply",
  );
  assert.ok(
    !replies.some((r) => /\b(provo|salt lake|austin|san francisco|new york)\b/i.test(r.message)),
    "must not invent a city for the location question",
  );
  assert.ok(
    !replies.some((r) => /\b\d{1,3}\b/.test(r.label) && !/500/.test(r.label)),
    "must not suggest exact headcounts",
  );
  for (const r of replies) assert.ok(r.label.length <= 40, `label too long: ${r.label}`);

  console.log("\nQuick-reply smoke passed");
}

void main();
