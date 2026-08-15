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
    <section id="agent" className="space-y-3.5" aria-label="Radar, your funding analyst">
      {/* the agent itself */}
      <div className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
        {/* identity row */}
        <div className="flex items-center gap-3">
          <div
            aria-hidden
            className="h-[38px] w-[38px] flex-none rounded-full"
            style={{ background: "radial-gradient(circle at 32% 28%, #4C86E8, #1D4F91)" }}
          />
          <div className="min-w-0">
            <p className="text-[14.5px] font-semibold tracking-tight text-ink">Radar Agent</p>
            <p
              className={`font-mono text-[11.5px] ${started ? "text-good" : "text-muted"}`}
              aria-live="polite"
            >
              ● {busy ? "Live — " : ""}
              {statusLine(busy, lines, report)}
            </p>
          </div>
        </div>

        <div className="mt-3 flex justify-center">
          <RadarScope report={report} busy={busy} size={140} />
        </div>

        <div className="mt-3">
          <StatusStrip lines={lines} busy={busy} />
        </div>

        {/* working log — the agent's narration; evidence lines point at cards */}
        {started && lines.length > 0 && (
          <div
            ref={logRef}
            className="mt-3 max-h-36 space-y-1 overflow-y-auto border-t border-hairline pt-3 text-[13px] leading-relaxed text-muted"
          >
            {lines.length > shown.length && (
              <div className="font-mono text-[11px] text-faint">
                … {lines.length - shown.length} earlier lines
              </div>
            )}
            {shown.map((line, i) => {
              const target = lineTarget(line, report);
              return target ? (
                <div key={`${i}-${line.slice(0, 24)}`}>
                  <button
                    type="button"
                    onClick={() => onFocusMatch(target)}
                    className="rounded-lg border border-hairline bg-card px-2.5 py-1 text-left font-mono text-[11.5px] font-semibold text-brand transition-colors hover:bg-soft"
                    title="Show me this card"
                  >
                    {line}
                  </button>
                </div>
              ) : (
                <div key={`${i}-${line.slice(0, 24)}`}>{line}</div>
              );
            })}
            {busy && (
              <div className="animate-pulse font-mono text-[11.5px] text-accent">● working…</div>
            )}
          </div>
        )}
      </div>

      {/* the agent's instruments: meter, questions, voice */}
      {children}
    </section>
  );
}
