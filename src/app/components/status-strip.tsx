"use client";

// Region: run status — what the engine is doing RIGHT NOW, a progress bar,
// and an honest time estimate. Knowing roughly how long it takes beats a
// silent spinner. Phase estimates come from measured telemetry
// (scripts/bench/journey.ts, 2026-08-15); the ranking phase uses the REAL
// scored-count fraction instead of a guess. Self-contained: derives its
// state entirely from the activity feed lines.

import { useEffect, useMemo, useRef, useState } from "react";

interface PhaseInfo {
  key: string;
  label: string;
  /** Typical duration in seconds (measured); null = use real fraction. */
  estSec: number | null;
}

/** Ordered by matching priority: later engine phases first. */
const PHASES: { test: (l: string) => boolean; info: PhaseInfo }[] = [
  {
    test: (l) => l.startsWith("Evidence:"),
    info: { key: "evidence", label: "Pulling historical-award evidence", estSec: 6 },
  },
  {
    test: (l) => l.startsWith("Scored "),
    info: { key: "ranking", label: "Scoring candidates for genuine fit", estSec: null },
  },
  {
    test: (l) => l.startsWith("Ranking "),
    info: { key: "ranking", label: "Scoring candidates for genuine fit", estSec: null },
  },
  {
    test: (l) => l.startsWith("Translating your profile"),
    info: { key: "translate", label: "Translating your profile into program language", estSec: 14 },
  },
  {
    test: (l) => l.startsWith("Reading your answer"),
    info: { key: "parse", label: "Reading your answer", estSec: 6 },
  },
  {
    test: (l) => l.startsWith("Reading your company description"),
    info: { key: "extract", label: "Reading your company description", estSec: 7 },
  },
  {
    test: (l) => l.startsWith("Updating your profile"),
    info: { key: "update", label: "Updating your profile", estSec: 2 },
  },
];

/** Ranking dominates a full run; weight the bar so it doesn't sit at 95%
 *  while evidence finishes. */
const RANK_WEIGHT = 0.9;

export default function StatusStrip({ lines, busy }: { lines: string[]; busy: boolean }) {
  // Current phase = the highest-priority match over the latest lines.
  const phase = useMemo(() => {
    for (let i = lines.length - 1; i >= 0; i--) {
      for (const p of PHASES) if (p.test(lines[i])) return p.info;
    }
    return null;
  }, [lines]);

  // Real progress during ranking, from "Scored X/Y" lines.
  const rankFrac = useMemo(() => {
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i].match(/^Scored (\d+)\/(\d+)/);
      if (m) return Math.min(1, Number(m[1]) / Math.max(1, Number(m[2])));
      if (lines[i].startsWith("Ranking ")) return 0;
    }
    return 0;
  }, [lines]);

  // Time-based fill for single-call phases: restart the clock on phase change.
  const phaseStartRef = useRef(Date.now());
  const [, tick] = useState(0);
  useEffect(() => {
    phaseStartRef.current = Date.now();
  }, [phase?.key]);
  useEffect(() => {
    if (!busy) return;
    const id = setInterval(() => tick((n) => n + 1), 400);
    return () => clearInterval(id);
  }, [busy]);

  if (!busy || !phase) return null;

  const elapsed = (Date.now() - phaseStartRef.current) / 1000;
  let frac: number;
  let eta: string;
  if (phase.key === "ranking") {
    frac = rankFrac * RANK_WEIGHT;
    // Measured: first scores ~25s in, the rest drain fast. Estimate from
    // observed pace once moving; before that, quote the typical total.
    const remaining =
      rankFrac > 0.05 ? Math.max(3, Math.round((elapsed / rankFrac) * (1 - rankFrac))) : 55;
    eta = rankFrac > 0 ? `~${remaining}s left` : "usually ~1 min";
  } else if (phase.key === "evidence") {
    frac = RANK_WEIGHT + Math.min(0.9, elapsed / (phase.estSec ?? 6)) * (1 - RANK_WEIGHT);
    eta = "almost done";
  } else {
    // Single opaque LLM call: fill toward 90% over the typical duration —
    // the bar never lies about being finished.
    const est = phase.estSec ?? 8;
    frac = Math.min(0.9, elapsed / est);
    eta = elapsed < est ? `usually ~${Math.max(1, Math.round(est - elapsed))}s` : "any moment now";
  }

  return (
    <section
      id="run-status"
      className="space-y-2 rounded-2xl border border-hairline bg-card px-4 py-3 shadow-card"
      aria-live="polite"
    >
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
          <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-accent align-middle" />
          {phase.label}…
        </p>
        <p className="tnum text-[12px] text-faint">{eta}</p>
      </div>
      <div className="h-[3px] overflow-hidden rounded-full bg-hairline">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
          style={{ width: `${Math.round(frac * 100)}%` }}
        />
      </div>
    </section>
  );
}
