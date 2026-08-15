// The Radar mark — Opportunity Radar's core shape. A quarter-sweep radar
// with a four-point blip star: the sweep is the watching, the star is the
// found money. One mark, used at every size (navbar, agent avatar, empty
// states). Hand-drawn SVG, no icon fonts.

export function RadarMark({
  size = 26,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      aria-hidden
      fill="none"
    >
      {/* sweep wedge */}
      <path d="M16 16 L16 2.5 A13.5 13.5 0 0 1 27.7 9.25 Z" fill="currentColor" opacity="0.16" />
      {/* rings (quarter arcs, open toward the sweep) */}
      <path
        d="M16 3a13 13 0 1 0 13 13"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <path
        d="M16 8.5A7.5 7.5 0 1 0 23.5 16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        opacity="0.55"
      />
      {/* the found-money blip: four-point star in the sweep's path */}
      <path
        d="M22.6 6.1c.3 2.5 1.2 3.6 3.7 3.9-2.5.3-3.4 1.4-3.7 3.9-.3-2.5-1.2-3.6-3.7-3.9 2.5-.3 3.4-1.4 3.7-3.9Z"
        fill="currentColor"
      />
      {/* center pivot */}
      <circle cx="16" cy="16" r="2" fill="currentColor" />
    </svg>
  );
}

export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`}>
      <RadarMark className="text-brand" />
      <span className="font-display text-[19px] font-bold tracking-tight text-ink">
        Opportunity<span className="text-brand">Radar</span>
      </span>
    </span>
  );
}
