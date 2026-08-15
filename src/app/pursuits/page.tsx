"use client";

// Pursuits dashboard: every funding application in flight — progress,
// next action, and deadline at a glance.

import { useEffect, useState } from "react";
import Link from "next/link";

interface PursuitRow {
  id: number;
  opportunityId: string;
  status: string;
  planSummary: string | null;
  createdAt: string;
  taskCount: number;
  doneCount: number;
  nextTask: { id: number; title: string; dueDate: string | null } | null;
  opportunity: {
    title: string;
    agency: string;
    closeDate: string | null;
    awardCeilingUsd: number | null;
  } | null;
}

const STATUS_BADGE: Record<string, string> = {
  active: "border-blue-500/50 bg-blue-500/10 text-blue-300",
  submitted: "border-yellow-500/50 bg-yellow-500/10 text-yellow-300",
  won: "border-green-500/50 bg-green-500/10 text-green-400",
  lost: "border-neutral-600 bg-neutral-800 text-neutral-400",
  abandoned: "border-neutral-600 bg-neutral-800 text-neutral-400",
};

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((Date.parse(iso) - Date.now()) / 86400000);
}

export default function PursuitsPage() {
  const [rows, setRows] = useState<PursuitRow[] | null>(null);

  useEffect(() => {
    void fetch("/api/pursuits")
      .then((r) => r.json())
      .then((d: { pursuits?: PursuitRow[] }) => setRows(d.pursuits ?? []))
      .catch(() => setRows([]));
  }, []);

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Your pursuits</h1>
        <p className="text-sm text-neutral-400">
          Every application you&apos;re working toward — plan, progress, and what&apos;s next.
        </p>
      </header>

      {rows == null ? (
        <p className="animate-pulse text-sm text-neutral-500">Loading…</p>
      ) : rows.length === 0 ? (
        <section className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-6 text-center">
          <p className="text-sm text-neutral-300">No pursuits yet.</p>
          <p className="text-xs text-neutral-500">
            Run an analysis, open a match, and hit &ldquo;Build my submission plan&rdquo; to start
            one.
          </p>
          <Link href="/" className="inline-block rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500">
            Find funding →
          </Link>
        </section>
      ) : (
        <div className="space-y-3">
          {rows.map((p) => {
            const pct = p.taskCount ? Math.round((p.doneCount / p.taskCount) * 100) : 0;
            const close = daysUntil(p.opportunity?.closeDate ?? null);
            return (
              <Link
                key={p.id}
                href={`/opportunity/${encodeURIComponent(p.opportunityId)}`}
                className="block space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4 hover:border-neutral-600"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold">{p.opportunity?.title ?? p.opportunityId}</h2>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STATUS_BADGE[p.status] ?? STATUS_BADGE.active}`}
                  >
                    {p.status}
                  </span>
                </div>
                <p className="text-xs text-neutral-400">
                  {p.opportunity?.agency}
                  {p.opportunity?.closeDate && (
                    <span className={close != null && close <= 30 ? " text-red-400" : ""}>
                      {" "}· closes {p.opportunity.closeDate}
                      {close != null && close >= 0 ? ` (${close}d)` : ""}
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-3">
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-800">
                    <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-xs text-neutral-500">
                    {p.doneCount}/{p.taskCount}
                  </span>
                </div>
                {p.nextTask && p.status === "active" && (
                  <p className="text-xs text-neutral-400">
                    <span className="font-semibold text-neutral-300">Next:</span> {p.nextTask.title}
                    {p.nextTask.dueDate ? ` · due ${p.nextTask.dueDate}` : ""}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
