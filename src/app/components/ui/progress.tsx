"use client";

/**
 * Federal Catalyst UI Kit — progress + time.
 * Ported from the kit bundle (components/progress/*.jsx).
 */

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Badge, Icon } from "./core";

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

/** Horizontal application stepper with a filled track behind the dots. */
export function StepProgress({
  steps = [],
  current = 0,
  percent,
  className = "",
  ...rest
}: {
  steps?: string[];
  /** Index of the active step. Everything before it renders as done. */
  current?: number;
  /** Override the fill width when progress isn't evenly spaced by step. */
  percent?: number;
} & ComponentPropsWithoutRef<"div">) {
  const pct = percent ?? (steps.length > 1 ? (current / (steps.length - 1)) * 100 : 0);
  return (
    <div className={cx("or-steps", className)} {...rest}>
      <div className="or-steps__track" />
      <div className="or-steps__fill" style={{ width: `${pct}%` }} />
      {steps.map((label, i) => {
        const state = i < current ? "done" : i === current ? "current" : "todo";
        return (
          <div className="or-steps__step" key={label}>
            <div className={cx("or-steps__dot", state !== "todo" && `or-steps__dot--${state}`)}>
              {state === "done" ? <Icon name="check" size={16} /> : i + 1}
            </div>
            <span className={cx("or-steps__label", state !== "todo" && `or-steps__label--${state}`)}>
              {label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export type TimelineItem = {
  date: ReactNode;
  title: string;
  detail?: ReactNode;
  /** past (cyan) · current (blue ring) · future (grey). Defaults to todo. */
  state?: "done" | "current" | "todo";
  /** Red chip on the row — reserve it for deadlines. */
  badge?: ReactNode;
};

/** Vertical dated timeline: past (cyan), current (blue ring), future (grey). */
export function Timeline({
  items = [],
  className = "",
  ...rest
}: { items?: TimelineItem[] } & ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cx("or-timeline", className)} {...rest}>
      <div className="or-timeline__rule" />
      {items.map((it) => {
        const s = it.state || "todo";
        return (
          <div className="or-timeline__item" key={it.title}>
            <div className={cx("or-timeline__dot", s !== "todo" && `or-timeline__dot--${s}`)} />
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span className={cx("or-timeline__date", s !== "todo" && `or-timeline__date--${s}`)}>
                  {it.date}
                </span>
                <span
                  className="or-timeline__title"
                  style={{
                    fontWeight: s === "current" ? 700 : 400,
                    color: s === "todo" ? "var(--color-on-surface-variant)" : undefined,
                  }}
                >
                  {it.title}
                </span>
                {it.badge ? <Badge tone="danger">{it.badge}</Badge> : null}
              </div>
              {it.detail ? <p className="or-timeline__detail">{it.detail}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
