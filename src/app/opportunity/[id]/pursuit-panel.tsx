"use client";

// The pursuit workspace: turn interest into an actual submission. One click
// builds an AI + rules submission plan; after that this renders the full
// Federal Catalyst workspace — header + progress/stepper card, phased task
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

const LABEL = "font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-faint";

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
      <section
        id="pursuit"
        className="space-y-2.5 rounded-xl border border-hairline bg-card p-5 shadow-card"
      >
        <h2 className="font-display text-lg font-bold tracking-tight text-ink">
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
          className="rounded-lg bg-brand px-4 py-2 font-mono text-[13px] font-medium text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
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

  /** Stepper state per phase: done = every task finished, current = first phase
   *  with open tasks, todo = the rest. */
  const currentPhaseIdx = phases.findIndex((ph) =>
    tasks.some((t) => t.phase === ph && !t.done),
  );
  function phaseState(i: number): "done" | "current" | "todo" {
    if (currentPhaseIdx === -1 || i < currentPhaseIdx) return "done";
    return i === currentPhaseIdx ? "current" : "todo";
  }

  const DOT: Record<"done" | "current" | "todo", string> = {
    done: "bg-good text-white",
    current: "border-2 border-brand bg-card text-brand ring-4 ring-soft",
    todo: "border border-hairline bg-card text-faint",
  };

  return (
    <section id="pursuit" className="space-y-5">
      {/* workspace header: title, official notice, status */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-xl font-bold tracking-tight text-ink sm:text-2xl">
          {opp?.title ?? "Pursuit"} Workspace
        </h2>
        <div className="flex flex-wrap items-center gap-3">
          {opp?.url && (
            <a
              href={opp.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-hairline bg-card px-4 py-2 font-mono text-[12px] font-medium text-brand transition-colors hover:bg-soft"
            >
              Review official notice ↗
            </a>
          )}
          <label className={`flex items-center gap-2 ${LABEL}`}>
            status
            <select
              value={pursuit?.status ?? "active"}
              onChange={(e) => void setStatus(e.target.value)}
              className="rounded-lg border border-hairline bg-card px-2.5 py-1.5 font-mono text-xs font-medium normal-case tracking-normal text-ink focus:border-brand"
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
      <div className="rounded-xl border border-hairline bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="font-display text-2xl font-bold tracking-tight text-brand">
            {pct}% ready{" "}
            <span className="font-mono text-xs font-medium tracking-normal text-faint">
              · {done}/{tasks.length} tasks
            </span>
          </p>
          {target && (
            <span className="rounded bg-surface-high px-2 py-1 font-mono text-[11px] font-medium uppercase text-muted">
              Target: {monthDay(target)}
            </span>
          )}
        </div>

        <div id="pursuit-progress" className="mt-3 h-1 overflow-hidden rounded-full bg-surface-high">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* phase stepper — ✓ good when complete, brand when active, faint upcoming */}
        <div id="pursuit-phases" className="mt-5 flex items-center overflow-x-auto pb-1">
          {phases.map((ph, i) => {
            const st = phaseState(i);
            return (
              <span key={ph} className="contents">
                {i > 0 && (
                  <span
                    aria-hidden
                    className={`-mx-3 mb-5 h-[3px] min-w-4 flex-1 rounded-full ${
                      phaseState(i - 1) === "done" ? "bg-good" : "bg-surface-high"
                    }`}
                  />
                )}
                <span className="flex w-20 flex-none flex-col items-center gap-1.5">
                  <span
                    className={`grid size-8 place-items-center rounded-full font-mono text-xs font-semibold shadow-sm ${DOT[st]}`}
                  >
                    {st === "done" ? "✓" : i + 1}
                  </span>
                  <span
                    className={`text-center font-mono text-[10.5px] uppercase tracking-[0.05em] ${
                      st === "current" ? "font-semibold text-brand" : "text-faint"
                    }`}
                  >
                    {ph}
                  </span>
                </span>
              </span>
            );
          })}
        </div>

        {/* stat tiles: fit score (only if a real score exists) + funding */}
        <div className="mt-4 flex flex-wrap gap-3 border-t border-hairline pt-4">
          {match && (
            <div className="flex items-center gap-2.5 rounded-lg border border-hairline bg-card px-4 py-2">
              <span className="text-good">✓</span>
              <div>
                <p className={LABEL}>Fit Score</p>
                <p className="text-[15px] font-semibold capitalize text-ink">
                  {match.tier.replace(/_/g, " ")} ({match.score})
                </p>
              </div>
            </div>
          )}
          {funding && (
            <div className="flex items-center gap-2.5 rounded-lg border border-hairline bg-card px-4 py-2">
              <span className="font-mono font-semibold text-brand">$</span>
              <div>
                <p className={LABEL}>Funding</p>
                <p className="text-[15px] font-semibold text-ink">{funding}</p>
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
              <div
                key={ph}
                className="overflow-hidden rounded-xl border border-hairline bg-card shadow-card"
              >
                <div className="flex items-center justify-between border-b border-hairline bg-surface-low/60 px-4 py-3">
                  <h3 className="font-display text-[15px] font-semibold text-ink">{ph}</h3>
                  <span className="font-mono text-[11px] text-faint">
                    {phDone}/{phTasks.length} done
                  </span>
                </div>
                <div>
                  {phTasks.map((t) => {
                    const overdue = !t.done && t.dueDate != null && t.dueDate < today;
                    const urgent = !t.done && t.dueDate != null && t.dueDate <= soon;
                    const current = t.id === firstOpenId;
                    return (
                      <div
                        key={t.id}
                        id={`task-${t.id}`}
                        className={`flex items-start gap-3 border-b border-hairline px-4 py-3 transition-colors last:border-b-0 ${
                          current
                            ? "border-l-4 border-l-brand bg-soft/40"
                            : "hover:bg-surface-low/50"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={t.done}
                          onChange={() => void toggle(t)}
                          className="mt-1 h-4 w-4 accent-good"
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
                              className={`font-mono text-[11px] ${
                                overdue || urgent ? "font-bold text-risk" : "text-faint"
                              }`}
                              title={`due ${t.dueDate}${overdue ? " · overdue" : ""}`}
                            >
                              {monthDay(t.dueDate)}
                              {overdue ? " ⚠" : ""}
                            </span>
                          )}
                          <button
                            onClick={() => void assist(t)}
                            disabled={assistBusy === t.id}
                            className="rounded-lg border border-hairline bg-card px-2.5 py-1 font-mono text-[11px] font-semibold text-brand transition-colors hover:bg-soft disabled:opacity-50"
                          >
                            {assistBusy === t.id
                              ? "Thinking…"
                              : t.assist
                                ? openAssistId === t.id
                                  ? "Hide ▴"
                                  : "Help ▾"
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
          <div className="overflow-hidden rounded-xl border border-hairline bg-card shadow-card">
            <div className="flex items-center justify-between gap-3 border-b border-hairline bg-surface-low/60 px-4 py-3">
              <p className={`${LABEL} min-w-0 truncate`}>
                {openTask?.assist ? `How to finish this — ${openTask.title}` : "Strategy"}
              </p>
              {openTask?.assist && (
                <button
                  onClick={() => setOpenAssistId(null)}
                  className="shrink-0 font-mono text-[11px] font-semibold text-faint transition-colors hover:text-ink"
                >
                  ✕ Close
                </button>
              )}
            </div>
            <div className="whitespace-pre-wrap px-5 py-4 text-sm leading-relaxed text-ink/85">
              {openTask?.assist ??
                pursuit?.planSummary ??
                "Pick a task and hit “Help me” for step-by-step guidance."}
            </div>
          </div>
        </div>

        {/* right rail: SAM.gov warning + deadline timeline */}
        <div className="flex flex-col gap-5 xl:col-span-4">
          {samTask && (
            <div className="flex gap-3 rounded-xl border border-warn/25 bg-warn-soft p-4 shadow-card">
              <span aria-hidden className="mt-0.5 text-warn">
                ⚠
              </span>
              <div className="min-w-0">
                <h4 className="font-mono text-[12px] font-bold uppercase tracking-[0.05em] text-warn">
                  SAM.gov status unconfirmed
                </h4>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  Active registration is required at time of submission.
                  {samTask.dueDate && (
                    <>
                      {" "}
                      Confirm or update before{" "}
                      <strong className="font-mono text-warn">{monthDay(samTask.dueDate)}</strong>.
                    </>
                  )}
                </p>
                <a
                  href={`#task-${samTask.id}`}
                  className="mt-2 inline-block font-mono text-[12px] font-bold text-warn hover:underline"
                >
                  Verify now →
                </a>
              </div>
            </div>
          )}

          <div className="rounded-xl border border-hairline bg-card p-5 shadow-card">
            <h3 className="mb-4 border-b border-hairline pb-2 font-display text-[15px] font-semibold text-ink">
              Deadline Timeline
            </h3>
            <div className="relative space-y-5">
              <div aria-hidden className="absolute bottom-2 left-[5px] top-2 w-px bg-line" />
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
                          ? "DUE TODAY"
                          : `IN ${du} DAY${du === 1 ? "" : "S"}`
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
      <span aria-hidden className={`mt-1 size-[11px] shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span
            className={`font-mono text-[11px] font-semibold ${
              state === "done" ? "text-good" : state === "current" ? "text-brand" : "text-faint"
            }`}
          >
            {date}
          </span>
          <span
            className={`text-[13px] ${
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
            <span className="rounded bg-risk-soft px-1.5 py-0.5 font-mono text-[10px] font-bold text-risk">
              {chip}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
