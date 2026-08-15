// Shared types + formatting helpers for the Opportunity Map components.

import type { FitTier, MatchReport, Opportunity } from "@/lib/types";
import { formatUsdCompact } from "@/lib/engine/meter";

/** The report event carries an id→Opportunity lookup added by the API facade. */
export type UiReport = MatchReport & { opportunities?: Record<string, Opportunity> };

export type QuickReply = { label: string; message: string };

/** Null-guarded wrapper around the engine's shared USD formatter. */
export function fmtUsd(n: number | null | undefined): string {
  return n == null ? "—" : formatUsdCompact(n);
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

/** Tier system: treasury = money-grade fit, brass = attention needed,
 *  muted = adjacent. Chip styles + the match card's left rail. */
export const TIERS: { tier: FitTier; label: string; badge: string; rail: string }[] = [
  {
    tier: "likely_fit",
    label: "Likely fit",
    badge: "border-treasury/50 bg-treasury/10 text-treasury",
    rail: "border-l-treasury",
  },
  {
    tier: "verify_eligibility",
    label: "Verify eligibility",
    badge: "border-brass/50 bg-brass/10 text-brass",
    rail: "border-l-brass",
  },
  {
    tier: "adjacent",
    label: "Adjacent",
    badge: "border-hairline bg-panel-2 text-muted",
    rail: "border-l-hairline",
  },
];

export function tierRail(tier: FitTier): string {
  return TIERS.find((t) => t.tier === tier)?.rail ?? "border-l-hairline";
}
