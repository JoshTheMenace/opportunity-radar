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
      <section id="pursuit" className="space-y-2 rounded-lg border border-brass/40 bg-brass/5 p-4">
        <h2 className="font-display text-lg font-semibold text-paper">Go after this funding</h2>
        <p className="text-sm text-muted">
          We&apos;ll build you a submission plan for this specific program — registrations,
          eligibility checks, narrative sections, budget, and a timeline working back from the
          deadline. Then we help you finish every task.
        </p>
        {error && <p className="text-sm text-signal">{error}</p>}
        <button
          onClick={start}
          disabled={phase === "building"}
          className="rounded-md bg-brass px-5 py-2 text-sm font-semibold text-ink transition-colors hover:bg-brass-bright disabled:opacity-60"
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

  /** Phase tone for the stepper: all tasks done → treasury, some → brass, none → faint. */
  function phaseTone(ph: string): string {
    const ts = tasks.filter((t) => t.phase === ph);
    const d = ts.filter((t) => t.done).length;
    if (ts.length > 0 && d === ts.length) return "text-treasury";
    if (d > 0) return "text-brass";
    return "text-faint";
  }

  return (
    <section id="pursuit" className="space-y-4 rounded-lg border border-hairline bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-[10px] font-medium tracking-[0.18em] text-faint">
            SUBMISSION PLAN
          </p>
          <h2 className="font-display text-lg font-semibold text-paper">Your submission plan</h2>
        </div>
        <label className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
          status
          <select
            value={pursuit?.status ?? "active"}
            onChange={(e) => void setStatus(e.target.value)}
            className="rounded-md border border-hairline bg-panel px-2 py-1 font-mono text-xs normal-case tracking-normal text-paper"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* phase stepper — lights up as each phase completes */}
      <p
        id="pursuit-phases"
        className="flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-[10px] uppercase tracking-[0.14em]"
      >
        {phases.map((ph, i) => (
          <span key={ph} className="flex items-center gap-x-2">
            {i > 0 && <span aria-hidden className="text-faint/60">→</span>}
            <span className={phaseTone(ph)}>{ph}</span>
          </span>
        ))}
      </p>

      {pursuit?.planSummary && (
        <p className="border-l-2 border-hairline pl-3 font-display text-sm italic leading-relaxed text-paper/80">
          {pursuit.planSummary}
        </p>
      )}

      {/* progress */}
      <div id="pursuit-progress" className="space-y-1">
        <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
          <div
            className="h-full rounded-full bg-treasury transition-[width] duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="font-mono text-xs text-faint">
          {done}/{tasks.length} tasks done · {pct}%
        </p>
      </div>

      {/* phased task list */}
      <div id="pursuit-tasks" className="space-y-3">
        {phases.map((ph) => (
          <div key={ph} className="space-y-1.5">
            <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-faint">
              {ph}
            </p>
            {tasks
              .filter((t) => t.phase === ph)
              .map((t) => {
                const overdue = !t.done && t.dueDate != null && t.dueDate < today;
                const urgent = !t.done && t.dueDate != null && t.dueDate <= soon;
                return (
                  <div key={t.id} className="rounded-md border border-hairline bg-panel-2 p-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={t.done}
                        onChange={() => void toggle(t)}
                        className="mt-1 h-4 w-4 accent-treasury"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${t.done ? "text-faint line-through" : "text-paper"}`}>
                          {t.title}
                        </p>
                        <p className="text-xs text-muted">{t.detail}</p>
                        {t.dueDate && (
                          <p
                            className={`mt-0.5 font-mono text-xs ${
                              overdue || urgent ? "text-signal" : "text-faint"
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
                        className="shrink-0 rounded-md border border-brass/50 px-2.5 py-1 text-xs font-semibold text-brass transition-colors hover:bg-brass/10 disabled:opacity-50"
                      >
                        {assistBusy === t.id ? "Thinking…" : t.assist ? "Help ▾" : "Help me"}
                      </button>
                    </div>
                    {t.assist && openAssist.has(t.id) && (
                      <div className="mt-2 space-y-1 rounded-md border border-hairline bg-ink p-3">
                        <p className="font-mono text-[10px] font-medium tracking-[0.18em] text-faint">
                          HOW TO FINISH THIS
                        </p>
                        <div className="whitespace-pre-wrap text-xs leading-relaxed text-paper/85">
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
