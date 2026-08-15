// POST /api/reset — wipe all FOUNDER state (same tables as
// scripts/demo-reset.ts), keep the ingested corpus. Backs the profile
// page's "Reset profile & demo" button; the client clears its own
// browser storage after this succeeds.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export const runtime = "nodejs";

const FOUNDER_TABLES = [
  // children before parents (foreign keys)
  "notifications",
  "watch_seen",
  "dream_findings",
  "pursuit_dossier_requirements",
  "pursuit_dossier_sources",
  "pursuit_dossiers",
  "pursuit_tasks",
  "pursuits",
  "companies",
];

export async function POST() {
  const db = getDb();
  const wiped: Record<string, number> = {};
  for (const table of FOUNDER_TABLES) {
    try {
      const n = (db.prepare(`select count(*) n from ${table}`).get() as { n: number }).n;
      db.prepare(`delete from ${table}`).run();
      if (n > 0) wiped[table] = n;
    } catch {
      // table doesn't exist in this DB — nothing to wipe
    }
  }
  return NextResponse.json({ ok: true, wiped });
}
