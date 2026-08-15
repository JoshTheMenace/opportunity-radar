// GET /api/dream — everything the dream dashboard shows: schedule, per-run
// findings with full provenance, and roll-up stats. Read-only.

import { NextResponse } from "next/server";
import { listCompanies, listDreamFindings } from "@/lib/monitor/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Next Monday 03:04 local — mirrors the scheduled task's cron (0 3 * * 1,
 *  which the scheduler registered as 03:04). Kept here so the dashboard
 *  never claims a time the scheduler doesn't. */
function nextRunAt(now = new Date()): string {
  const d = new Date(now);
  d.setHours(3, 4, 0, 0);
  const day = d.getDay(); // 0 Sun .. 1 Mon
  let add = (1 - day + 7) % 7;
  if (add === 0 && d <= now) add = 7;
  d.setDate(d.getDate() + add);
  return d.toISOString();
}

export async function GET() {
  const companies = listCompanies();
  const names = new Map(companies.map((c) => [c.id, c.name]));
  const findings = listDreamFindings(undefined, 40).map((f) => ({
    id: f.id,
    companyName: names.get(f.companyId) ?? `company #${f.companyId}`,
    runAt: f.runAt,
    dryRun: f.dryRun,
    identityConfident: f.identityConfident,
    // result is the stored DreamResult verbatim (proposals/applied/sources)
    result: f.result as {
      identityEvidence?: string;
      proposals?: Array<{ field: string; newValue: string; confidence: string; sourceUrl: string; quote: string }>;
      applied?: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
      sources?: Array<{ title: string; url: string }>;
    },
  }));
  const fieldsUpdated = findings.reduce((n, f) => n + (f.result.applied?.length ?? 0), 0);
  return NextResponse.json({
    schedule: "Weekly · Mondays 3:04 AM",
    nextRunAt: nextRunAt(),
    lastRunAt: findings[0]?.runAt ?? null,
    companiesWatched: companies.filter((c) => c.monitoring).length,
    fieldsUpdated,
    findings,
  });
}
