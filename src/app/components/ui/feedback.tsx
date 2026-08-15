"use client";

/**
 * Federal Catalyst UI Kit — feedback surfaces.
 * Ported from the kit bundle (components/feedback/*.jsx).
 */

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Icon } from "./core";

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

/** Inline alert with an icon, body and one text action. */
export function AlertCard({
  tone = "danger",
  icon,
  title,
  children,
  action,
  onAction,
  className = "",
  ...rest
}: {
  tone?: "danger" | "info";
  icon?: string;
  title?: ReactNode;
  /** Text of the single trailing action. Omit for a passive notice. */
  action?: ReactNode;
  onAction?: () => void;
} & ComponentPropsWithoutRef<"div">) {
  const glyph = icon || (tone === "danger" ? "warning" : "info");
  const color = tone === "danger" ? "var(--color-error)" : "var(--color-primary)";
  return (
    <div className={cx("or-alert", `or-alert--${tone}`, className)} {...rest}>
      <Icon name={glyph} size={20} color={color} style={{ marginTop: 2 }} />
      <div style={{ flex: 1 }}>
        {title ? <h4 className="or-alert__title">{title}</h4> : null}
        <div className="or-alert__body">{children}</div>
        {action ? (
          <button
            type="button"
            className={
              tone === "danger" ? "or-btn or-btn--danger-text or-btn--sm" : "or-btn or-btn--tonal or-btn--sm"
            }
            onClick={onAction}
          >
            {action}
            {tone === "danger" ? <Icon name="arrow_forward" size={14} /> : null}
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** AI suggestion tile; `accent` adds the 4px primary spine of the top pick. */
export function SuggestionCard({
  title,
  children,
  action = "Insert",
  onAction,
  accent = false,
  className = "",
  ...rest
}: {
  title: ReactNode;
  action?: ReactNode;
  onAction?: () => void;
  accent?: boolean;
} & ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cx("or-suggestion", accent && "or-suggestion--accent", className)} {...rest}>
      {accent ? <div className="or-suggestion__spine" /> : null}
      <p className="or-suggestion__title">{title}</p>
      <p className="or-suggestion__body">{children}</p>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <button type="button" className="or-btn or-btn--text or-btn--sm" onClick={onAction}>
          {action}
        </button>
      </div>
    </div>
  );
}
