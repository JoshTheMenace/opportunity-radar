"use client";

// Pursuit workspace shell (Federal Catalyst anatomy): a slim "Active Grants"
// rail on the left listing every pursuit; selecting one renders its full
// workspace (PursuitPanel) inline on the right. Deep-links via ?id=.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Badge, Card, Icon, type BadgeTone } from "../components/ui";
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

// Status tones follow the kit's status rules: primary = in flight,
// fit (green) = money outcomes, neutral = closed-out.
const STATUS_TONE: Record<string, BadgeTone> = {
  active: "primary",
  submitted: "fit",
  won: "fit",
  lost: "neutral",
  abandoned: "neutral",
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
    <main className="mk-page" style={{ paddingTop: 32, paddingBottom: 48 }}>
      {rows == null ? (
        <div className="or-card shimmer" style={{ height: 112 }} />
      ) : rows.length === 0 ? (
        <Card
          style={{
            maxWidth: 560,
            margin: "0 auto",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            textAlign: "center",
            gap: 12,
          }}
        >
          <h1 className="mk-h3">Pursuit Workspace</h1>
          <p style={{ margin: 0, font: "400 14px/20px var(--font-body)", color: "var(--color-on-surface-variant)" }}>
            No pursuits yet — pick a match and build a submission plan.
          </p>
          <Link href="/" className="or-btn or-btn--filled">
            Find funding
            <Icon name="arrow_forward" size={18} />
          </Link>
        </Card>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* left rail: Active Grants */}
          <Card flush className="w-full shrink-0 lg:w-64">
            <div className="mk-cardhead">Active Grants</div>
            <nav style={{ padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {rows.map((p) => {
                const active = p.id === selectedId;
                return (
                  <button
                    key={p.id}
                    onClick={() => select(p.id)}
                    className={`or-side__row${active ? " or-side__row--active" : ""}`}
                    style={{ flexDirection: "column", alignItems: "flex-start", gap: 6, width: "100%" }}
                  >
                    <span
                      style={{
                        font: `${active ? 600 : 500} 14px/20px var(--font-body)`,
                        letterSpacing: "normal",
                        width: "100%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        textAlign: "left",
                      }}
                    >
                      {p.opportunity?.title ?? p.opportunityId}
                    </span>
                    <span className="mk-row" style={{ gap: 8 }}>
                      <Badge tone={STATUS_TONE[p.status] ?? "primary"}>{p.status}</Badge>
                      <span className="mk-num" style={{ fontSize: 12, color: active ? "inherit" : undefined }}>
                        {p.doneCount}/{p.taskCount}
                      </span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </Card>

          {/* right: the selected pursuit's workspace */}
          <div className="min-w-0 flex-1 space-y-3">
            {sel && (
              <>
                <p className="or-crumbs" style={{ margin: 0 }}>
                  <span>Active Grants</span>
                  <span>/</span>
                  <Link
                    href={`/opportunity/${encodeURIComponent(sel.opportunityId)}`}
                    className="or-crumbs__current"
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
