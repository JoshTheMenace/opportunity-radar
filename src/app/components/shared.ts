// Shared types + formatting helpers for the Opportunity Map components.

import type { FitTier, MatchReport, Opportunity } from "@/lib/types";
import { formatUsdCompact } from "@/lib/engine/meter";

/** The report event carries an id→Opportunity lookup added by the API facade. */
export type UiReport = MatchReport & { opportunities?: Record<string, Opportunity> };

export type QuickReply = { label: string; message: string };

/** The agent's pointing power: which card to spotlight on the canvas.
 *  nonce changes on every point so the same card can be pointed at twice. */
export type Spotlight = { id: string; nonce: number };

/** Null-guarded wrapper around the engine's shared USD formatter. */
export function fmtUsd(n: number | null | undefined): string {
  return n == null ? "—" : formatUsdCompact(n);
}

export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

/** Tier system (Federal Catalyst chips): green = money-grade fit, amber =
 *  attention needed, neutral = adjacent. Chip styles + legacy left rail. */
export const TIERS: { tier: FitTier; label: string; badge: string; rail: string }[] = [
  {
    tier: "likely_fit",
    label: "Likely fit",
    badge: "bg-good-soft text-good",
    rail: "border-l-good",
  },
  {
    tier: "verify_eligibility",
    label: "Verify eligibility",
    badge: "bg-warn-soft text-warn",
    rail: "border-l-warn",
  },
  {
    tier: "adjacent",
    label: "Adjacent",
    badge: "bg-surface-variant text-muted",
    rail: "border-l-line",
  },
];

export function tierRail(tier: FitTier): string {
  return TIERS.find((t) => t.tier === tier)?.rail ?? "border-l-hairline";
}
