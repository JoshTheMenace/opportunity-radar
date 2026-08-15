"use client";

// Region: live activity feed — engine progress lines while a run streams.

export default function ActivityFeed({ lines, busy }: { lines: string[]; busy: boolean }) {
  if (!busy && lines.length === 0) return null;
  return (
    <section
      id="activity"
      className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 font-mono text-xs text-neutral-400"
    >
      {lines.map((line, i) => (
        <div key={i}>
          <span className="text-neutral-600">›</span> {line}
        </div>
      ))}
      {busy && <div className="animate-pulse text-neutral-500">› working…</div>}
    </section>
  );
}
