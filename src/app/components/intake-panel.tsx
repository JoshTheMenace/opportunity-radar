"use client";

// Region: intake — the founder's description box + analyze action.
// Styled as the instrument's intake form (the OR-424 nods at the SF-424,
// the federal application form every grantee learns to dread).
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
    <section id="intake" className="space-y-3">
      <div className="space-y-1.5">
        <p className="font-mono text-[11px] font-medium tracking-[0.18em] text-brass">
          FORM OR-424 · FUNDING FIT DETERMINATION
        </p>
        <h1 className="font-display text-3xl font-semibold tracking-tight text-paper sm:text-4xl">
          Find the government funding your startup qualifies for
        </h1>
        <p className="text-sm text-muted">
          Describe your company. We map it to US government funding — honestly.
        </p>
      </div>
      {restored && (
        <p className="font-mono text-xs text-faint">
          Restored your saved profile — interview answers carry over. Click Analyze to re-run.
        </p>
      )}
      <textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        placeholder="Tell us about your company — what you build, who it's for, your stage, where you're based…"
        rows={5}
        className="w-full resize-y rounded-lg border border-hairline bg-panel p-3.5 text-sm text-paper placeholder:text-faint focus:border-brass focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onAnalyze}
          disabled={busy || !text.trim()}
          className="rounded-lg bg-brass px-5 py-2 text-sm font-semibold text-ink transition-colors hover:bg-brass-bright disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Analyzing…" : "Analyze"}
        </button>
        {!text.trim() && (
          <>
            <span className="text-xs text-faint">or try:</span>
            {SAMPLES.map((s) => (
              <button
                key={s.label}
                onClick={() => onText(s.text)}
                className="rounded-full border border-hairline px-3 py-1 text-xs text-muted transition-colors hover:border-brass/50 hover:text-paper"
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
