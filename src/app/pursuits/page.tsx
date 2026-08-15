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

// Status chips follow the accent rules: brass = attention (in flight),
// treasury = money outcomes, faint = closed-out.
const STATUS_BADGE: Record<string, string> = {
  active: "border-brass/50 bg-brass/10 text-brass",
  submitted: "border-treasury/50 bg-treasury/10 text-treasury",
  won: "border-treasury bg-treasury/20 text-treasury",
  lost: "border-hairline bg-panel-2 text-faint",
  abandoned: "border-hairline bg-panel-2 text-faint",
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
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <p className="font-mono text-[10px] font-medium tracking-[0.18em] text-faint">
          APPLICATIONS IN FLIGHT
        </p>
        <h1 className="font-display text-2xl font-semibold text-paper">Your pursuits</h1>
        <p className="text-sm text-muted">
          Every application you&apos;re working toward — plan, progress, and what&apos;s next.
        </p>
      </header>

      {rows == null ? (
        <p className="animate-pulse font-mono text-xs text-faint">Loading…</p>
      ) : rows.length === 0 ? (
        <section className="space-y-3 rounded-lg border border-hairline bg-panel p-6 text-center">
          <p className="text-sm text-paper/85">
            No pursuits yet — pick a match and build a submission plan.
          </p>
          <Link
            href="/"
            className="inline-block rounded-md bg-brass px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-brass-bright"
          >
            Find funding →
          </Link>
        </section>
      ) : (
        <div className="space-y-3">
          {rows.map((p, i) => {
            const pct = p.taskCount ? Math.round((p.doneCount / p.taskCount) * 100) : 0;
            const close = daysUntil(p.opportunity?.closeDate ?? null);
            const nextDue = daysUntil(p.nextTask?.dueDate ?? null);
            return (
              <Link
                key={p.id}
                href={`/opportunity/${encodeURIComponent(p.opportunityId)}`}
                className="card-in block space-y-2 rounded-lg border border-hairline bg-panel p-4 transition-colors hover:border-brass/50"
                style={{ animationDelay: `${Math.min(i * 70, 490)}ms` }}
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-semibold text-paper">
                    {p.opportunity?.title ?? p.opportunityId}
                  </h2>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 font-mono text-[11px] font-semibold ${STATUS_BADGE[p.status] ?? STATUS_BADGE.active}`}
                  >
                    {p.status}
                  </span>
                </div>
                <p className="font-mono text-xs text-muted">
                  {p.opportunity?.agency}
                  {p.opportunity?.closeDate && (
                    <span className={close != null && close <= 30 ? " text-signal" : ""}>
                      {" "}· closes {p.opportunity.closeDate}
                      {close != null && close >= 0 ? ` (${close}d)` : ""}
                    </span>
                  )}
                </p>
                <div className="flex items-center gap-3">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-panel-2">
                    <div
                      className="h-full rounded-full bg-treasury transition-[width] duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs text-faint">
                    {p.doneCount}/{p.taskCount}
                  </span>
                </div>
                {p.nextTask && p.status === "active" && (
                  <p className="text-xs text-muted">
                    <span className="font-semibold text-paper/80">Next:</span> {p.nextTask.title}
                    {p.nextTask.dueDate && (
                      <span
                        className={`font-mono ${nextDue != null && nextDue <= 3 ? "text-signal" : ""}`}
                      >
                        {" "}· due {p.nextTask.dueDate}
                      </span>
                    )}
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
