"use client";

// Region: Action Plan — the mock's or-task checklist, derived from the TOP
// match's plan-backward timeline (engine/timeline.ts). Real dates only;
// renders nothing until a report with a strong match exists. Checkboxes are
// the founder's local scratchpad (nothing invents completion for them);
// steps past the first three fold behind a counted toggle.

import { useState } from "react";
import { buildTimeline } from "@/lib/engine/timeline";
import { Icon } from "./ui";
import { MIN_SCORE, fmtDate, type UiReport } from "./shared";
import type { TimelineStep } from "@/lib/engine/timeline";

export default function ActionPlan({ report }: { report: UiReport | null }) {
  const [showRest, setShowRest] = useState(false);
  const [done, setDone] = useState<Set<string>>(new Set());
  const top = report?.matches.find((m) => m.score >= MIN_SCORE);
  const opp = top ? report?.opportunities?.[top.opportunityId] : undefined;
  if (!top || !opp || !report) return null;
  const steps = buildTimeline(opp, report.profile);
  if (steps.length === 0) return null;
  const head = steps.slice(0, 3);
  const rest = steps.slice(3);

  const toggle = (title: string) =>
    setDone((s) => {
      const next = new Set(s);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  const TaskRow = ({ step, current }: { step: TimelineStep; current: boolean }) => {
    const checked = done.has(step.title);
    return (
      <div className={`or-task${current ? " or-task--current" : ""}`}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <button
            type="button"
            className="mk-check"
            role="checkbox"
            aria-checked={checked}
            aria-label={`Mark "${step.title}" ${checked ? "incomplete" : "complete"}`}
            onClick={() => toggle(step.title)}
          >
            <Icon name="check" size={14} aria-hidden />
          </button>
          <div>
            <p className={`or-task__title${checked ? " or-task__title--done" : ""}`}>{step.title}</p>
            <p className="or-task__detail line-clamp-2">{step.detail}</p>
          </div>
        </div>
        <span className={`or-task__due${step.urgent ? " or-task__due--urgent" : ""}`}>
          {step.due ? fmtDate(step.due)!.toUpperCase() : "ROLLING"}
        </span>
      </div>
    );
  };

  return (
    <section className="or-card or-card--flush">
      <div className="mk-cardhead">
        Action Plan
        <span className="mk-label" title={opp.title}>
          {opp.title.length > 26 ? opp.title.slice(0, 26) + "…" : opp.title}
        </span>
      </div>
      {head.map((s, i) => (
        <TaskRow key={s.title} step={s} current={i === 0} />
      ))}
      {rest.length > 0 && (
        <>
          <button
            type="button"
            className="mk-donehead"
            aria-expanded={showRest}
            aria-controls="plan-rest"
            onClick={() => setShowRest((v) => !v)}
          >
            Later steps ({rest.length})
            <Icon
              name="expand_more"
              className="mk-opp__chev"
              style={showRest ? undefined : { transform: "rotate(-90deg)" }}
              aria-hidden
            />
          </button>
          <div id="plan-rest" hidden={!showRest}>
            {rest.map((s) => (
              <TaskRow key={s.title} step={s} current={false} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
