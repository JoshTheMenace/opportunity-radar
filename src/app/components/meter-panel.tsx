"use client";

// Region: eligibility meter — the money meter. Leads with the unlocked
// dollars (summed posted ceilings), backs it with a 3-cell stat strip and a
// progress bar toward full potential, and lists each unanswered question as
// a ledger row of what it could unlock. Lives in the guidance rail.

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
  const oneAway = meter.unlocks.reduce((n, u) => n + u.opportunityCount, 0);
  const pct =
    meter.potentialUsd > 0
      ? Math.min(100, Math.round((meter.unlockedUsd / meter.potentialUsd) * 100))
      : 0;
  const cellLabel =
    "font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-faint";
  return (
    <section
      id="meter"
      className="space-y-3.5 rounded-2xl border border-hairline bg-card p-5 shadow-card"
    >
      <div className="flex items-center justify-between">
        <p className={cellLabel}>Eligible funding unlocked</p>
        {preliminary && (
          <span className="rounded-full bg-soft px-2.5 py-1 font-mono text-[11px] font-semibold text-brand">
            PRELIMINARY
          </span>
        )}
      </div>

      <div>
        <p
          className={`text-3xl font-extrabold leading-tight tracking-tight ${
            preliminary ? "text-muted" : "text-brand"
          }`}
        >
          {fmtUsd(meter.unlockedUsd)}{" "}
          {meter.potentialUsd > 0 && (
            <span className="text-[15px] font-semibold tracking-normal text-faint">
              of {fmtUsd(meter.potentialUsd)} potential
            </span>
          )}
        </p>
        <p className="mt-1 text-[13.5px] text-muted">
          {meter.unlockedCount} program{meter.unlockedCount === 1 ? "" : "s"} pass your
          eligibility gates — realistic picks are ranked in the report.
        </p>
      </div>

      {/* stat strip */}
      <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-hairline">
        <div className="border-r border-hairline px-3.5 py-2.5">
          <span className={cellLabel}>Matches</span>
          <b className="mt-0.5 block text-[18px] font-bold tracking-tight text-ink">
            {meter.unlockedCount}
          </b>
        </div>
        <div className="border-r border-hairline px-3.5 py-2.5">
          <span className={cellLabel}>Need 1</span>
          <b className="mt-0.5 block text-[18px] font-bold tracking-tight text-ink">{oneAway}</b>
        </div>
        <div className="px-3.5 py-2.5">
          <span className={cellLabel}>Locked</span>
          <b className="mt-0.5 block text-[18px] font-bold tracking-tight text-ink">
            {fmtUsd(remaining)}
          </b>
        </div>
      </div>

      {/* confirmed vs. still-answerable, as a gauge */}
      {meter.potentialUsd > 0 && (
        <div className="space-y-1.5">
          <div className="h-[3px] overflow-hidden rounded-full bg-hairline">
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-700"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex justify-between font-mono text-[11px] text-faint">
            <span>{fmtUsd(meter.unlockedUsd)} confirmed</span>
            <span>{fmtUsd(meter.potentialUsd)} if all answers land</span>
          </div>
        </div>
      )}

      {preliminary && (
        <p className="text-[12.5px] text-muted">
          Preliminary — these numbers firm up once the required questions are answered.
        </p>
      )}
      {remaining > 0 && (
        <p className="text-[13px] text-muted">
          <span className="font-mono font-semibold text-brand">+{fmtUsd(remaining)}</span> more
          could unlock — answer the questions below.
        </p>
      )}
      {meter.unlocks.length > 0 && (
        <ul className="border-t border-hairline pt-1">
          {meter.unlocks.map((u) => (
            <li
              key={u.field}
              className="flex items-baseline justify-between gap-2 border-b border-dashed border-hairline py-1.5 text-[13.5px] last:border-0"
            >
              <span className="font-mono text-[12.5px] font-semibold text-good">
                +{fmtUsd(u.unlockUsd)}
              </span>
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
