// Dream researcher smoke: value coercion guards + findings round trip.
// Run: LLM_BACKEND=mock pnpm tsx scripts/smoke/dream.smoke.ts

import { coerceValue } from "../../src/lib/dream/researcher";
import { listDreamFindings, recordDreamFinding } from "../../src/lib/monitor/db";
import { getDb } from "../../src/lib/db";

let failed = 0;
function assert(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`PASS  ${name}`);
  else {
    failed++;
    console.error(`FAIL  ${name}`, detail ?? "");
  }
}

// employees
assert("employees: '45' -> 45", coerceValue("employees", "45") === 45);
assert("employees: '~120' -> 120", coerceValue("employees", "~120") === 120);
assert("employees: 'about fifty' -> null", coerceValue("employees", "about fifty") === null);
assert("employees: '0' rejected", coerceValue("employees", "0") === null);
assert("employees: absurd rejected", coerceValue("employees", "500000") === null);

// money
assert("revenue: '$1.5M' -> 1500000", coerceValue("annualRevenueUsd", "$1.5M") === 1_500_000);
assert("raised: '750k' -> 750000", coerceValue("capitalRaisedUsd", "750k") === 750_000);
assert("revenue: 'undisclosed' -> null", coerceValue("annualRevenueUsd", "undisclosed") === null);

// maturity + booleans + stage
assert("maturity: 'Pilot' -> pilot", coerceValue("productMaturity", "Pilot") === "pilot");
assert("maturity: 'shipping' -> null", coerceValue("productMaturity", "shipping") === null);
assert("sam: 'Yes' -> true", coerceValue("samRegistered", "Yes") === true);
assert("sam: 'unclear' -> null", coerceValue("samRegistered", "unclear") === null);
assert("stage: 'series a' passes", coerceValue("fundingStage", "Series A") === "series a");

// findings round trip against the real DB (cleaned up after)
const db = getDb();
const r = db
  .prepare("INSERT INTO companies (name, profile) VALUES (?, ?)")
  .run("DreamSmokeCo", JSON.stringify({ description: "x" }));
const cid = Number(r.lastInsertRowid);
recordDreamFinding(cid, { identityConfident: false }, true);
const rows = listDreamFindings(cid);
assert("finding recorded + listed", rows.length === 1 && rows[0].dryRun && !rows[0].identityConfident);
db.prepare("DELETE FROM dream_findings WHERE company_id = ?").run(cid);
db.prepare("DELETE FROM companies WHERE id = ?").run(cid);

if (failed) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nAll dream tests passed");
