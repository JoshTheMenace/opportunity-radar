"use client";

// Region: eligibility meter — headline "unlocked of potential" number plus
// per-field unlock chips. Lives in the guidance rail.

import type { EligibilityMeter } from "@/lib/types";
import { fmtUsd } from "./shared";

export default function MeterPanel({
  meter,
  preliminary = false,
}: {
  meter: EligibilityMeter;
  /** True until the required basics are known — numbers may still shift. */
  preliminary?: boolean;
}) {
  const remaining = Math.max(0, meter.potentialUsd - meter.unlockedUsd);
  return (
    <section id="meter" className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      {/* Lead with the believable fact (program count); the dollar total is
          framed as what it is — summed posted ceilings, not a promise. */}
      <div className="flex items-end gap-3">
        <span className="text-3xl font-bold text-green-400">{meter.unlockedCount}</span>
        <span className="pb-1 text-sm text-neutral-400">
          programs pass your eligibility gates
        </span>
      </div>
      <p className="text-xs text-neutral-500">
        Posted award ceilings across them total {fmtUsd(meter.unlockedUsd)} — your realistic
        picks are ranked in the report.
      </p>
      {preliminary && (
        <p className="text-xs text-amber-300">
          Preliminary — these numbers firm up once the required questions are answered.
        </p>
      )}
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
