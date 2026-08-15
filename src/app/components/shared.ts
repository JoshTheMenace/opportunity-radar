// Shared types + formatting helpers for the Opportunity Map components.

import type { FitTier, MatchReport, Opportunity, RankedMatch } from "@/lib/types";
import { formatUsdCompact } from "@/lib/engine/meter";

/** The report event carries an id→Opportunity lookup added by the API facade. */
export type UiReport = MatchReport & { opportunities?: Record<string, Opportunity> };

export type QuickReply = { label: string; message: string };

/** The agent's pointing power: which card to spotlight on the canvas.
 *  nonce changes on every point so the same card can be pointed at twice. */
export type Spotlight = { id: string; nonce: number };

/** Pagehead collapse/expand-all broadcast; nonce re-fires the same mode. */
export type BulkToggle = { mode: "collapse" | "expand"; nonce: number };

/** Matches below this score are noise — hidden from the report entirely. */
export const MIN_SCORE = 50;

/** Null-guarded wrapper around the engine's shared USD formatter. */
export function fmtUsd(n: number | null | undefined): string {
  return n == null ? "—" : formatUsdCompact(n);
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-10-15" → "Oct 15" (kit deadline style). Falls back to the raw string. */
export function fmtDate(iso: string | null): string | null {
  if (!iso) return null;
  const [, m, d] = iso.split("-").map(Number);
  return m >= 1 && m <= 12 && d >= 1 ? `${MONTHS[m - 1]} ${d}` : iso;
}

/** Tier chips in kit language: Badge tone + optional leading icon. */
export const TIER_META: Record<FitTier, { label: string; tone: "fit" | "caution" | "neutral"; icon?: string }> = {
  likely_fit: { label: "Likely fit", tone: "fit", icon: "check_circle" },
  verify_eligibility: { label: "Verify eligibility", tone: "caution" },
  adjacent: { label: "Adjacent", tone: "neutral" },
  not_a_fit: { label: "Not a fit", tone: "neutral" },
};

/** Tiers the pagehead filter offers (not_a_fit never clears MIN_SCORE). */
export const FILTERABLE_TIERS: FitTier[] = ["likely_fit", "verify_eligibility", "adjacent"];

export type SortMode = "score" | "deadline" | "amount";

/** The one list the page argues about: score-cleared, tier-filtered, sorted.
 *  Score stays the tiebreak so "deadline"/"amount" runs are still fit-ordered. */
export function visibleMatches(
  report: UiReport,
  filters: ReadonlySet<FitTier>,
  sort: SortMode,
): RankedMatch[] {
  const opps = report.opportunities ?? {};
  const amount = (m: RankedMatch) => {
    const o = opps[m.opportunityId];
    return o?.awardCeilingUsd ?? o?.awardFloorUsd ?? -1;
  };
  const close = (m: RankedMatch) => opps[m.opportunityId]?.closeDate ?? null;
  return report.matches
    .filter((m) => m.score >= MIN_SCORE && filters.has(m.tier))
    .sort((a, b) => {
      if (sort === "deadline") {
        const ca = close(a);
        const cb = close(b);
        if (ca !== cb) return ca == null ? 1 : cb == null ? -1 : ca.localeCompare(cb);
      } else if (sort === "amount") {
        const d = amount(b) - amount(a);
        if (d !== 0) return d;
      }
      return b.score - a.score;
    });
}

/** Prose → short bullet list (the rank LLM writes sentences; the kit shows bullets). */
export function bullets(s: string, max = 4): string[] {
  return s
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, max);
}

/**
 * Soften ALL-CAPS source strings ("CITY OF SPANISH FORK" → "City of Spanish Fork").
 * Strings that already contain lowercase ("NSF SBIR Phase I") pass through
 * untouched, so real acronyms in human-cased titles are preserved. Within a
 * shouted string, short words (≤3 letters, e.g. "NSF", "US") keep their caps
 * except common connectors, which read as lowercase.
 */
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

/**
 * Source rows sometimes repeat the agency ("SBA, SBA") — keep unique segments.
 * Also drops inverted-name tails like ", DEPARTMENT OF" left by source data.
 */
export function dedupeAgency(agency: string): string {
  const seen = new Set<string>();
  return agency
    .split(",")
    .map((s) => s.trim())
    .filter((s) => {
      const k = s.toLowerCase();
      if (!s || seen.has(k) || /\bof$/i.test(s)) return false;
      seen.add(k);
      return true;
    })
    .join(", ");
}
