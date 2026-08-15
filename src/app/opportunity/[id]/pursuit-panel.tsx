"use client";

// The pursuit workspace: turn interest into an actual submission. One click
// builds an AI + rules submission plan; after that this renders the full
// Federal Catalyst workspace — header + progress card, phased task
// cards, a document-style strategy/assist panel, SAM.gov warning, and a
// deadline timeline rail.

import { useEffect, useState } from "react";
import type { PursuitRecord, PursuitTask } from "@/lib/pursuit/db";
import type { Opportunity } from "@/lib/types";

type Phase = "loading" | "none" | "building" | "ready" | "error";

const STATUS_OPTIONS = ["active", "submitted", "won", "lost", "abandoned"] as const;

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** "2026-10-16" → "OCT 16" (kit date-chip format). */
function monthDay(iso: string): string {
  const [, m, d] = iso.split("-");
  return `${MONTHS[Number(m) - 1] ?? "?"} ${d}`;
}

function daysUntil(iso: string): number {
  return Math.ceil((Date.parse(iso) - Date.now()) / 86400000);
}

function fmtUsd(n: number): string {
  if (n >= 1e9) return `$${+(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `$${+(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${n}`;
}

const LABEL = "text-[11px] font-semibold uppercase tracking-[0.08em] text-faint";

/** ALL-CAPS words longer than 3 chars → Capitalized; short/mixed words unchanged. */
function humanize(s: string): string {
  return s.replace(/\b[A-Z]{4,}\b/g, (w) => w[0] + w.slice(1).toLowerCase());
}

export default function PursuitPanel({ opportunityId }: { opportunityId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [pursuit, setPursuit] = useState<PursuitRecord | null>(null);
  const [tasks, setTasks] = useState<PursuitTask[]>([]);
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assistBusy, setAssistBusy] = useState<number | null>(null);
  const [openAssistId, setOpenAssistId] = useState<number | null>(null);

  useEffect(() => {
    void fetch(`/api/pursuits?opportunityId=${encodeURIComponent(opportunityId)}`)
      .then((r) => r.json())
      .then(async (d: { pursuits?: { id: number }[] }) => {
        const found = d.pursuits?.[0];
        if (!found) return setPhase("none");
        const det = await fetch(`/api/pursuits/${found.id}`).then((r) => r.json());
        setPursuit(det.pursuit);
        setTasks(det.tasks);
        setOpp(det.opportunity ?? null);
        setPhase("ready");
      })
      .catch(() => setPhase("none"));
  }, [opportunityId]);

  async function start() {
    setPhase("building");
    setError(null);
    try {
      const res = await fetch("/api/pursuits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ opportunityId }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? `HTTP ${res.status}`);
      setPursuit(d.pursuit);
      setTasks(d.tasks);
      setPhase("ready");
      // Pull the opportunity row for the workspace header (same detail route).
      const det = await fetch(`/api/pursuits/${d.pursuit.id}`)
        .then((r) => r.json())
        .catch(() => null);
      if (det?.opportunity) setOpp(det.opportunity);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
    }
  }

  async function toggle(task: PursuitTask) {
    if (!pursuit) return;
    setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)));
    await fetch(`/api/pursuits/${pursuit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ taskId: task.id, done: !task.done }),
    }).catch(() => {});
  }

  async function setStatus(status: string) {
    if (!pursuit) return;
    setPursuit({ ...pursuit, status: status as PursuitRecord["status"] });
    await fetch(`/api/pursuits/${pursuit.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => {});
  }

  async function assist(task: PursuitTask) {
    if (!pursuit) return;
    if (task.assist) {
      // Already generated — just toggle which task the document panel shows.
      setOpenAssistId((id) => (id === task.id ? null : task.id));
      return;
    }
    setAssistBusy(task.id);
    try {
      const res = await fetch(`/api/pursuits/${pursuit.id}/assist`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId: task.id }),
      });
      const d = await res.json();
      if (res.ok && d.assist) {
        setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, assist: d.assist } : t)));
        setOpenAssistId(task.id);
      }
    } finally {
      setAssistBusy(null);
    }
  }

  // ---------- render ----------

  if (phase === "loading") return null;

  if (phase !== "ready") {
    return (
      <section id="pursuit" className="card space-y-2.5 p-6">
        <h2 className="font-display text-[18px] font-bold tracking-tight text-ink">
          Go after this funding
        </h2>
        <p className="text-sm leading-relaxed text-muted">
          We&apos;ll build you a submission plan for this specific program — registrations,
          eligibility checks, narrative sections, budget, and a timeline working back from the
          deadline. Then we help you finish every task.
        </p>
        {error && <p className="text-sm text-risk">{error}</p>}
        <button
          onClick={start}
          disabled={phase === "building"}
          className="rounded-xl bg-brand px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-strong disabled:opacity-60"
        >
          {phase === "building" ? "Building your plan… (~30s)" : "Start Pre-flight →"}
        </button>
      </section>
    );
  }

  const done = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const phases = [...new Set(tasks.map((t) => t.phase))];
  const today = new Date().toISOString().slice(0, 10);
  const soon = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10);
  const firstOpenId = tasks.find((t) => !t.done)?.id;

  const match = pursuit?.match ?? null;
  const submitTask = tasks.find((t) => t.kind === "submission") ?? null;
  const target = opp?.closeDate ?? submitTask?.dueDate ?? null;
  const funding =
    opp == null
      ? null
      : opp.awardFloorUsd != null && opp.awardCeilingUsd != null
        ? `${fmtUsd(opp.awardFloorUsd)}–${fmtUsd(opp.awardCeilingUsd)}`
        : opp.awardCeilingUsd != null
          ? `Up to ${fmtUsd(opp.awardCeilingUsd)}`
          : "Unlisted";

  // SAM.gov banner: purely from existing task data — an open task mentioning SAM.gov.
  const samTask =
    tasks.find((t) => !t.done && /sam\.gov/i.test(`${t.title} ${t.detail}`)) ?? null;

  // Deadline timeline: every dated task in due order (submission lands last by date).
  const timeline = tasks
    .filter((t): t is PursuitTask & { dueDate: string } => t.dueDate != null)
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const nextTimelineId = timeline.find((t) => !t.done)?.id;

  const openTask = openAssistId != null ? tasks.find((t) => t.id === openAssistId) : undefined;

  return (
    <section id="pursuit" className="space-y-5">
      {/* workspace header: title, official notice, status */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-[20px] font-bold tracking-tight text-ink">
          {opp?.title ? humanize(opp.title) : "Pursuit"} Workspace
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {opp?.url && (
            <a
              href={opp.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-line bg-card px-4 py-2.5 text-[13.5px] font-medium text-muted transition-colors hover:bg-surface-low"
            >
              Review official notice ↗
            </a>
          )}
          <label className={`flex items-center gap-2 ${LABEL}`}>
            status
            <select
              value={pursuit?.status ?? "active"}
              onChange={(e) => void setStatus(e.target.value)}
              className="appearance-none rounded-xl border border-line bg-card px-4 py-2 text-[13.5px] font-medium normal-case tracking-normal text-ink focus:border-accent focus:outline-none"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* progress & tracker card: % ready + target + phase stepper + stat tiles */}
      <div className="card p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="tnum font-display text-[26px] font-bold tracking-tight text-brand">
            {pct}% ready{" "}
            <span className="font-mono text-xs font-medium tracking-normal text-faint">
              · {done}/{tasks.length} tasks
            </span>
          </p>
          {target && (
            <span className="rounded-full bg-soft px-3 py-1 text-[12px] font-semibold text-brand">
              Target: <span className="font-mono">{monthDay(target)}</span>
            </span>
          )}
        </div>

        <div id="pursuit-progress" className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-high">
          <div
            className="h-full rounded-full bg-good transition-[width] duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* stat tiles: fit score (only if a real score exists) + funding */}
        <div className="mt-4 flex flex-wrap gap-3 border-t border-hairline pt-4">
          {match && (
            <div className="flex items-center gap-2.5 rounded-2xl bg-surface-low p-4">
              <span className="text-good">✓</span>
              <div>
                <p className={LABEL}>Fit Score</p>
                <p className="text-[15px] font-semibold capitalize text-ink">
                  {match.tier.replace(/_/g, " ")} (<span className="tnum">{match.score}</span>)
                </p>
              </div>
            </div>
          )}
          {funding && (
            <div className="flex items-center gap-2.5 rounded-2xl bg-surface-low p-4">
              <span className="font-mono font-semibold text-brand">$</span>
              <div>
                <p className={LABEL}>Funding</p>
                <p className="tnum text-[15px] font-semibold text-ink">{funding}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* workspace grid: tasks + document panel (8) / warning + timeline rail (4) */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
        <div id="pursuit-tasks" className="flex flex-col gap-5 xl:col-span-8">
          {/* phased task cards, kit "Narrative Tasks" anatomy */}
          {phases.map((ph) => {
            const phTasks = tasks.filter((t) => t.phase === ph);
            const phDone = phTasks.filter((t) => t.done).length;
            return (
              <div key={ph} className="card p-5">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="font-display text-[16px] font-bold text-ink">{ph}</h3>
                  <span className="font-mono text-[12px] text-faint">
                    {phDone}/{phTasks.length} done
                  </span>
                </div>
                <div className="space-y-2">
                  {phTasks.map((t) => {
                    const overdue = !t.done && t.dueDate != null && t.dueDate < today;
                    const urgent = !t.done && t.dueDate != null && t.dueDate <= soon;
                    const current = t.id === firstOpenId;
                    return (
                      <div
                        key={t.id}
                        id={`task-${t.id}`}
                        className={`flex items-start gap-3 rounded-xl p-3.5 transition-colors ${
                          current ? "bg-soft" : "bg-surface-low hover:bg-surface"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={t.done}
                          onChange={() => void toggle(t)}
                          className="mt-1 h-4 w-4 accent-brand"
                        />
                        <div className="min-w-0 flex-1">
                          <p
                            className={`text-sm ${
                              t.done ? "text-muted line-through opacity-70" : "font-medium text-ink"
                            }`}
                          >
                            {t.title}
                          </p>
                          <p className="text-xs text-muted">{t.detail}</p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          {t.dueDate && (
                            <span
                              className={`rounded-full px-3 py-1 font-mono text-[12px] font-semibold ${
                                overdue || urgent
                                  ? "bg-risk-soft text-risk"
                                  : "bg-surface text-muted"
                              }`}
                              title={`due ${t.dueDate}${overdue ? " · overdue" : ""}`}
                            >
                              {monthDay(t.dueDate)}
                            </span>
                          )}
                          <button
                            onClick={() => void assist(t)}
                            disabled={assistBusy === t.id}
                            className="rounded-xl border border-line bg-card px-3 py-1.5 text-[12px] font-semibold text-brand transition-colors hover:bg-soft disabled:opacity-50"
                          >
                            {assistBusy === t.id
                              ? "Thinking…"
                              : t.assist
                                ? openAssistId === t.id
                                  ? "Hide"
                                  : "Help me"
                                : "Help me"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* document panel: assist guidance when open, plan strategy otherwise */}
          <div className="card p-6">
            <div className="flex items-center justify-between gap-3">
              <p className={`${LABEL} min-w-0 truncate`}>
                {openTask?.assist ? `How to finish this — ${openTask.title}` : "Strategy"}
              </p>
              {openTask?.assist && (
                <button
                  onClick={() => setOpenAssistId(null)}
                  className="shrink-0 text-[12px] font-semibold text-faint transition-colors hover:text-ink"
                >
                  Close
                </button>
              )}
            </div>
            <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink/85">
              {openTask?.assist ??
                pursuit?.planSummary ??
                "Pick a task and hit “Help me” for step-by-step guidance."}
            </div>
          </div>
        </div>

        {/* right rail: SAM.gov warning + deadline timeline */}
        <div className="flex flex-col gap-5 xl:col-span-4">
          {samTask && (
            <div className="rounded-2xl bg-warn-soft p-4">
              <h4 className="text-[12px] font-semibold uppercase tracking-[0.05em] text-warn">
                SAM.gov status unconfirmed
              </h4>
              <p className="mt-1 text-[13.5px] leading-relaxed text-warn">
                Active registration is required at time of submission.
                {samTask.dueDate && (
                  <>
                    {" "}
                    Confirm or update before{" "}
                    <strong className="font-mono">{monthDay(samTask.dueDate)}</strong>.
                  </>
                )}
              </p>
              <a
                href={`#task-${samTask.id}`}
                className="mt-2 inline-block text-[13px] font-semibold text-warn hover:underline"
              >
                Verify now →
              </a>
            </div>
          )}

          <div className="card p-6 lg:sticky lg:top-20">
            <h3 className="mb-4 font-display text-[16px] font-bold tracking-tight text-ink">
              Deadline Timeline
            </h3>
            <div className="relative space-y-5">
              <div aria-hidden className="absolute bottom-2 left-[5px] top-2 border-l-2 border-line" />
              {pursuit && (
                <TimelineEntry
                  date={monthDay(pursuit.createdAt.slice(0, 10))}
                  label="Pursuit created"
                  state="done"
                />
              )}
              {timeline.map((t) => {
                const du = daysUntil(t.dueDate);
                return (
                  <TimelineEntry
                    key={t.id}
                    date={monthDay(t.dueDate)}
                    label={t.title}
                    state={t.done ? "done" : t.id === nextTimelineId ? "current" : "todo"}
                    chip={
                      !t.done && du >= 0 && du <= 3
                        ? du === 0
                          ? "Due today"
                          : `In ${du} day${du === 1 ? "" : "s"}`
                        : undefined
                    }
                  />
                );
              })}
              {submitTask && submitTask.dueDate == null && (
                <TimelineEntry
                  date="TBD"
                  label={submitTask.title}
                  state={submitTask.done ? "done" : "todo"}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TimelineEntry({
  date,
  label,
  state,
  chip,
}: {
  date: string;
  label: string;
  state: "done" | "current" | "todo";
  chip?: string;
}) {
  const dot =
    state === "done"
      ? "bg-good"
      : state === "current"
        ? "bg-brand ring-2 ring-soft"
        : "border border-line bg-surface-variant";
  return (
    <div className="relative z-10 flex gap-3">
      <span aria-hidden className={`mt-1 h-3 w-3 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span
            className={`font-mono text-[12px] font-semibold ${
              state === "done" ? "text-good" : state === "current" ? "text-brand" : "text-faint"
            }`}
          >
            {date}
          </span>
          <span
            className={`text-[13.5px] ${
              state === "current"
                ? "font-semibold text-ink"
                : state === "todo"
                  ? "text-muted"
                  : "text-ink"
            }`}
          >
            {label}
          </span>
          {chip && (
            <span className="rounded-full bg-risk-soft px-3 py-1 text-[12px] font-semibold text-risk">
              {chip}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
