"use client";

// The pursuit workspace: turn interest into an actual submission. One click
// builds an AI + rules submission plan; after that this renders the full
// Federal Catalyst workspace — header + progress card, phased task cards with
// one-line rows that expand on click, a SAM.gov alert, and a deadline
// timeline rail. "Help me" routes task guidance through the Assistant drawer.

import { useEffect, useState } from "react";
import type { PursuitRecord, PursuitTask } from "@/lib/pursuit/db";
import type { Opportunity } from "@/lib/types";
import { AlertCard, Badge, Button, Card, Icon, StatTile, Timeline, type TimelineItem } from "@/app/components/ui";
import { useAssistant, usePageAssistantContext } from "@/app/components/assistant/context";

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

/** ALL-CAPS words longer than 3 chars → Capitalized; short/mixed words unchanged. */
function humanize(s: string): string {
  return s.replace(/\b[A-Z]{4,}\b/g, (w) => w[0] + w.slice(1).toLowerCase());
}

const BODY_SM: React.CSSProperties = {
  margin: 0,
  font: "400 14px/20px var(--font-body)",
  color: "var(--color-on-surface-variant)",
};

/** Rotating chevron; open = pointing down. */
function Chevron({ open, size = 18 }: { open: boolean; size?: number }) {
  return (
    <Icon
      name="expand_more"
      size={size}
      className="mk-opp__chev"
      style={{ transform: open ? undefined : "rotate(-90deg)" }}
    />
  );
}

export default function PursuitPanel({ opportunityId }: { opportunityId: string }) {
  const [phase, setPhase] = useState<Phase>("loading");
  const [pursuit, setPursuit] = useState<PursuitRecord | null>(null);
  const [tasks, setTasks] = useState<PursuitTask[]>([]);
  const [opp, setOpp] = useState<Opportunity | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [doneOpen, setDoneOpen] = useState<Set<string>>(new Set());
  const [strategyOpen, setStrategyOpen] = useState(false);
  const [helpBusy, setHelpBusy] = useState<number | null>(null);
  const { runTask } = useAssistant();

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

  // ---------- derived (before hooks/returns so hook order stays stable) ----------

  const done = tasks.filter((t) => t.done).length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
  const phases = [...new Set(tasks.map((t) => t.phase))];
  const today = new Date().toISOString().slice(0, 10);
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

  // Tell the sidebar assistant what this workspace is showing — real state only.
  usePageAssistantContext(
    phase === "ready" && pursuit
      ? {
          page: "pursuits",
          title: `Pursuit — ${opp?.title ? humanize(opp.title) : pursuit.opportunityId}`,
          data: {
            status: pursuit.status,
            pct,
            target,
            phases: phases.map((ph) => {
              const pt = tasks.filter((t) => t.phase === ph);
              return { name: ph, done: pt.filter((t) => t.done).length, total: pt.length };
            }),
            nextOpenTasks: tasks
              .filter((t) => !t.done)
              .slice(0, 3)
              .map((t) => ({ title: t.title, dueDate: t.dueDate })),
            samUnconfirmed: samTask != null,
          },
        }
      : null,
  );

  // ---------- actions ----------

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

  /** "Help me" → the Assistant drawer. Cached guidance answers instantly;
   *  otherwise generate it once via the assist route and keep it on the task. */
  function helpMe(task: PursuitTask) {
    if (!pursuit || helpBusy != null) return;
    setHelpBusy(task.id);
    runTask(`Help me with: ${task.title}`, async () => {
      try {
        if (task.assist) return task.assist;
        const res = await fetch(`/api/pursuits/${pursuit.id}/assist`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ taskId: task.id }),
        });
        const d = await res.json();
        if (!res.ok || !d.assist) throw new Error(d.error ?? `HTTP ${res.status}`);
        setTasks((ts) => ts.map((t) => (t.id === task.id ? { ...t, assist: d.assist } : t)));
        return d.assist as string;
      } finally {
        setHelpBusy(null);
      }
    });
  }

  function toggleExpand(id: number) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleDone(ph: string) {
    setDoneOpen((s) => {
      const next = new Set(s);
      if (next.has(ph)) next.delete(ph);
      else next.add(ph);
      return next;
    });
  }

  // ---------- render ----------

  if (phase === "loading") {
    return (
      <section id="pursuit">
        <div className="or-card shimmer" style={{ height: 96 }} />
      </section>
    );
  }

  if (phase !== "ready") {
    return (
      <section id="pursuit">
        <Card style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 12 }}>
          <h2 className="mk-h4" style={{ margin: 0 }}>
            Go after this funding
          </h2>
          <p style={BODY_SM}>
            We&apos;ll build you a submission plan for this specific program — registrations,
            eligibility checks, narrative sections, budget, and a timeline working back from the
            deadline. Then we help you finish every task.
          </p>
          {error && <p style={{ ...BODY_SM, color: "var(--color-error)" }}>{error}</p>}
          <Button iconAfter="arrow_forward" onClick={() => void start()} disabled={phase === "building"}>
            {phase === "building" ? "Building your plan… (~30s)" : "Start Pre-flight"}
          </Button>
        </Card>
      </section>
    );
  }

  const renderTask = (t: PursuitTask) => {
    const overdue = !t.done && t.dueDate != null && t.dueDate < today;
    const urgent = overdue || (!t.done && t.dueDate != null && daysUntil(t.dueDate) <= 3);
    const isOpen = expanded.has(t.id);
    return (
      <div
        key={t.id}
        id={`task-${t.id}`}
        className={`or-task${t.id === firstOpenId ? " or-task--current" : ""}`}
        style={{ cursor: "pointer" }}
        onClick={(e) => {
          // The row expands; real controls inside keep their own jobs.
          if ((e.target as HTMLElement).closest("button, a")) return;
          toggleExpand(t.id);
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12, flex: 1, minWidth: 0 }}>
          <button
            className="mk-check"
            role="checkbox"
            aria-checked={t.done}
            aria-label={`Mark "${t.title}" ${t.done ? "incomplete" : "complete"}`}
            onClick={() => void toggle(t)}
          >
            <Icon name="check" size={14} />
          </button>
          <div style={{ minWidth: 0, flex: 1 }}>
            <p className={`or-task__title${t.done ? " or-task__title--done" : ""}`}>{t.title}</p>
            {isOpen && (
              <div id={`task-detail-${t.id}`} style={{ marginTop: 6 }}>
                <p className="or-task__detail">{t.detail}</p>
                <Button
                  variant="tonal"
                  size="sm"
                  icon="support_agent"
                  style={{ marginTop: 10 }}
                  disabled={helpBusy != null}
                  onClick={() => helpMe(t)}
                >
                  {helpBusy === t.id ? "Thinking…" : "Help me"}
                </Button>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flex: "none" }}>
          {t.dueDate && (
            <span
              className={`or-task__due${urgent ? " or-task__due--urgent" : ""}`}
              title={`due ${t.dueDate}${overdue ? " · overdue" : ""}`}
            >
              {monthDay(t.dueDate)}
            </span>
          )}
          <button
            className="or-iconbtn or-iconbtn--sm"
            aria-expanded={isOpen}
            aria-controls={`task-detail-${t.id}`}
            aria-label={`${isOpen ? "Hide" : "Show"} details for "${t.title}"`}
            onClick={() => toggleExpand(t.id)}
          >
            <Chevron open={isOpen} />
          </button>
        </div>
      </div>
    );
  };

  const timelineItems: TimelineItem[] = [
    ...(pursuit
      ? [{ date: monthDay(pursuit.createdAt.slice(0, 10)), title: "Pursuit created", state: "done" as const }]
      : []),
    ...timeline.map((t) => {
      const du = daysUntil(t.dueDate);
      return {
        date: monthDay(t.dueDate),
        title: t.title,
        state: t.done ? ("done" as const) : t.id === nextTimelineId ? ("current" as const) : ("todo" as const),
        badge:
          !t.done && du >= 0 && du <= 3
            ? du === 0
              ? "DUE TODAY"
              : `IN ${du} DAY${du === 1 ? "" : "S"}`
            : undefined,
      };
    }),
    ...(submitTask && submitTask.dueDate == null
      ? [{ date: "TBD", title: submitTask.title, state: submitTask.done ? ("done" as const) : ("todo" as const) }]
      : []),
  ];

  return (
    <section id="pursuit" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* workspace header: title, official notice, status */}
      <div className="mk-between" style={{ alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
        <h2 className="mk-h3">{opp?.title ? humanize(opp.title) : "Pursuit"} Workspace</h2>
        <div className="mk-row">
          {opp?.url && (
            <a className="or-btn or-btn--outline" href={opp.url} target="_blank" rel="noreferrer">
              Review official notice
              <Icon name="open_in_new" size={16} />
            </a>
          )}
          <label className="mk-label" style={{ display: "flex", alignItems: "center", gap: 8, textTransform: "uppercase" }}>
            Status
            <select
              className="or-field"
              style={{ width: "auto", padding: "6px 10px", textTransform: "none", letterSpacing: "normal" }}
              value={pursuit?.status ?? "active"}
              onChange={(e) => void setStatus(e.target.value)}
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

      {/* progress card: % ready + target chip + bar + stat tiles */}
      <Card id="pursuit-progress-card">
        <div className="mk-between" style={{ flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span className="mk-meter__value">{pct}% ready</span>
            <span className="mk-label">
              {done}/{tasks.length} TASKS
            </span>
          </div>
          {target && (
            <Badge tone="primary" pill icon="flag">
              Target {monthDay(target)}
            </Badge>
          )}
        </div>
        <div
          id="pursuit-progress"
          className="mk-meter__track"
          style={{ marginTop: 12 }}
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Plan readiness"
        >
          <div className="mk-meter__fill" style={{ width: `${pct}%` }} />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 16 }}>
          {match && (
            <StatTile
              icon="verified"
              iconColor="var(--color-fit-strong)"
              label="FIT SCORE"
              value={`${match.tier.replace(/_/g, " ")} (${match.score})`}
              style={{ textTransform: "capitalize" }}
            />
          )}
          {funding && <StatTile icon="payments" label="FUNDING" value={funding} />}
        </div>
      </Card>

      {/* workspace grid: task cards + strategy (8) / warning + timeline rail (4) */}
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-12">
        <div id="pursuit-tasks" className="flex flex-col gap-5 xl:col-span-8">
          {/* phased task cards: one-line rows, completed collapsed into a counted group */}
          {phases.map((ph) => {
            const phTasks = tasks.filter((t) => t.phase === ph);
            const phDone = phTasks.filter((t) => t.done);
            const phOpen = phTasks.filter((t) => !t.done);
            const showDone = doneOpen.has(ph);
            return (
              <Card flush key={ph}>
                <div className="mk-cardhead">
                  {ph}
                  <span className="mk-num" style={{ fontSize: 12, color: "var(--color-outline)" }}>
                    {phDone.length}/{phTasks.length} done
                  </span>
                </div>
                {phOpen.map(renderTask)}
                {phDone.length > 0 && (
                  <>
                    <button
                      className="mk-donehead"
                      aria-expanded={showDone}
                      aria-controls={`done-${ph.replace(/\W+/g, "-")}`}
                      onClick={() => toggleDone(ph)}
                    >
                      Completed ({phDone.length})
                      <Chevron open={showDone} />
                    </button>
                    <div id={`done-${ph.replace(/\W+/g, "-")}`} hidden={!showDone}>
                      {phDone.map(renderTask)}
                    </div>
                  </>
                )}
              </Card>
            );
          })}

          {/* plan strategy — collapsed disclosure, not an always-open panel */}
          {pursuit?.planSummary && (
            <Card flush>
              <button
                className="mk-opp__toggle"
                aria-expanded={strategyOpen}
                aria-controls="pursuit-strategy"
                onClick={() => setStrategyOpen((o) => !o)}
              >
                <div className="mk-cardhead" style={strategyOpen ? undefined : { borderBottom: 0 }}>
                  Strategy
                  <Chevron open={strategyOpen} />
                </div>
              </button>
              <div id="pursuit-strategy" hidden={!strategyOpen} className="mk-cardbody">
                <p style={{ ...BODY_SM, whiteSpace: "pre-wrap" }}>{pursuit.planSummary}</p>
              </div>
            </Card>
          )}
        </div>

        {/* right rail: SAM.gov warning + deadline timeline */}
        <div className="flex flex-col gap-5 xl:col-span-4">
          {samTask && (
            <AlertCard
              tone="danger"
              icon="warning"
              title="SAM.gov status unconfirmed"
              action="Verify now"
              onAction={() => {
                setExpanded((s) => new Set(s).add(samTask.id));
                document
                  .getElementById(`task-${samTask.id}`)
                  ?.scrollIntoView({ behavior: "smooth", block: "center" });
              }}
            >
              Active registration is required at time of submission.
              {samTask.dueDate && (
                <>
                  {" "}
                  Confirm or update before <strong className="mk-num">{monthDay(samTask.dueDate)}</strong>.
                </>
              )}
            </AlertCard>
          )}

          <Card flush className="xl:sticky xl:top-24">
            <div className="mk-cardhead">Deadline Timeline</div>
            <div className="mk-cardbody">
              <Timeline items={timelineItems} />
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
