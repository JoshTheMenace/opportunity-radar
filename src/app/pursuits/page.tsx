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
  won: "bg-good-soft text-good",
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
        <div className="shimmer h-28 rounded-2xl bg-surface-low" />
      ) : rows.length === 0 ? (
        <section className="card mx-auto max-w-xl space-y-3 p-8 text-center">
          <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">
            Pursuit Workspace
          </h1>
          <p className="text-sm text-muted">
            No pursuits yet — pick a match and build a submission plan.
          </p>
          <Link
            href="/"
            className="inline-block rounded-xl bg-brand px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-strong"
          >
            Find funding →
          </Link>
        </section>
      ) : (
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
          {/* left rail: Active Grants */}
          <aside className="card w-full shrink-0 p-3 lg:w-64">
            <p className="px-2 pb-2 pt-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
              Active Grants
            </p>
            <nav className="space-y-1">
              {rows.map((p) => {
                const active = p.id === selectedId;
                return (
                  <button
                    key={p.id}
                    onClick={() => select(p.id)}
                    className={`block w-full rounded-xl px-4 py-3 text-left transition-colors ${
                      active ? "bg-soft" : "hover:bg-surface-low"
                    }`}
                  >
                    <span className="flex items-start gap-2">
                      <span
                        aria-hidden
                        className={`mt-0.5 text-[12px] ${active ? "text-brand" : "text-faint"}`}
                      >
                        ▸
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-[14px] ${
                            active ? "font-semibold text-brand" : "font-medium text-ink"
                          }`}
                        >
                          {p.opportunity?.title ?? p.opportunityId}
                        </span>
                        <span className="mt-1.5 flex items-center gap-2">
                          <span
                            className={`rounded-full px-3 py-1 text-[12px] font-semibold ${
                              STATUS_BADGE[p.status] ?? STATUS_BADGE.active
                            }`}
                          >
                            {p.status}
                          </span>
                          <span className="font-mono text-[12px] text-faint">
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
                <p className="text-[13px] text-muted">
                  <span className="text-faint">Active Grants</span>
                  <span className="text-faint"> / </span>
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
