"use client";

// Region: Action Plan — the kit's dated next-steps timeline, derived from the
// TOP match's plan-backward timeline (engine/timeline.ts). Real dates only;
// renders nothing until a report with a strong match exists.

import type { CompanyProfile } from "@/lib/types";
import { buildTimeline } from "@/lib/engine/timeline";
import type { UiReport } from "./shared";

export default function ActionPlan({ report }: { report: UiReport | null }) {
  const top = report?.matches.find((m) => m.score >= 50);
  const opp = top ? report?.opportunities?.[top.opportunityId] : undefined;
  if (!top || !opp || !report) return null;
  const steps = buildTimeline(opp, report.profile).slice(0, 3);
  if (steps.length === 0) return null;

  return (
    <section className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
      <h4 className="mb-4 font-display text-[17px] font-semibold text-ink">Action Plan</h4>
      <p className="-mt-3 mb-4 font-mono text-[10.5px] uppercase tracking-[0.08em] text-faint">
        for {opp.title.length > 34 ? opp.title.slice(0, 34) + "…" : opp.title}
      </p>
      <div className="relative ml-2 space-y-5 border-l-2 border-surface-variant">
        {steps.map((s, i) => (
          <div key={s.title} className={`relative pl-5 ${i === 1 ? "opacity-80" : i > 1 ? "opacity-60" : ""}`}>
            <div
              className={`absolute -left-[8px] top-1 h-3.5 w-3.5 rounded-full ${
                i === 0
                  ? "bg-brand ring-4 ring-card"
                  : "border-2 border-card bg-surface-variant"
              }`}
            />
            <span
              className={`mb-0.5 block font-mono text-[11px] font-medium ${
                s.urgent ? "text-risk" : i === 0 ? "text-brand" : "text-faint"
              }`}
            >
              {s.due ?? "Rolling"}
            </span>
            <h5 className="text-[13.5px] font-medium text-ink">{s.title}</h5>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-muted">{s.detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
