"use client";

// The pursuit panel: turn interest into an actual submission. One click
// builds an AI + rules submission plan; after that this renders the live
// tracker — phased task list, due dates, progress, per-task "Help me".

import { useEffect, useState } from "react";
import type { PursuitRecord, PursuitTask } from "@/lib/pursuit/db";

type Phase = "loading" | "none" | "building" | "ready" | "error";

const STATUS_OPTIONS = ["active", "submitted", "won", "lost", "abandoned"] as const;

export default function PursuitPanel({ opportunityId }: { opportunityId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [pursuit, setPursuit] = useState<PursuitRecord | null>(null);
  const [tasks, setTasks] = useState<PursuitTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [assistBusy, setAssistBusy] = useState<number | null>(null);
  const [openAssist, setOpenAssist] = useState<Set<number>>(new Set());

  useEffect(() => {
    void fetch(`/api/pursuits?opportunityId=${encodeURIComponent(opportunityId)}`)
      .then((r) => r.json())
      .then(async (d: { pursuits?: { id: number }[] }) => {
        const found = d.pursuits?.[0];
        if (!found) return setPhase("none");
        const det = await fetch(`/api/pursuits/${found.id}`).then((r) => r.json());
        setPursuit(det.pursuit);
        setTasks(det.tasks);
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
      // Already generated — just toggle visibility.
      setOpenAssist((s) => {
        const n = new Set(s);
        if (n.has(task.id)) n.delete(task.id);
        else n.add(task.id);
        return n;
      });
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
        setOpenAssist((s) => new Set(s).add(task.id));
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
        className="space-y-2.5 rounded-2xl border border-hairline bg-card p-5 shadow-card"
      >
        <h2 className="text-lg font-bold tracking-tight text-ink">Go after this funding</h2>
        <p className="text-sm leading-relaxed text-muted">
          We&apos;ll build you a submission plan for this specific program — registrations,
          eligibility checks, narrative sections, budget, and a timeline working back from the
          deadline. Then we help you finish every task.
        </p>
        {error && <p className="text-sm text-risk">{error}</p>}
        <button
          onClick={start}
          disabled={phase === "building"}
          className="rounded-full bg-brand px-5 py-2.5 font-mono text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-strong disabled:opacity-60"
        >
          {phase === "building" ? "Building your plan… (~30s)" : "Build my submission plan"}
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
    done: "bg-brand text-white",
    current: "border-2 border-brand bg-card text-brand ring-4 ring-soft",
    todo: "border border-hairline bg-card text-faint",
  };

  return (
    <section id="pursuit" className="space-y-5">
      {/* readiness card: the one big number + the stage stepper */}
      <div className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-faint">
              Submission plan
            </p>
            <p className="mt-1 text-3xl font-bold tracking-tight text-brand">
              {pct}%{" "}
              <span className="text-[15px] font-semibold tracking-normal text-faint">ready</span>
            </p>
            <p className="mt-0.5 font-mono text-xs text-muted">
              {done}/{tasks.length} tasks complete
            </p>
          </div>
          <label className="flex items-center gap-2 font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-faint">
            status
            <select
              value={pursuit?.status ?? "active"}
              onChange={(e) => void setStatus(e.target.value)}
              className="rounded-xl border border-hairline bg-card px-2.5 py-1.5 font-mono text-xs font-medium normal-case tracking-normal text-ink focus:border-brand"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* progress */}
        <div id="pursuit-progress" className="mt-4 h-[3px] overflow-hidden rounded-full bg-hairline">
          <div
            className="h-full rounded-full bg-brand transition-[width] duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* phase stepper — lights up as each phase completes */}
        <div id="pursuit-phases" className="mt-5 flex items-center overflow-x-auto pb-1">
          {phases.map((ph, i) => {
            const st = phaseState(i);
            return (
              <span key={ph} className="contents">
                {i > 0 && (
                  <span
                    aria-hidden
                    className={`-mx-3 mb-5 h-[3px] min-w-4 flex-1 ${
                      phaseState(i - 1) === "done" ? "bg-brand" : "bg-hairline"
                    }`}
                  />
                )}
                <span className="flex w-20 flex-none flex-col items-center gap-1.5">
                  <span
                    className={`grid size-[30px] place-items-center rounded-full font-mono text-xs font-semibold ${DOT[st]}`}
                  >
                    {st === "done" ? "✓" : i + 1}
                  </span>
                  <span
                    className={`text-center font-mono text-[10.5px] uppercase ${
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

        {pursuit?.planSummary && (
          <p className="mt-4 border-l-2 border-soft pl-3 text-[13.5px] leading-relaxed text-muted">
            {pursuit.planSummary}
          </p>
        )}
      </div>

      {/* phased task list */}
      <div
        id="pursuit-tasks"
        className="space-y-4 rounded-2xl border border-hairline bg-card p-5 shadow-card"
      >
        {phases.map((ph) => (
          <div key={ph} className="space-y-1.5">
            <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-faint">
              {ph}
            </p>
            {tasks
              .filter((t) => t.phase === ph)
              .map((t) => {
                const overdue = !t.done && t.dueDate != null && t.dueDate < today;
                const urgent = !t.done && t.dueDate != null && t.dueDate <= soon;
                const current = t.id === firstOpenId;
                return (
                  <div
                    key={t.id}
                    className={`rounded-xl border border-hairline p-3 ${
                      current ? "border-l-[3px] border-l-accent bg-soft/40" : "bg-card"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={t.done}
                        onChange={() => void toggle(t)}
                        className="mt-1 h-4 w-4 accent-good"
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm ${
                            t.done ? "text-muted line-through" : "font-medium text-ink"
                          }`}
                        >
                          {t.title}
                        </p>
                        <p className="text-xs text-muted">{t.detail}</p>
                        {t.dueDate && (
                          <p
                            className={`mt-0.5 font-mono text-[11px] ${
                              overdue || urgent ? "font-semibold text-risk" : "text-faint"
                            }`}
                          >
                            due {t.dueDate}
                            {overdue ? " · overdue" : ""}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => void assist(t)}
                        disabled={assistBusy === t.id}
                        className="shrink-0 rounded-xl border border-hairline bg-card px-2.5 py-1 font-mono text-[11px] font-semibold text-brand transition-colors hover:bg-soft disabled:opacity-50"
                      >
                        {assistBusy === t.id ? "Thinking…" : t.assist ? "Help ▾" : "Help me"}
                      </button>
                    </div>
                    {t.assist && openAssist.has(t.id) && (
                      <div className="mt-2 space-y-1 rounded-xl border border-hairline bg-[#FBFCFE] p-3.5">
                        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-faint">
                          How to finish this
                        </p>
                        <div className="whitespace-pre-wrap text-xs leading-relaxed text-ink/85">
                          {t.assist}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        ))}
      </div>
    </section>
  );
}
