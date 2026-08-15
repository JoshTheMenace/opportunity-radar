"use client";

/**
 * Federal Catalyst UI Kit — core primitives.
 *
 * Ported from the kit bundle (components/core/*.jsx) with its prop contracts
 * intact: same names, same defaults, same class output. Styling lives entirely
 * in styles/catalyst-kit.css — never add a Tailwind class here.
 */

import type { ComponentPropsWithoutRef, CSSProperties, ReactNode } from "react";

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

/* -------------------------------------------------------------------------- */

/** Material Symbols Outlined glyph — the design system's only icon source. */
export function Icon({
  name,
  size = 24,
  fill = false,
  color,
  className = "",
  style,
  ...rest
}: {
  name: string;
  size?: number;
  fill?: boolean;
  color?: string;
} & Omit<ComponentPropsWithoutRef<"span">, "color">) {
  return (
    <span
      className={cx("material-symbols-outlined", fill && "fill", className)}
      style={{ fontSize: size, color, ...style }}
      {...rest}
    >
      {name}
    </span>
  );
}

/* -------------------------------------------------------------------------- */

const AVATAR_SIZES = { xs: 24, sm: 32, md: 40, lg: 80 } as const;

/** Initials or photo avatar. */
export function Avatar({
  initials,
  src,
  alt = "",
  size = "md",
  muted = false,
  className = "",
  style,
  ...rest
}: {
  initials?: string;
  src?: string;
  alt?: string;
  size?: keyof typeof AVATAR_SIZES;
  muted?: boolean;
} & Omit<ComponentPropsWithoutRef<"span">, "children">) {
  const px = AVATAR_SIZES[size] ?? AVATAR_SIZES.md;
  const cls = cx("or-avatar", muted && "or-avatar--muted", className);
  const dims: CSSProperties = {
    width: px,
    height: px,
    fontSize: px <= 24 ? 10 : px <= 32 ? 12 : px <= 40 ? 16 : 28,
    ...style,
  };
  // eslint-disable-next-line @next/next/no-img-element
  if (src) return <img className={cls} src={src} alt={alt} style={dims} />;
  return (
    <span className={cls} style={dims} {...rest}>
      {initials}
    </span>
  );
}

/* -------------------------------------------------------------------------- */

export type ButtonVariant = "filled" | "outline" | "tonal" | "glass" | "text" | "danger-text";

/** Action button. Filled is the only primary action per view. */
export function Button({
  variant = "filled",
  size = "md",
  pill = false,
  block = false,
  icon,
  iconAfter,
  className = "",
  children,
  ...rest
}: {
  variant?: ButtonVariant;
  size?: "md" | "sm";
  pill?: boolean;
  block?: boolean;
  icon?: string;
  iconAfter?: string;
} & ComponentPropsWithoutRef<"button">) {
  const glyph = size === "sm" ? 16 : 18;
  return (
    <button
      type="button"
      className={cx(
        "or-btn",
        `or-btn--${variant}`,
        size === "sm" && "or-btn--sm",
        pill && "or-btn--pill",
        block && "or-btn--block",
        className,
      )}
      {...rest}
    >
      {icon ? <Icon name={icon} size={glyph} /> : null}
      {children}
      {iconAfter ? <Icon name={iconAfter} size={glyph} /> : null}
    </button>
  );
}

/* -------------------------------------------------------------------------- */

/** Circular icon-only control used in nav bars, drawers and toolbars. */
export function IconButton({
  icon,
  size = 24,
  active = false,
  dense = false,
  className = "",
  ...rest
}: {
  icon: string;
  size?: number;
  active?: boolean;
  dense?: boolean;
} & ComponentPropsWithoutRef<"button">) {
  return (
    <button
      type="button"
      className={cx("or-iconbtn", active && "or-iconbtn--active", dense && "or-iconbtn--sm", className)}
      {...rest}
    >
      <Icon name={icon} size={size} />
    </button>
  );
}

/* -------------------------------------------------------------------------- */

export type CardVariant = "solid" | "glass" | "sunken" | "dashed" | "outlined";

/** Surface container. Solid white for data, glass for workspace chrome. */
export function Card({
  variant = "solid",
  flush = false,
  className = "",
  children,
  ...rest
}: {
  variant?: CardVariant;
  flush?: boolean;
} & ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cx(
        "or-card",
        variant !== "solid" && `or-card--${variant}`,
        flush && "or-card--flush",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Fit tiers map to the brief's clarity flags: fit/caution/neutral/danger. */
export type BadgeTone = "fit" | "primary" | "secondary" | "caution" | "danger" | "neutral" | "outline";

/** Small status chip: fit tier, hold reason, confidence, urgency. */
export function Badge({
  tone = "neutral",
  pill = false,
  icon,
  className = "",
  children,
  ...rest
}: {
  tone?: BadgeTone;
  pill?: boolean;
  icon?: string;
} & ComponentPropsWithoutRef<"span">) {
  return (
    <span className={cx("or-badge", `or-badge--${tone}`, pill && "or-badge--pill", className)} {...rest}>
      {icon ? <Icon name={icon} size={14} /> : null}
      {children}
    </span>
  );
}

/* -------------------------------------------------------------------------- */

/** Profile fact row: mono label left, value right, hairline rule under. */
export function KeyValueRow({
  label,
  value,
  tone = "default",
  pulse = false,
  className = "",
  ...rest
}: {
  label: ReactNode;
  value: ReactNode;
  /** `danger` marks an unknown that is actively blocking a match. */
  tone?: "default" | "danger";
  /** Pulsing dot — draws the eye to the field the agent wants answered. */
  pulse?: boolean;
} & ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cx("or-kv", tone === "danger" && "or-kv--danger", className)} {...rest}>
      <span className="or-kv__label">
        {pulse ? (
          <span className="or-ping">
            <span />
            <span />
          </span>
        ) : null}
        {label}
      </span>
      <span className="or-kv__value">{value}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** 4px completion bar; `top` pins it to the top edge of a card. */
export function ProgressBar({
  value = 0,
  top = false,
  rounded = false,
  className = "",
  ...rest
}: {
  value?: number;
  top?: boolean;
  rounded?: boolean;
} & ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cx("or-progress", top && "or-progress--top", rounded && "or-progress--rounded", className)}
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={0}
      aria-valuemax={100}
      {...rest}
    >
      <div className="or-progress__fill" style={{ width: `${value}%`, borderRadius: rounded ? 9999 : 0 }} />
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** Icon + label + value metric tile used in workspace headers. */
export function StatTile({
  icon,
  label,
  value,
  iconColor = "var(--color-primary)",
  className = "",
  ...rest
}: {
  icon?: string;
  label: ReactNode;
  value: ReactNode;
  iconColor?: string;
} & ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cx("or-stat", className)} {...rest}>
      {icon ? <Icon name={icon} size={24} color={iconColor} /> : null}
      <div>
        <p className="or-stat__label">{label}</p>
        <p className="or-stat__value">{value}</p>
      </div>
    </div>
  );
}
