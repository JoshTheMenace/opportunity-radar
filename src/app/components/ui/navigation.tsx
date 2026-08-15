"use client";

/**
 * Federal Catalyst UI Kit — navigation.
 * Ported from the kit bundle (components/navigation/*.jsx).
 *
 * DEVIATION FROM THE KIT: the kit renders every nav destination as a <button>
 * driven by onNavigate, because the artifact was a single-page demo. Here a
 * destination may instead carry an `href`, in which case it renders as a real
 * anchor so Next can prefetch it and the link is right-clickable. Passing a
 * bare string keeps the kit's original button behaviour.
 */

import type { ComponentPropsWithoutRef, ReactNode } from "react";
import { Avatar, Button, Icon, IconButton } from "./core";

const cx = (...parts: (string | false | undefined)[]) => parts.filter(Boolean).join(" ");

export type NavLink = string | { label: string; href?: string };

const labelOf = (l: NavLink) => (typeof l === "string" ? l : l.label);
const hrefOf = (l: NavLink) => (typeof l === "string" ? undefined : l.href);

/* -------------------------------------------------------------------------- */

export type Crumb = string | { label: string; href?: string };

/** Breadcrumb trail; the last item renders as the current page. */
export function Breadcrumb({
  items = [],
  className = "",
  ...rest
}: { items?: Crumb[] } & ComponentPropsWithoutRef<"div">) {
  return (
    <div className={cx("or-crumbs", className)} {...rest}>
      {items.map((it, i) => {
        const label = labelOf(it);
        const last = i === items.length - 1;
        return (
          <span key={label} style={{ display: "contents" }}>
            {i > 0 ? <Icon name="chevron_right" size={16} /> : null}
            {last ? (
              <span className="or-crumbs__current">{label}</span>
            ) : (
              <a href={hrefOf(it) || "#"}>{label}</a>
            )}
          </span>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */

/** App-wide top bar: wordmark, section links, chrome icons, primary CTA. */
export function TopNavBar({
  brand = "Opportunity Radar",
  links = [],
  activeLink,
  onNavigate,
  actions = ["notifications", "account_circle"],
  cta,
  onCta,
  glass = false,
  className = "",
  ...rest
}: {
  brand?: ReactNode;
  links?: NavLink[];
  activeLink?: string;
  onNavigate?: (label: string) => void;
  /** Material Symbols names for the chrome icons on the right. */
  actions?: string[];
  cta?: ReactNode;
  onCta?: () => void;
  /** Translucent bar for the workspace, where content scrolls beneath it. */
  glass?: boolean;
} & ComponentPropsWithoutRef<"nav">) {
  return (
    <nav className={cx("or-nav", glass && "or-nav--glass", className)} {...rest}>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-lg)" }}>
        <h1 className="or-nav__brand">{brand}</h1>
        <div className="or-nav__links">
          {links.map((l) => {
            const label = labelOf(l);
            const href = hrefOf(l);
            const cls = cx("or-nav__link", label === activeLink && "or-nav__link--active");
            return href ? (
              <a key={label} href={href} className={cls}>
                {label}
              </a>
            ) : (
              <button
                key={label}
                type="button"
                className={cls}
                onClick={onNavigate ? () => onNavigate(label) : undefined}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "var(--space-md)" }}>
        <div style={{ display: "flex", gap: "var(--space-sm)" }}>
          {actions.map((a) => (
            <IconButton key={a} icon={a} aria-label={a} />
          ))}
        </div>
        {cta ? (
          <Button pill onClick={onCta}>
            {cta}
          </Button>
        ) : null}
      </div>
    </nav>
  );
}

/* -------------------------------------------------------------------------- */

export type SideNavItem = {
  label: string;
  icon: string;
  href?: string;
  /** `danger` tints the row — used for blocked/overdue destinations. */
  tone?: "default" | "danger";
};

/** 256px workspace side nav: identity block, sections, footer utilities. */
export function SideNavBar({
  name,
  role,
  initials,
  items = [],
  footerItems = [],
  activeItem,
  onSelect,
  cta,
  onCta,
  className = "",
  ...rest
}: {
  name?: ReactNode;
  role?: ReactNode;
  initials?: string;
  items?: SideNavItem[];
  footerItems?: SideNavItem[];
  activeItem?: string;
  onSelect?: (label: string) => void;
  cta?: ReactNode;
  onCta?: () => void;
} & ComponentPropsWithoutRef<"aside">) {
  const row = (it: SideNavItem) => {
    const cls = cx(
      "or-side__row",
      it.label === activeItem && "or-side__row--active",
      it.tone === "danger" && "or-side__row--danger",
    );
    const inner = (
      <>
        <Icon name={it.icon} size={24} />
        {it.label}
      </>
    );
    return it.href ? (
      <a key={it.label} href={it.href} className={cls} style={{ width: "100%" }}>
        {inner}
      </a>
    ) : (
      <button
        key={it.label}
        type="button"
        onClick={onSelect ? () => onSelect(it.label) : undefined}
        className={cls}
        style={{ width: "100%", textAlign: "left" }}
      >
        {inner}
      </button>
    );
  };

  return (
    <aside className={cx("or-side", className)} {...rest}>
      {name ? (
        <div
          style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32, padding: "0 16px" }}
        >
          <Avatar initials={initials} />
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                font: "700 var(--text-headline-md-size)/var(--text-headline-md-line) var(--font-headline)",
                color: "var(--color-primary)",
              }}
            >
              {name}
            </h2>
            <p
              style={{
                margin: 0,
                font: "var(--text-label-sm-weight) var(--text-label-sm-size)/var(--text-label-sm-line) var(--font-label)",
                letterSpacing: "var(--text-label-sm-tracking)",
                color: "var(--color-on-surface-variant)",
              }}
            >
              {role}
            </p>
          </div>
        </div>
      ) : null}
      <nav style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>{items.map(row)}</nav>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8,
          paddingTop: 16,
          borderTop: "1px solid var(--color-border-ice)",
        }}
      >
        {footerItems.map(row)}
        {cta ? (
          <Button pill block onClick={onCta} style={{ marginTop: 16 }}>
            {cta}
          </Button>
        ) : null}
      </div>
    </aside>
  );
}
