"use client";

/**
 * Federal Catalyst UI Kit — form controls.
 * Ported from the kit bundle (components/forms/*.jsx).
 */

import type { ChangeEvent, ComponentPropsWithoutRef, ReactNode } from "react";
import { Icon } from "./core";

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

/** Multiline field — the founder description box and inline notes. */
export function TextArea({ className = "", rows = 5, ...rest }: ComponentPropsWithoutRef<"textarea">) {
  return <textarea className={cx("or-field", className)} rows={rows} {...rest} />;
}

/** Radio/checkbox rendered as a full-width selectable card. */
export function OptionCard({
  label,
  hint,
  name,
  checked,
  onChange,
  type = "radio",
  className = "",
  ...rest
}: {
  label: ReactNode;
  hint?: ReactNode;
  name?: string;
  checked?: boolean;
  onChange?: (e: ChangeEvent<HTMLInputElement>) => void;
  type?: "radio" | "checkbox";
} & Omit<ComponentPropsWithoutRef<"label">, "onChange">) {
  return (
    <label className={cx("or-option", checked && "or-option--checked", className)} {...rest}>
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={onChange}
        style={{ marginTop: 4, accentColor: "var(--color-primary)" }}
      />
      <span>
        <span className="or-option__title">{label}</span>
        {hint ? <span className="or-option__hint">{hint}</span> : null}
      </span>
    </label>
  );
}

/** Assistant input: textarea, model picker, circular send button. */
export function ChatComposer({
  value,
  onChange,
  onSend,
  placeholder = "I need help with my application…",
  model = "GPT-4",
  rows = 2,
  className = "",
  ...rest
}: {
  value?: string;
  onChange?: (value: string) => void;
  onSend?: () => void;
  placeholder?: string;
  /** Label on the model picker. Show the model actually answering. */
  model?: string;
  rows?: number;
} & Omit<ComponentPropsWithoutRef<"div">, "onChange">) {
  return (
    <div className={cx("or-composer", className)} {...rest}>
      <textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
      />
      <div className="or-composer__bar">
        <button type="button" className="or-composer__model">
          {model}
          <Icon name="expand_more" size={16} />
        </button>
        <button
          type="button"
          className="or-composer__send"
          onClick={onSend}
          disabled={!value}
          aria-label="Send"
        >
          <Icon name="arrow_upward" size={18} />
        </button>
      </div>
    </div>
  );
}
