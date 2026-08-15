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

export const TIERS: { tier: FitTier; label: string; badge: string }[] = [
  { tier: "likely_fit", label: "Likely fit", badge: "border-green-500/50 bg-green-500/10 text-green-400" },
  { tier: "verify_eligibility", label: "Verify eligibility", badge: "border-yellow-500/50 bg-yellow-500/10 text-yellow-400" },
  { tier: "adjacent", label: "Adjacent", badge: "border-orange-500/50 bg-orange-500/10 text-orange-400" },
];
