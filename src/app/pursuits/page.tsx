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

// Status chips follow the status rules: soft/brand = in flight,
// good = money outcomes, faint = closed-out.
const STATUS_BADGE: Record<string, string> = {
  active: "bg-soft text-brand",
  submitted: "bg-good-soft text-good",
  won: "border border-good/40 bg-good-soft text-good",
  lost: "bg-bg text-faint",
  abandoned: "bg-bg text-faint",
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
      <header className="space-y-1.5">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-faint">
          Applications in flight
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">Your pursuits</h1>
        <p className="text-sm text-muted">
          Every application you&apos;re working toward — plan, progress, and what&apos;s next.
        </p>
      </header>

      {rows == null ? (
        <p className="animate-pulse font-mono text-xs text-faint">Loading…</p>
      ) : rows.length === 0 ? (
        <section className="space-y-3 rounded-2xl border border-hairline bg-card p-8 text-center shadow-card">
          <p className="text-sm text-muted">
            No pursuits yet — pick a match and build a submission plan.
          </p>
          <Link
            href="/"
            className="inline-block rounded-full bg-brand px-5 py-2.5 font-mono text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-strong"
          >
            Find funding →
          </Link>
        </section>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {rows.map((p, i) => {
            const pct = p.taskCount ? Math.round((p.doneCount / p.taskCount) * 100) : 0;
            const close = daysUntil(p.opportunity?.closeDate ?? null);
            const nextDue = daysUntil(p.nextTask?.dueDate ?? null);
            const closeSoon = close != null && close >= 0 && close < 7;
            return (
              <Link
                key={p.id}
                href={`/opportunity/${encodeURIComponent(p.opportunityId)}`}
                className="card-in block space-y-3 rounded-2xl border border-hairline bg-card p-5 shadow-card transition-colors hover:border-brand/40"
                style={{ animationDelay: `${Math.min(i * 70, 490)}ms` }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h2 className="text-[16px] font-bold tracking-tight text-ink">
                    {p.opportunity?.title ?? p.opportunityId}
                  </h2>
                  <span
                    className={`rounded-full px-3 py-1 font-mono text-[11px] font-semibold uppercase ${STATUS_BADGE[p.status] ?? STATUS_BADGE.active}`}
                  >
                    {p.status}
                  </span>
                </div>
                <p className="font-mono text-[11.5px] uppercase tracking-[0.02em] text-muted">
                  {p.opportunity?.agency}
                </p>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-xs font-semibold text-brand">{pct}% ready</span>
                  <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-hairline">
                    <div
                      className="h-full rounded-full bg-brand transition-[width] duration-700"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="font-mono text-xs text-faint">
                    {p.doneCount}/{p.taskCount}
                  </span>
                </div>
                {p.opportunity?.closeDate && (
                  <p className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold ${
                        closeSoon ? "bg-risk-soft text-risk" : "bg-bg text-muted"
                      }`}
                    >
                      closes {p.opportunity.closeDate}
                      {close != null && close >= 0 ? ` · in ${close}d` : ""}
                    </span>
                  </p>
                )}
                {p.nextTask && p.status === "active" && (
                  <p className="border-t border-hairline pt-3 text-xs text-muted">
                    <span className="font-semibold text-ink">Next:</span> {p.nextTask.title}
                    {p.nextTask.dueDate && (
                      <span
                        className={`font-mono ${nextDue != null && nextDue <= 3 ? "font-semibold text-risk" : "text-faint"}`}
                      >
                        {" "}· due {p.nextTask.dueDate}
                      </span>
                    )}
                  </p>
                )}
                <p className="font-mono text-[12.5px] font-semibold text-brand">Open plan →</p>
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
