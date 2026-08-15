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
      <section id="pursuit" className="space-y-2 rounded-lg border border-blue-500/40 bg-blue-500/5 p-4">
        <h2 className="text-base font-bold">Go after this funding</h2>
        <p className="text-sm text-neutral-400">
          We&apos;ll build you a submission plan for this specific program — registrations,
          eligibility checks, narrative sections, budget, and a timeline working back from the
          deadline. Then we help you finish every task.
        </p>
        {error && <p className="text-sm text-red-400">{error}</p>}
        <button
          onClick={start}
          disabled={phase === "building"}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold hover:bg-blue-500 disabled:opacity-60"
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

  return (
    <section id="pursuit" className="space-y-4 rounded-lg border border-blue-500/40 bg-blue-500/5 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-bold">Your submission plan</h2>
        <label className="flex items-center gap-2 text-xs text-neutral-400">
          status
          <select
            value={pursuit?.status ?? "active"}
            onChange={(e) => void setStatus(e.target.value)}
            className="rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-xs"
          >
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      {pursuit?.planSummary && (
        <p className="text-sm leading-relaxed text-neutral-300">{pursuit.planSummary}</p>
      )}

      {/* progress */}
      <div id="pursuit-progress" className="space-y-1">
        <div className="h-2 overflow-hidden rounded-full bg-neutral-800">
          <div className="h-full rounded-full bg-green-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-neutral-500">
          {done}/{tasks.length} tasks done · {pct}%
        </p>
      </div>

      {/* phased task list */}
      <div id="pursuit-tasks" className="space-y-3">
        {phases.map((ph) => (
          <div key={ph} className="space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{ph}</p>
            {tasks
              .filter((t) => t.phase === ph)
              .map((t) => {
                const overdue = !t.done && t.dueDate != null && t.dueDate < today;
                return (
                  <div key={t.id} className="rounded-lg border border-neutral-800 bg-neutral-950 p-3">
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={t.done}
                        onChange={() => void toggle(t)}
                        className="mt-1 h-4 w-4 accent-green-500"
                      />
                      <div className="min-w-0 flex-1">
                        <p className={`text-sm ${t.done ? "text-neutral-500 line-through" : ""}`}>
                          {t.title}
                        </p>
                        <p className="text-xs text-neutral-500">{t.detail}</p>
                        {t.dueDate && (
                          <p className={`mt-0.5 text-xs ${overdue ? "text-red-400" : "text-neutral-600"}`}>
                            due {t.dueDate}
                            {overdue ? " · overdue" : ""}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={() => void assist(t)}
                        disabled={assistBusy === t.id}
                        className="shrink-0 rounded-md border border-blue-500/40 px-2.5 py-1 text-xs text-blue-300 hover:bg-blue-500/10 disabled:opacity-50"
                      >
                        {assistBusy === t.id ? "Thinking…" : t.assist ? "Help ▾" : "Help me"}
                      </button>
                    </div>
                    {t.assist && openAssist.has(t.id) && (
                      <div className="mt-2 whitespace-pre-wrap rounded-md border border-neutral-800 bg-neutral-900 p-3 text-xs leading-relaxed text-neutral-300">
                        {t.assist}
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
