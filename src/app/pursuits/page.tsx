"use client";

// Pursuit workspace shell (Federal Catalyst anatomy): a slim "Active Grants"
// rail on the left listing every pursuit; selecting one renders its full
// workspace (PursuitPanel) inline on the right. Deep-links via ?id=.

import { useEffect, useState } from "react";
import Link from "next/link";
import PursuitPanel from "../opportunity/[id]/pursuit-panel";

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

export default function PursuitsPage() {
  const [rows, setRows] = useState<PursuitRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    const wanted = Number(new URLSearchParams(window.location.search).get("id"));
    void fetch("/api/pursuits")
      .then((r) => r.json())
      .then((d: { pursuits?: PursuitRow[] }) => {
        const list = d.pursuits ?? [];
        setRows(list);
        setSelectedId(list.some((p) => p.id === wanted) ? wanted : (list[0]?.id ?? null));
      })
      .catch(() => setRows([]));
  }, []);

  function select(id: number) {
    setSelectedId(id);
    window.history.replaceState(null, "", `/pursuits?id=${id}`);
  }

  const sel = rows?.find((p) => p.id === selectedId) ?? null;

  return (
    <main className="mx-auto w-full max-w-[1400px] px-4 py-6">
      {rows == null ? (
        <p className="animate-pulse font-mono text-xs text-faint">Loading…</p>
      ) : rows.length === 0 ? (
        <section className="mx-auto max-w-xl space-y-3 rounded-xl border border-hairline bg-card p-8 text-center shadow-card">
          <h1 className="font-display text-xl font-bold tracking-tight text-ink">
            Pursuit Workspace
          </h1>
          <p className="text-sm text-muted">
            No pursuits yet — pick a match and build a submission plan.
          </p>
          <Link
            href="/"
            className="inline-block rounded-lg bg-brand px-4 py-2 font-mono text-[13px] font-medium text-white transition-colors hover:bg-brand-strong"
          >
            Find funding →
          </Link>
        </section>
      ) : (
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          {/* left rail: Active Grants */}
          <aside className="w-full shrink-0 overflow-hidden rounded-xl border border-hairline bg-card shadow-card lg:w-64">
            <p className="border-b border-hairline bg-surface-low/60 px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
              Active Grants
            </p>
            <nav>
              {rows.map((p) => {
                const active = p.id === selectedId;
                return (
                  <button
                    key={p.id}
                    onClick={() => select(p.id)}
                    className={`block w-full border-b border-hairline px-4 py-3 text-left transition-colors last:border-b-0 ${
                      active ? "border-l-4 border-l-brand bg-soft/50" : "hover:bg-surface-low"
                    }`}
                  >
                    <span className="flex items-start gap-2">
                      <span
                        aria-hidden
                        className={`mt-0.5 font-mono text-[11px] ${active ? "text-brand" : "text-faint"}`}
                      >
                        ▸
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-[13.5px] ${
                            active ? "font-semibold text-brand" : "font-medium text-ink"
                          }`}
                        >
                          {p.opportunity?.title ?? p.opportunityId}
                        </span>
                        <span className="mt-1.5 flex items-center gap-2">
                          <span
                            className={`rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold uppercase ${
                              STATUS_BADGE[p.status] ?? STATUS_BADGE.active
                            }`}
                          >
                            {p.status}
                          </span>
                          <span className="font-mono text-[10.5px] text-faint">
                            {p.doneCount}/{p.taskCount}
                          </span>
                        </span>
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </aside>

          {/* right: the selected pursuit's workspace */}
          <div className="min-w-0 flex-1 space-y-3">
            {sel && (
              <>
                <p className="font-mono text-xs text-muted">
                  <span className="text-faint">Active Grants</span>
                  <span className="text-faint"> ▸ </span>
                  <Link
                    href={`/opportunity/${encodeURIComponent(sel.opportunityId)}`}
                    className="text-ink transition-colors hover:text-brand"
                  >
                    {sel.opportunity?.title ?? sel.opportunityId}
                  </Link>
                </p>
                <PursuitPanel key={sel.id} opportunityId={sel.opportunityId} />
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
