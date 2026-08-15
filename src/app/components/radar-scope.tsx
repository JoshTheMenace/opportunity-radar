"use client";

// The signature instrument: a live radar scope. Every blip is a REAL match —
// bearing is derived from the agency name (stable across renders), distance
// from center is fit (higher score = closer), color is tier. While a run
// streams, the sweep rotates; afterwards the scope stays as the founder's
// funding constellation. Pure SVG + CSS; reduced motion = static plot.

import type { RankedMatch } from "@/lib/types";
import type { UiReport } from "./shared";

const R_OUTER = 88;
const R_MIN = 14; // a perfect score parks near the center, never on it

/** Stable pseudo-random bearing per agency so blips don't jump between renders. */
function bearing(agency: string): number {
  let h = 0;
  for (let i = 0; i < agency.length; i++) h = (h * 31 + agency.charCodeAt(i)) >>> 0;
  return (h % 360) * (Math.PI / 180);
}

function radius(score: number): number {
  const s = Math.max(0, Math.min(100, score));
  return R_OUTER - ((R_OUTER - R_MIN) * s) / 100;
}

const TIER_FILL: Record<RankedMatch["tier"], string> = {
  likely_fit: "var(--color-brand)",
  verify_eligibility: "var(--color-warn)",
  adjacent: "var(--color-muted)",
  not_a_fit: "var(--color-faint)",
};

export default function RadarScope({
  report,
  busy,
  size = 168,
}: {
  report: UiReport | null;
  busy: boolean;
  size?: number;
}) {
  const opps = report?.opportunities ?? {};
  const blips = (report?.matches ?? [])
    .filter((m) => m.score >= 30)
    .map((m, i) => {
      const agency = opps[m.opportunityId]?.agency ?? m.opportunityId;
      const a = bearing(agency);
      const r = radius(m.score);
      return {
        key: m.opportunityId,
        x: 100 + r * Math.cos(a),
        y: 100 + r * Math.sin(a),
        fill: TIER_FILL[m.tier],
        title: `${opps[m.opportunityId]?.title ?? m.opportunityId} — score ${m.score}`,
        delay: Math.min(i * 60, 900),
      };
    });
  const agencies = new Set(
    (report?.matches ?? []).map((m) => opps[m.opportunityId]?.agency).filter(Boolean),
  ).size;

  return (
    <figure className="flex flex-col items-center gap-1.5">
      <svg
        width={size}
        height={size}
        viewBox="0 0 200 200"
        role="img"
        aria-label={
          blips.length
            ? `Funding radar: ${blips.length} programs across ${agencies} agencies — closer to center is a better fit.`
            : "Funding radar — matches plot here as they are scored."
        }
      >
        {/* range rings + cross-hairs */}
        {[R_OUTER, 59, 30].map((r) => (
          <circle key={r} cx="100" cy="100" r={r} fill="none" stroke="var(--color-hairline)" strokeWidth="1" />
        ))}
        <line x1="100" y1="12" x2="100" y2="188" stroke="var(--color-hairline)" strokeWidth="0.5" />
        <line x1="12" y1="100" x2="188" y2="100" stroke="var(--color-hairline)" strokeWidth="0.5" />

        {/* sweep — only while the engine is working */}
        {busy && (
          <g className="scope-sweep">
            <path
              d={`M100,100 L100,${100 - R_OUTER} A${R_OUTER},${R_OUTER} 0 0 1 ${100 + R_OUTER * Math.sin(0.9)},${100 - R_OUTER * Math.cos(0.9)} Z`}
              fill="var(--color-accent)"
              opacity="0.1"
            />
            <line x1="100" y1="100" x2="100" y2={100 - R_OUTER} stroke="var(--color-accent)" strokeWidth="1.5" opacity="0.55" />
          </g>
        )}

        {/* blips: the real matches */}
        {blips.map((b) => (
          <circle
            key={b.key}
            className="scope-blip"
            style={{ animationDelay: `${b.delay}ms` }}
            cx={b.x}
            cy={b.y}
            r="3"
            fill={b.fill}
          >
            <title>{b.title}</title>
          </circle>
        ))}

        <circle cx="100" cy="100" r="2" fill="var(--color-brand)" />
      </svg>
      <figcaption className="font-mono text-[10px] tracking-wide text-faint">
        {blips.length
          ? `${blips.length} PROGRAMS · ${agencies} AGENCIES · CENTER = BEST FIT`
          : busy
            ? "SCANNING…"
            : "AWAITING RUN"}
      </figcaption>
    </figure>
  );
}
