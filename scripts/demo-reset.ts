// Demo reset — wipe all FOUNDER state, keep the ingested corpus.
// Run before any demo so the app opens clean: no saved companies (and no
// real email addresses on screen), no notifications, no pursuits, no
// half-finished plans from test runs.
//
//   pnpm tsx scripts/demo-reset.ts            # wipe founder state
//   pnpm tsx scripts/demo-reset.ts --keep-pursuits
//
// Corpus tables (opportunities, utah_*, evidence_cache, ingest_meta) are
// untouched. The browser keeps its own state too — the script prints the
// one-liner to clear it.

import { getDb } from "../src/lib/db";

const keepPursuits = process.argv.includes("--keep-pursuits");

const db = getDb();

/** Delete every row of a table that exists; quietly skip ones that don't. */
function wipe(table: string): number {
  try {
    const n = (db.prepare(`select count(*) n from ${table}`).get() as { n: number }).n;
    db.prepare(`delete from ${table}`).run();
    return n;
  } catch {
    return 0;
  }
}

const wiped: Record<string, number> = {};

// Order matters for foreign keys: children first.
wiped.notifications = wipe("notifications");
wiped.watch_seen = wipe("watch_seen");
wiped.dream_findings = wipe("dream_findings");
if (!keepPursuits) {
  wiped.pursuit_dossier_requirements = wipe("pursuit_dossier_requirements");
  wiped.pursuit_dossier_sources = wipe("pursuit_dossier_sources");
  wiped.pursuit_dossiers = wipe("pursuit_dossiers");
  wiped.pursuit_tasks = wipe("pursuit_tasks");
  wiped.pursuits = wipe("pursuits");
}
wiped.companies = wipe("companies");

console.log("Demo reset — founder state wiped (corpus untouched):");
for (const [table, n] of Object.entries(wiped)) {
  if (n > 0) console.log(`  ${table}: ${n} row${n === 1 ? "" : "s"} deleted`);
}
if (Object.values(wiped).every((n) => n === 0)) console.log("  (already clean)");

console.log(`
Browser state — run this once in the devtools console (or use a fresh
private window):

  sessionStorage.clear(); localStorage.removeItem("or:profileEdits"); location.reload()
`);
