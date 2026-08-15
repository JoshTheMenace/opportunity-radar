"use client";

// Region: results — the Opportunity Map itself. Instrument readout band,
// matches grouped under tier rules, the honest-no determination, plus
// empty/loading states so every phase of the flow has a designed surface.

import type { FitTier, GatedOpportunity, Opportunity } from "@/lib/types";
import { profileReadiness } from "@/lib/engine/readiness";
import { meterValueUsd } from "@/lib/engine/gates";
import MatchCard from "./match-card";
import { TIERS, daysUntil, fmtUsd, type Spotlight, type UiReport } from "./shared";

/** Matches below this score are noise — hidden from the report entirely. */
const MIN_SCORE = 50;

/** Catalyst tier chips: status tints only, never decorative. */
const TIER_CHIP: Record<FitTier, string> = {
  likely_fit: "bg-good-soft text-good",
  verify_eligibility: "bg-warn-soft text-warn",
  adjacent: "bg-soft text-muted",
  not_a_fit: "bg-soft text-faint",
};

export function ReportView({
  report,
  spotlight,
}: {
  report: UiReport;
  spotlight?: Spotlight | null;
}) {
  const opps = report.opportunities ?? {};
  const visible = report.matches.filter((m) => m.score >= MIN_SCORE);
  const hidden = report.matches.length - visible.length;
  const resolved = visible
    .map((m) => opps[m.opportunityId])
    .filter((o): o is Opportunity => o != null);
  const agencies = new Set(resolved.map((o) => o.agency)).size;
  const closingSoon = resolved.filter((o) => {
    const d = daysUntil(o.closeDate);
    return d != null && d >= 0 && d <= 30;
  }).length;
  // Headline money comes from the MATCHES the reader is looking at (each
  // valued with the engine's capped realism logic) — the whole gate-passed
  // pool total stays in the meter panel where it's framed as ceilings.
  const matchedUsd = resolved.reduce((sum, o) => sum + meterValueUsd(o), 0);

  // Ranking hasn't run yet: the required basics aren't known, and running it
  // early would show numbers that collapse as answers arrive.
  const readiness = profileReadiness(report.profile);
  if (report.matches.length === 0 && !readiness.ready) {
    return (
      <section
        id="report"
        className="space-y-3 rounded-2xl border border-hairline bg-card p-6 shadow-card"
      >
        <h2 className="text-xl font-bold tracking-tight text-ink">
          A few basics first — then an accurate answer
        </h2>
        <p className="text-sm text-muted">
          We screen 4,600 programs, but ranking them without these facts would show you
          numbers that collapse the moment you answer one more question. Still needed
          ({readiness.knownCount}/{readiness.requiredCount} known):
        </p>
        <ul className="space-y-1 text-sm text-ink">
          {readiness.missing.map((m) => (
            <li key={m.key}>
              <span className="text-brand">•</span> {m.question}
            </li>
          ))}
        </ul>
        <p className="text-xs text-faint">
          Answer with the question cards or just type it in the chat box — ranking runs
          automatically the moment the last one is in.
        </p>
      </section>
    );
  }

  // Everything scored below the bar so far. Interim stream events never carry
  // `evidence` (the final report always does), so its absence means scoring is
  // still running — don't declare "nothing for you" at 15/177 scored.
  if (visible.length === 0) {
    const scoring = report.evidence == null;
    return (
      <section
        id="report"
        className="space-y-2 rounded-2xl border border-hairline bg-card p-6 text-center shadow-card"
      >
        <h2 className="text-xl font-bold tracking-tight text-ink">
          {scoring ? "Scoring your candidates…" : "No strong matches yet"}
        </h2>
        <p className="mx-auto max-w-md text-sm text-muted">
          {scoring ? (
            <>Strong matches appear here the moment one clears the bar — most runs surface
            them in the later batches.</>
          ) : (
            <>Nothing scored high enough to be worth your time
            {hidden > 0 ? ` (${hidden} weak ${hidden === 1 ? "match" : "matches"} hidden)` : ""}.
            Answering the eligibility questions usually sharpens the picture — each answer can
            unlock programs we couldn&apos;t confirm yet.</>
          )}
        </p>
      </section>
    );
  }

  return (
    <section id="report" className="space-y-5">
      {/* instrument readout band */}
      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-hairline bg-card shadow-card sm:grid-cols-4 sm:divide-x sm:divide-hairline">
        <Stat label="Matches" value={String(visible.length)} />
        <Stat label="Across matches" value={matchedUsd > 0 ? `≤ ${fmtUsd(matchedUsd)}` : "—"} money />
        <Stat label="Agencies" value={String(agencies)} />
        <Stat label="Closing ≤ 30d" value={String(closingSoon)} alert={closingSoon > 0} />
      </div>

      {/* tier groups under section rules */}
      {TIERS.map(({ tier, label }) => {
        const group = visible.filter((m) => m.tier === tier);
        if (group.length === 0) return null;
        return (
          <div key={tier} className="space-y-2.5">
            <div className="flex items-center gap-3">
              <span
                className={`inline-block rounded-full px-3 py-1 font-mono text-[11px] font-semibold ${TIER_CHIP[tier]}`}
              >
                {label} · {group.length}
              </span>
              <div className="h-px flex-1 bg-hairline" />
            </div>
            {group.map((m, i) => (
              <MatchCard
                key={m.opportunityId}
                match={m}
                opp={opps[m.opportunityId]}
                evidence={report.evidence?.[m.opportunityId]}
                profile={report.profile}
                index={i}
                spotlight={spotlight?.id === m.opportunityId ? spotlight.nonce : undefined}
              />
            ))}
          </div>
        );
      })}
      {hidden > 0 && (
        <p className="font-mono text-[11px] text-faint">
          {hidden} weaker {hidden === 1 ? "match" : "matches"} (score &lt; {MIN_SCORE}) hidden.
        </p>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  money = false,
  alert = false,
}: {
  label: string;
  value: string;
  money?: boolean;
  alert?: boolean;
}) {
  return (
    <div className="p-3.5">
      <p
        className={`font-mono text-xl font-semibold tracking-tight ${
          money ? "text-good" : alert ? "text-risk" : "text-ink"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.09em] text-faint">
        {label}
      </p>
    </div>
  );
}

export function HonestNoPanel({
  report,
  spotlight,
}: {
  report: UiReport;
  spotlight?: Spotlight | null;
}) {
  const opps = report.opportunities ?? {};
  return (
    <section
      id="report"
      className="space-y-3 rounded-2xl border border-hairline bg-card p-6 shadow-card"
    >
      {/* the one small risk accent this panel gets */}
      <span className="inline-block rounded-full bg-risk-soft px-3 py-1 font-mono text-[11px] font-semibold text-risk">
        DETERMINATION
      </span>
      <h2 className="text-xl font-bold tracking-tight text-ink">
        No strong federal match — here&apos;s the honest read
      </h2>
      {report.honestNoExplanation && (
        <p className="text-sm text-muted">{report.honestNoExplanation}</p>
      )}
      {report.matches.length > 0 && (
        <div className="space-y-2.5 pt-1">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-faint">
            ADJACENT &amp; STATE OPTIONS WORTH A LOOK
          </p>
          {report.matches.map((m, i) => (
            <MatchCard
              key={m.opportunityId}
              match={m}
              opp={opps[m.opportunityId]}
              evidence={report.evidence?.[m.opportunityId]}
              profile={report.profile}
              index={i}
              spotlight={spotlight?.id === m.opportunityId ? spotlight.nonce : undefined}
            />
          ))}
        </div>
      )}
      {report.rejected.length > 0 && (
        <div className="space-y-1 border-t border-hairline pt-3">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-faint">
            NEAR-MISSES (AND WHY THEY FAIL)
          </p>
          {report.rejected.map((g: GatedOpportunity) => (
            <p key={g.opportunity.id} className="text-sm text-muted">
              <span className="font-semibold text-ink">{g.opportunity.title}</span> —{" "}
              {g.gates.find((x) => x.verdict === "fail")?.detail ?? "hard eligibility fail"}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}

/** Loading placeholder shown while the first partial report is still coming. */
export function ReportSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="animate-pulse space-y-2.5 rounded-2xl border border-hairline bg-card p-5 shadow-card"
        >
          <div className="h-4 w-2/3 rounded bg-soft" />
          <div className="h-3 w-1/2 rounded bg-hairline" />
          <div className="h-3 w-5/6 rounded bg-soft" />
        </div>
      ))}
    </div>
  );
}

/** Pre-first-run empty state: the product's real three-step sequence. */
export function HowItWorks() {
  const steps = [
    {
      n: "1",
      title: "Describe",
      body: "Tell us about your company in plain words — or just talk to it with voice mode.",
    },
    {
      n: "2",
      title: "Answer to unlock",
      body: "Each eligibility answer unlocks real dollars: the meter shows exactly what every question is worth.",
    },
    {
      n: "3",
      title: "Apply with evidence",
      body: "Every match shows why it fits, what could disqualify you, and who actually wins this money.",
    },
  ];
  return (
    <section id="how-it-works" className="grid gap-3 sm:grid-cols-3">
      {steps.map((s) => (
        <div key={s.n} className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
          <div className="grid h-[30px] w-[30px] place-items-center rounded-full bg-soft font-mono text-xs font-semibold text-brand">
            {s.n}
          </div>
          <p className="mt-2.5 text-[15px] font-semibold tracking-tight text-ink">{s.title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">{s.body}</p>
        </div>
      ))}
    </section>
  );
}
