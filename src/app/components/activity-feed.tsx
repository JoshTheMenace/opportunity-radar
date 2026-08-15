"use client";

// Region: the instrument cluster — live radar scope beside the engine's
// streaming log. During a run this IS the show; afterwards the scope stays
// as the funding constellation and the log collapses to its tail.

import { useEffect, useRef } from "react";
import RadarScope from "./radar-scope";
import type { UiReport } from "./shared";

export default function ActivityFeed({
  lines,
  busy,
  report,
}: {
  lines: string[];
  busy: boolean;
  report: UiReport | null;
}) {
  const logRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines.length]);

  if (!busy && lines.length === 0 && !report) return null;
  const shown = busy ? lines : lines.slice(-3);

  return (
    <section
      id="activity"
      className="grid items-center gap-4 rounded-lg border border-hairline bg-panel p-4 sm:grid-cols-[auto_minmax(0,1fr)]"
    >
      <RadarScope report={report} busy={busy} />
      <div
        ref={logRef}
        className="max-h-44 space-y-0.5 overflow-y-auto font-mono text-xs leading-relaxed text-muted"
        aria-live="polite"
      >
        {lines.length > shown.length && (
          <div className="text-faint">… {lines.length - shown.length} earlier lines</div>
        )}
        {shown.map((line, i) => (
          <div key={i}>
            <span className="text-faint">›</span> {line}
          </div>
        ))}
        {busy && <div className="animate-pulse text-brass">› working…</div>}
      </div>
    </section>
  );
}
