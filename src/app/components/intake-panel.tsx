"use client";

// Region: intake — the founder's description box + analyze action.
// Catalyst light theme: the "Company intake" card from the reference mock.
// Sample chips give first-time users (and the demo) a one-tap start.

const SAMPLES: { label: string; text: string }[] = [
  {
    label: "AI healthcare",
    text: "We build an AI clinical-documentation assistant for rural hospitals. Based in Salt Lake City, 12 employees, seed-funded, piloting with two hospital systems and doing active R&D.",
  },
  {
    label: "Aerospace mfg",
    text: "Precision titanium parts manufacturer for aerospace primes in Ogden, Utah. 45 employees, profitable, looking to expand capacity and fund new R&D on additive manufacturing.",
  },
  {
    label: "Water tech",
    text: "Water-reuse sensor startup in Provo — prototype stage, 6 employees, $1.2M raised, active R&D with a university partner. Looking for pilot funding.",
  },
];

export default function IntakePanel({
  text,
  busy,
  restored,
  onText,
  onAnalyze,
}: {
  text: string;
  busy: boolean;
  restored: boolean;
  onText: (v: string) => void;
  onAnalyze: () => void;
}) {
  return (
    <section id="intake" className="card space-y-4 p-6 sm:p-7">
      <div className="space-y-1.5">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
          Company intake
        </p>
        <h1 className="font-display text-[27px] font-bold leading-tight tracking-tight text-ink sm:text-[31px]">
          Find the government funding your startup qualifies for
        </h1>
        <p className="text-[14.5px] text-muted">
          Describe your company. We map it to US government funding — honestly.
        </p>
      </div>
      {restored && (
        <p className="text-[12.5px] text-faint">
          Restored your saved profile — interview answers carry over.
        </p>
      )}
      <textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        placeholder="Tell us about your company — what you build, who it's for, your stage, where you're based…"
        rows={5}
        className="w-full resize-y rounded-2xl border border-line bg-surface-low/60 p-4 text-[15px] leading-relaxed text-ink placeholder:text-faint focus:border-accent focus:bg-card focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onAnalyze}
          disabled={busy || !text.trim()}
          className="rounded-xl bg-brand px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Scanning…" : "Scan programs →"}
        </button>
        {!text.trim() && (
          <>
            <span className="text-[12.5px] text-faint">or try:</span>
            {SAMPLES.map((s) => (
              <button
                key={s.label}
                onClick={() => onText(s.text)}
                className="rounded-full bg-soft px-3.5 py-1.5 text-[12.5px] font-semibold text-brand transition-colors hover:bg-brand-fixed"
              >
                {s.label}
              </button>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
