"use client";

// Region: eligibility meter — headline "unlocked of potential" number plus
// per-field unlock chips. Lives in the guidance rail.

import type { EligibilityMeter } from "@/lib/types";
import { fmtUsd } from "./shared";

export default function MeterPanel({ meter }: { meter: EligibilityMeter }) {
  const remaining = Math.max(0, meter.potentialUsd - meter.unlockedUsd);
  return (
    <section id="meter" className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex items-end gap-3">
        <span className="text-3xl font-bold text-green-400">{fmtUsd(meter.unlockedUsd)}</span>
        <span className="pb-1 text-sm text-neutral-400">
          eligible now · {meter.unlockedCount} programs
        </span>
      </div>
      {remaining > 0 && (
        <p className="text-xs text-amber-300">
          +{fmtUsd(remaining)} more could unlock — answer the questions below
        </p>
      )}
      {meter.unlocks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {meter.unlocks.map((u) => (
            <span
              key={u.field}
              className="rounded-full border border-green-500/40 bg-green-500/10 px-2.5 py-0.5 text-xs text-green-400"
            >
              up to +{fmtUsd(u.unlockUsd)} · {u.opportunityCount} opp
            </span>
          ))}
        </div>
      )}
    </section>
  );
}
