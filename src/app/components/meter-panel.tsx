"use client";

// Region: eligibility meter — a ledger, not a dashboard widget. Leads with
// the believable fact (program count), shows the money as what it is
// (summed posted ceilings), and lists each unanswered question as a ledger
// row of what it could unlock. Lives in the guidance rail.

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
  const pct =
    meter.potentialUsd > 0
      ? Math.min(100, Math.round((meter.unlockedUsd / meter.potentialUsd) * 100))
      : 0;
  return (
    <section id="meter" className="space-y-3 rounded-lg border border-hairline bg-panel p-4">
      <p className="font-mono text-[10px] font-medium tracking-[0.18em] text-faint">
        ELIGIBILITY LEDGER
      </p>
      <div className="flex items-end gap-3">
        <span className="font-mono text-3xl font-semibold text-treasury">
          {meter.unlockedCount}
        </span>
        <span className="pb-1 text-sm text-muted">programs pass your eligibility gates</span>
      </div>
      <p className="text-xs text-muted">
        Posted award ceilings across them total{" "}
        <span className="font-mono text-paper">{fmtUsd(meter.unlockedUsd)}</span> — your
        realistic picks are ranked in the report.
      </p>

      {/* confirmed vs. still-answerable, as a gauge */}
      {meter.potentialUsd > 0 && (
        <div className="space-y-1">
          <div className="h-1.5 overflow-hidden rounded-full bg-panel-2">
            <div
              className="h-full rounded-full bg-treasury transition-[width] duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between font-mono text-[10px] text-faint">
            <span>{fmtUsd(meter.unlockedUsd)} confirmed</span>
            <span>{fmtUsd(meter.potentialUsd)} if all answers land</span>
          </div>
        </div>
      )}

      {preliminary && (
        <p className="text-xs text-brass">
          Preliminary — these numbers firm up once the required questions are answered.
        </p>
      )}
      {remaining > 0 && (
        <p className="text-xs text-brass">
          +{fmtUsd(remaining)} more could unlock — answer the questions below
        </p>
      )}
      {meter.unlocks.length > 0 && (
        <ul className="divide-y divide-hairline border-t border-hairline">
          {meter.unlocks.map((u) => (
            <li
              key={u.field}
              className="flex items-baseline justify-between gap-2 py-1.5 text-xs"
            >
              <span className="font-mono text-treasury">+{fmtUsd(u.unlockUsd)}</span>
              <span className="text-right text-muted">
                {u.opportunityCount} program{u.opportunityCount === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
