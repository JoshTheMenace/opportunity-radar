"use client";

// Region: intake — the founder's description box + analyze action.
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
    <section id="intake" className="space-y-2">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Find the government funding your startup qualifies for
        </h1>
        <p className="text-sm text-neutral-400">
          Describe your company. We map it to US government funding — honestly.
        </p>
      </div>
      {restored && (
        <p className="text-xs text-neutral-500">
          Restored your saved profile — interview answers carry over. Click Analyze to re-run.
        </p>
      )}
      <textarea
        value={text}
        onChange={(e) => onText(e.target.value)}
        placeholder="Tell us about your company — what you build, who it's for, your stage, where you're based…"
        rows={5}
        className="w-full resize-y rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onAnalyze}
          disabled={busy || !text.trim()}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy ? "Analyzing…" : "Analyze"}
        </button>
        {!text.trim() && (
          <>
            <span className="text-xs text-neutral-500">or try:</span>
            {SAMPLES.map((s) => (
              <button
                key={s.label}
                onClick={() => onText(s.text)}
                className="rounded-full border border-neutral-700 px-3 py-1 text-xs text-neutral-300 hover:bg-neutral-800"
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
