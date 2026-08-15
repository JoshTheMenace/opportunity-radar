"use client";

// The Dream dashboard: what the weekly autonomous researcher did and will
// do — next run, companies watched, and per-run findings with the exact
// provenance trail (identity verdict, applied changes old → new, sources).
// Built for the demo: every number on this page is real table data.
// Presentation follows the Catalyst identity (Eyebrow/ink/muted/faint,
// good/warn chips); read-only, polls /api/dream.

import { useCallback, useEffect, useState } from "react";

interface Finding {
  id: number;
  companyName: string;
  runAt: string;
  dryRun: boolean;
  identityConfident: boolean;
  result: {
    identityEvidence?: string;
    proposals?: Array<{ field: string; newValue: string; confidence: string; sourceUrl: string; quote: string }>;
    applied?: Array<{ field: string; oldValue: unknown; newValue: unknown }>;
    sources?: Array<{ title: string; url: string }>;
  };
}

interface DreamData {
  schedule: string;
  nextRunAt: string;
  lastRunAt: string | null;
  companiesWatched: number;
  fieldsUpdated: number;
  findings: Finding[];
}

const FIELD_LABEL: Record<string, string> = {
  employees: "Team size",
  annualRevenueUsd: "Revenue",
  capitalRaisedUsd: "Capital raised",
  fundingStage: "Funding stage",
  productMaturity: "Product stage",
  samRegistered: "SAM.gov registered",
};

function fmtValue(field: string, v: unknown): string {
  if (v == null) return "unknown";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number" && /Usd/.test(field)) {
    return v >= 1e6 ? `$${(v / 1e6).toFixed(1).replace(/\.0$/, "")}M` : `$${Math.round(v / 1e3)}K`;
  }
  return String(v);
}

function fmtWhen(iso: string): string {
  const d = new Date(iso.length === 19 ? iso + "Z" : iso);
  return d.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{children}</p>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="card p-4">
      <p className={`font-display text-[20px] font-bold tracking-tight ${tone ?? "text-ink"}`}>
        {value}
      </p>
      <p className="mt-0.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
        {label}
      </p>
    </div>
  );
}

export default function DreamPage() {
  const [data, setData] = useState<DreamData | null>(null);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/dream");
      if (r.ok) setData((await r.json()) as DreamData);
    } catch {
      // transient — next poll retries
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 15_000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      <header className="space-y-2">
        <Eyebrow>Autonomous research · weekly</Eyebrow>
        <h1 className="font-display text-[28px] font-bold tracking-tight text-ink">
          While you sleep, Radar re-checks the facts
        </h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted">
          Every week the dream agent researches each saved company on the public web, verifies
          it found <em>the same company</em> (a name match alone never counts), and refreshes
          drift-prone facts — with a source for every change. Ambiguity means no change, ever.
        </p>
      </header>

      {/* roll-up stats */}
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Next run" value={data ? fmtWhen(data.nextRunAt) : "—"} />
        <Stat label="Last run" value={data?.lastRunAt ? fmtWhen(data.lastRunAt) : "never"} />
        <Stat label="Companies watched" value={data ? String(data.companiesWatched) : "—"} />
        <Stat
          label="Fields updated"
          value={data ? String(data.fieldsUpdated) : "—"}
          tone={data && data.fieldsUpdated > 0 ? "text-good" : undefined}
        />
      </div>

      {/* per-run findings */}
      <section className="mt-8 space-y-3">
        <Eyebrow>Research log</Eyebrow>
        {data && data.findings.length === 0 && (
          <div className="card p-6 text-sm text-muted">
            No dream runs yet. The first cycle runs {data.schedule.toLowerCase()} — or kick one
            off now with <code className="text-ink">pnpm tsx scripts/dream.ts</code>.
          </div>
        )}
        {(data?.findings ?? []).map((f) => {
          const applied = f.result.applied ?? [];
          const proposals = (f.result.proposals ?? []).filter(
            (p) => !applied.some((a) => a.field === p.field),
          );
          return (
            <article key={f.id} className="card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-display text-[16px] font-bold tracking-tight text-ink">
                    {f.companyName}
                  </h3>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold ${
                      f.identityConfident ? "bg-good-soft text-good" : "bg-warn-soft text-warn"
                    }`}
                  >
                    {f.identityConfident ? "Identity verified" : "Identity uncertain — no changes"}
                  </span>
                  {f.dryRun && (
                    <span className="rounded-full bg-surface-variant px-2.5 py-0.5 text-[11.5px] font-semibold text-muted">
                      dry run
                    </span>
                  )}
                </div>
                <span className="text-[12.5px] text-faint">{fmtWhen(f.runAt)}</span>
              </div>

              {f.result.identityEvidence && (
                <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                  {f.result.identityEvidence}
                </p>
              )}

              {applied.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <Eyebrow>Updated automatically</Eyebrow>
                  {applied.map((a, i) => (
                    <p key={i} className="text-[13.5px] text-ink">
                      <span className="font-semibold">{FIELD_LABEL[a.field] ?? a.field}</span>:{" "}
                      <span className="text-faint line-through">{fmtValue(a.field, a.oldValue)}</span>{" "}
                      → <span className="font-semibold text-good">{fmtValue(a.field, a.newValue)}</span>
                    </p>
                  ))}
                </div>
              )}

              {proposals.length > 0 && (
                <div className="mt-3 space-y-1.5">
                  <Eyebrow>Found but not applied (needs your confirmation)</Eyebrow>
                  {proposals.map((p, i) => (
                    <p key={i} className="text-[13px] text-muted">
                      {FIELD_LABEL[p.field] ?? p.field}: {p.newValue}{" "}
                      <span className="text-faint">({p.confidence} confidence)</span>
                    </p>
                  ))}
                </div>
              )}

              {(f.result.sources?.length ?? 0) > 0 && (
                <p className="mt-3 text-[12px] text-faint">
                  Sources:{" "}
                  {f.result.sources!.slice(0, 4).map((s, i) => (
                    <span key={i}>
                      {i > 0 && " · "}
                      <a
                        href={s.url}
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-muted"
                      >
                        {s.title || new URL(s.url).hostname}
                      </a>
                    </span>
                  ))}
                </p>
              )}

              {applied.length === 0 && proposals.length === 0 && f.identityConfident && (
                <p className="mt-2 text-[13px] text-muted">
                  Everything checked out — the stored profile is still accurate.
                </p>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
