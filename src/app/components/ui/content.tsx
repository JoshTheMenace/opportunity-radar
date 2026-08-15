"use client";

/**
 * Federal Catalyst UI Kit — content surfaces.
 * Ported from the kit bundle (components/content/*.jsx).
 */

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Avatar, Badge, Button, Icon, IconButton } from "./core";
import type { BadgeTone } from "./core";

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

/** The historical precedent the brief asks for: a comparable funded company. */
export type FundingTwin = {
  name: string;
  detail: ReactNode;
  eyebrow?: string;
};

/** The product's signature surface: one funding match, with its reasoning. */
export function OpportunityCard({
  title,
  amount,
  deadline,
  identifier,
  tier = "fit",
  tierLabel = "Likely fit",
  summary,
  whyFit = [],
  disqualifiers = [],
  twin,
  prepTime,
  onSave,
  onStart,
  primaryAction = "Start Pre-flight",
  secondaryAction = "Save for Later",
  className = "",
  ...rest
}: {
  title: ReactNode;
  /** Pre-formatted award value. Format upstream — never compute it here. */
  amount?: ReactNode;
  deadline?: ReactNode;
  /** Program number / opportunity ID, straight from the source record. */
  identifier?: ReactNode;
  tier?: BadgeTone;
  tierLabel?: ReactNode;
  summary?: ReactNode;
  whyFit?: string[];
  disqualifiers?: string[];
  twin?: FundingTwin;
  prepTime?: ReactNode;
  onSave?: () => void;
  onStart?: () => void;
  primaryAction?: ReactNode;
  secondaryAction?: ReactNode;
} & ComponentPropsWithoutRef<"article">) {
  return (
    <article className={cx("or-opp", className)} {...rest}>
      <div className="or-opp__head">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4 }}>
              <Badge tone={tier} icon={tier === "fit" ? "check_circle" : undefined}>
                {tierLabel}
              </Badge>
              {identifier ? <span className="or-opp__meta">ID: {identifier}</span> : null}
            </div>
            <h4 className="or-opp__title">{title}</h4>
          </div>
          <div style={{ textAlign: "right" }}>
            <span className="or-opp__amount">{amount}</span>
            {deadline ? <span className="or-opp__meta">Deadline: {deadline}</span> : null}
          </div>
        </div>
        {summary ? <p className="or-opp__lede">{summary}</p> : null}
      </div>

      <div className="or-opp__body">
        {whyFit.length ? (
          <div>
            <h5 className="or-opp__h5">
              <Icon name="done_all" size={18} color="var(--color-primary)" /> Why it fits
            </h5>
            <ul className="or-opp__list">
              {whyFit.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {disqualifiers.length ? (
          <div>
            <h5 className="or-opp__h5" style={{ color: "var(--color-error)" }}>
              <Icon name="warning" size={18} /> What could disqualify
            </h5>
            <ul className="or-opp__list">
              {disqualifiers.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {twin ? (
          <div style={{ gridColumn: "1 / -1", paddingTop: 12, borderTop: "1px solid var(--color-border-ice)" }}>
            <h5 className="or-opp__h5">
              <Icon name="group" size={18} color="var(--color-outline)" /> Who else got this money
            </h5>
            <div className="or-opp__twin">
              <span
                style={{
                  background: "rgba(126,212,253,.2)",
                  padding: 8,
                  borderRadius: 9999,
                  marginTop: 4,
                  display: "inline-flex",
                }}
              >
                <Icon name="handshake" size={20} color="var(--color-secondary)" />
              </span>
              <div>
                <span
                  style={{
                    font: "var(--text-label-sm-weight) var(--text-label-sm-size)/var(--text-label-sm-line) var(--font-label)",
                    letterSpacing: "var(--text-label-sm-tracking)",
                    color: "var(--color-secondary)",
                    textTransform: "uppercase",
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  {twin.eyebrow || "Your Funding Twin"}
                </span>
                <h6
                  style={{
                    margin: 0,
                    font: "500 var(--text-body-md-size)/var(--text-body-md-line) var(--font-body)",
                    color: "var(--color-text-deep)",
                  }}
                >
                  {twin.name}
                </h6>
                <p
                  style={{
                    margin: "4px 0 0",
                    font: "400 var(--text-body-sm-size)/var(--text-body-sm-line) var(--font-body)",
                    color: "var(--color-on-surface-variant)",
                  }}
                >
                  {twin.detail}
                </p>
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className="or-opp__foot">
        <span className="or-opp__meta" style={{ color: "var(--color-on-surface-variant)", marginLeft: 8 }}>
          {prepTime}
        </span>
        <div style={{ display: "flex", gap: 12 }}>
          <Button variant="outline" onClick={onSave}>
            {secondaryAction}
          </Button>
          <Button iconAfter="arrow_forward" onClick={onStart}>
            {primaryAction}
          </Button>
        </div>
      </div>
    </article>
  );
}

/* -------------------------------------------------------------------------- */

/** One task in a pursuit checklist. */
export function TaskRow({
  title,
  detail,
  state = "todo",
  due,
  urgent = false,
  assignee,
  className = "",
  ...rest
}: {
  title: ReactNode;
  detail?: ReactNode;
  state?: "done" | "current" | "todo";
  due?: ReactNode;
  /** Turns the due date red. Reserve it for dates that actually bind. */
  urgent?: boolean;
  /** Initials for the owner avatar. */
  assignee?: string;
} & ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cx("or-task", state === "current" && "or-task--current", className)} {...rest}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
        {state === "done" ? (
          <Icon name="check_circle" size={24} color="var(--color-secondary)" style={{ marginTop: 2 }} />
        ) : state === "current" ? (
          <div className="or-task__radio" />
        ) : (
          <div className="or-task__box" />
        )}
        <div>
          <p className={cx("or-task__title", state === "done" && "or-task__title--done")}>{title}</p>
          {detail ? <p className="or-task__detail">{detail}</p> : null}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        {due ? <span className={cx("or-task__due", urgent && "or-task__due--urgent")}>{due}</span> : null}
        {assignee ? <Avatar initials={assignee} size="xs" muted={state !== "current"} /> : null}
        <IconButton icon="more_vert" size={16} dense aria-label="Task actions" />
      </div>
    </div>
  );
}
