"use client";

// Region: intake — the founder's description box + analyze action, in kit
// dress. `hero` renders the centered onboarding version (big headline);
// otherwise it's the compact re-scan card at the top of the center column.
// Sample chips give first-time users (and the demo) a one-tap start.

import { Button, TextArea } from "./ui";

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
  hero = false,
  onText,
  onAnalyze,
}: {
  text: string;
  busy: boolean;
  restored: boolean;
  /** Onboarding presentation: centered, big headline. */
  hero?: boolean;
  onText: (v: string) => void;
  onAnalyze: () => void;
}) {
  return (
    <section id="intake" className="or-card" style={hero ? { padding: 40, textAlign: "center" } : undefined}>
      <p className="mk-label" style={{ textTransform: "uppercase" }}>
        Company intake
      </p>
      {hero && (
        <>
          <h1
            style={{
              margin: "12px 0 8px",
              font: "700 36px/44px var(--font-headline)",
              letterSpacing: "-0.01em",
              color: "var(--color-text-deep)",
            }}
          >
            Find the government funding your startup qualifies for
          </h1>
          <p style={{ margin: "0 0 20px", font: "400 16px/24px var(--font-body)", color: "var(--color-on-surface-variant)" }}>
            Describe your company. We map it to US government funding — honestly.
          </p>
        </>
      )}
      {restored && (
        <p className="text-[12.5px] text-faint" style={{ margin: hero ? "0 0 8px" : "8px 0 0" }}>
          Restored your saved profile — interview answers carry over.
        </p>
      )}
      <TextArea
        value={text}
        onChange={(e) => onText(e.target.value)}
        placeholder="Tell us about your company — what you build, who it's for, your stage, where you're based…"
        rows={hero ? 5 : 4}
        style={{ marginTop: hero ? 0 : 12, textAlign: "left" }}
      />
      <div
        className="mk-row"
        style={{ marginTop: 16, justifyContent: hero ? "center" : undefined, gap: 8 }}
      >
        <Button variant="filled" iconAfter="arrow_forward" onClick={onAnalyze} disabled={busy || !text.trim()}>
          {busy ? "Scanning…" : "Scan programs"}
        </Button>
        {!text.trim() && (
          <>
            <span className="mk-label">or try:</span>
            {SAMPLES.map((s) => (
              <Button key={s.label} variant="tonal" size="sm" pill onClick={() => onText(s.text)}>
                {s.label}
              </Button>
            ))}
          </>
        )}
      </div>
    </section>
  );
}
