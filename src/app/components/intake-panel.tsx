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
    <section id="intake" className="space-y-3 rounded-2xl border border-hairline bg-card p-5 shadow-card">
      <div className="space-y-1.5">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-faint">
          Company intake · Funding fit determination
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
          Find the government funding your startup qualifies for
        </h1>
        <p className="text-[13.5px] text-muted">
          Describe your company. We map it to US government funding — honestly.
        </p>
      </div>
      {restored && (
        <p className="font-mono text-[11px] text-faint">
          Restored your saved profile — interview answers carry over. Click Analyze to re-run.
        </p>
      )}
      <textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        placeholder="Tell us about your company — what you build, who it's for, your stage, where you're based…"
        rows={5}
        className="w-full resize-y rounded-xl border border-hairline bg-[#FBFCFE] p-4 text-[15px] text-ink placeholder:text-faint focus:border-brand focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onAnalyze}
          disabled={busy || !text.trim()}
          className="rounded-xl bg-brand px-5 py-2.5 font-mono text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Scanning…" : "Scan programs →"}
        </button>
        {!text.trim() && (
          <>
            <span className="font-mono text-[11px] text-faint">or try:</span>
            {SAMPLES.map((s) => (
              <button
                key={s.label}
                onClick={() => onText(s.text)}
                className="rounded-full border border-hairline px-3 py-1 font-mono text-[12px] text-muted transition-colors hover:border-brand hover:text-brand"
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
