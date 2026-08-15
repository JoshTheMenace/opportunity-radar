"use client";

// Region: the agent dock — one body for the agent. Merges what used to be
// three scattered widgets (activity feed, status strip, guidance rail chrome)
// into a single presence: the scope is its face, the status line its voice,
// the narration log its working memory. Children (meter, interview, voice)
// render below inside the same dock so the founder always talks to ONE thing.
//
// Pointing power: narration lines that reference a specific opportunity
// ("Evidence: … for <title>") are clickable and spotlight that card on the
// canvas via onFocusMatch.

import { useEffect, useRef, type ReactNode } from "react";
import RadarScope from "./radar-scope";
import StatusStrip from "./status-strip";
import type { UiReport } from "./shared";

/** Match a narration line to the opportunity it talks about (title suffix). */
function lineTarget(line: string, report: UiReport | null): string | null {
  if (!report?.opportunities || !line.startsWith("Evidence:")) return null;
  for (const [id, opp] of Object.entries(report.opportunities)) {
    if (opp.title && line.endsWith(opp.title)) return id;
  }
  return null;
}

function statusLine(busy: boolean, lines: string[], report: UiReport | null): string {
  if (busy) return lines[lines.length - 1] ?? "Working…";
  if (report?.honestNo) return "Determination: no strong federal match — honest read below.";
  if (report) {
    const strong = report.matches.filter((m) => m.score >= 50).length;
    if (report.matches.length === 0) return "Holding — I need a few basics before ranking.";
    return strong > 0
      ? `Report ready — ${strong} match${strong === 1 ? "" : "es"} worth your time.`
      : "Report ready — nothing cleared the bar yet. Answers below can change that.";
  }
  return "Standing by — describe your company and I'll go to work.";
}

export default function AgentDock({
  lines,
  busy,
  report,
  onFocusMatch,
  children,
}: {
  lines: string[];
  busy: boolean;
  report: UiReport | null;
  onFocusMatch: (opportunityId: string) => void;
  children?: ReactNode;
}) {
  const logRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [lines.length]);

  const shown = busy ? lines.slice(-8) : lines.slice(-3);
  const started = busy || lines.length > 0 || report != null;

  return (
    <section
      id="agent"
      className="space-y-3 rounded-lg border border-hairline bg-panel/60 p-3"
      aria-label="Radar, your funding analyst"
    >
      {/* the agent itself */}
      <div className="rounded-md border border-hairline bg-panel p-3">
        <p className="font-mono text-[10px] font-medium tracking-[0.18em] text-faint">
          RADAR · YOUR FUNDING ANALYST
        </p>
        <div className="mt-2 flex flex-col items-center gap-2">
          <RadarScope report={report} busy={busy} size={140} />
          <p className="w-full text-center text-sm leading-snug text-paper" aria-live="polite">
            {statusLine(busy, lines, report)}
          </p>
        </div>

        <div className="mt-2">
          <StatusStrip lines={lines} busy={busy} />
        </div>

        {/* working log — the agent's narration; evidence lines point at cards */}
        {started && lines.length > 0 && (
          <div
            ref={logRef}
            className="mt-2 max-h-36 space-y-0.5 overflow-y-auto border-t border-hairline pt-2 font-mono text-[11px] leading-relaxed text-muted"
          >
            {lines.length > shown.length && (
              <div className="text-faint">… {lines.length - shown.length} earlier lines</div>
            )}
            {shown.map((line, i) => {
              const target = lineTarget(line, report);
              return target ? (
                <div key={`${i}-${line.slice(0, 24)}`}>
                  <span className="text-faint">›</span>{" "}
                  <button
                    type="button"
                    onClick={() => onFocusMatch(target)}
                    className="text-left underline decoration-hairline underline-offset-2 transition-colors hover:text-brass hover:decoration-brass"
                    title="Show me this card"
                  >
                    {line}
                  </button>
                </div>
              ) : (
                <div key={`${i}-${line.slice(0, 24)}`}>
                  <span className="text-faint">›</span> {line}
                </div>
              );
            })}
            {busy && <div className="animate-pulse text-brass">› working…</div>}
          </div>
        )}
      </div>

      {/* the agent's instruments: meter, questions, voice */}
      {children}
    </section>
  );
}
