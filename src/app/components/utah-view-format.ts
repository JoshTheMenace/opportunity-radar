// Utah View — shared formatting helpers (pure functions, client-safe).

import { fmtUsd } from "./shared";

/** Compact USD that also handles billions (the shared formatter tops out at
 *  $NNNNM, which reads badly for Utah's $5.35B contract total). */
export function fmtUsdBig(n: number | null | undefined): string {
  if (n != null && n >= 1_000_000_000) {
    const b = n / 1_000_000_000;
    return `$${b >= 10 ? Math.round(b) : +b.toFixed(2)}B`;
  }
  return fmtUsd(n);
}

/** Soften ALL-CAPS source strings (same rules as utah-pathways/match-card):
 *  mixed-case passes through; within a shouted string short words keep caps
 *  except common connectors. */
const CONNECTORS = new Set(["OF", "THE", "AND", "FOR", "TO", "IN", "ON", "AT", "A", "AN"]);
export function humanize(s: string): string {
  if (/[a-z]/.test(s)) return s;
  return s
    .split(/\s+/)
    .map((w, i) => {
      const letters = w.replace(/[^A-Za-z]/g, "");
      if (letters.length <= 3) return i > 0 && CONNECTORS.has(letters) ? w.toLowerCase() : w;
      return w.charAt(0) + w.slice(1).toLowerCase();
    })
    .join(" ");
}

/** Case-insensitive key for city / agency comparisons. */
export function norm(s: string | null | undefined): string {
  return String(s ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** True when two agency display names refer to the same agency
 *  ("Department of Defense" vs "DOD — Air Force" style variants). */
export function sameAgency(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = norm(a);
  const y = norm(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

/** Full-dollar figure for stat rows ("$599,754"). */
export function fmtUsdFull(n: number | null | undefined): string {
  if (n == null) return "—";
  return `$${Math.round(n).toLocaleString("en-US")}`;
}

/** What the client layers in from the stored report (sessionStorage
 *  "or:lastReport"). Null when the founder hasn't run a scan — the page
 *  then shows no personalized chips at all. */
export interface UtahPersona {
  city: string | null; // profile.location.city
  topTitle: string | null; // #1 ranked match's opportunity title
  topAgency: string | null;
  topKind: string | null; // Opportunity.kind ("sbir_sttr", "procurement", …)
  /** opportunityId → fit tier, for real tiers on Utah-only programs. */
  tierById: Record<string, string>;
}
