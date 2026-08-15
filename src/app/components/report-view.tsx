"use client";

// Region: results — the kit's "Top Matches" column. Header line with live
// counts, one score-ordered list of Federal Catalyst match cards, the
// "Held — Missing Data" dashed card for the readiness hold, the honest-no
// determination, plus loading/empty states.

import { useState } from "react";
import type { GatedOpportunity, Opportunity } from "@/lib/types";
import { profileReadiness } from "@/lib/engine/readiness";
import { meterValueUsd } from "@/lib/engine/gates";
import MatchCard from "./match-card";
import { fmtUsd, type Spotlight, type UiReport } from "./shared";

/** Matches below this score are noise — hidden from the report entirely. */
const MIN_SCORE = 50;

export function ReportView({
  report,
  spotlight,
  busy = false,
}: {
  report: UiReport;
  spotlight?: Spotlight | null;
  busy?: boolean;
}) {
  const [showWeak, setShowWeak] = useState(false);
  const opps = report.opportunities ?? {};
  const visible = [...report.matches]
    .filter((m) => m.score >= MIN_SCORE)
    .sort((a, b) => b.score - a.score);
  const hidden = report.matches.length - visible.length;
  const resolved = visible
    .map((m) => opps[m.opportunityId])
    .filter((o): o is Opportunity => o != null);
  // Headline money comes from the MATCHES the reader is looking at (each
  // valued with the engine's capped realism logic) — the whole gate-passed
  // pool total stays framed as ceilings in the Unlock panel.
  const matchedUsd = resolved.reduce((sum, o) => sum + meterValueUsd(o), 0);

  // Ranking hasn't run yet: the required basics aren't known. Rendered as the
  // kit's "Held — Missing Data" dashed card; Resolve points at the Unlock rail.
  const readiness = profileReadiness(report.profile);
  // While a run is LIVE the hold card would contradict the working rail —
  // the scoring state below covers it instead.
  if (report.matches.length === 0 && !readiness.ready && !busy) {
    return (
      <section id="report">
        <article className="rounded-[1.25rem] border-2 border-dashed border-line bg-surface-low/70 p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="rounded-full bg-surface-variant px-3 py-1 text-[12px] font-semibold text-muted">
                Held — missing data
              </span>
              <h4 className="mt-2.5 font-display text-[19px] font-bold tracking-tight text-ink">
                Your matches are ready to rank
              </h4>
              <p className="mt-1.5 max-w-2xl text-[14px] leading-relaxed text-muted">
                We screen 4,600 programs, but ranking without these facts would show numbers
                that collapse the moment you answer one more question. Still needed (
                {readiness.knownCount}/{readiness.requiredCount} known):
              </p>
              <ul className="mt-2.5 space-y-1.5 text-[14px] font-medium text-ink">
                {readiness.missing.map((m) => (
                  <li key={m.key}>
                    <span className="mr-1 text-brand">•</span> {m.question}
                  </li>
                ))}
              </ul>
            </div>
            <a
              href="#unlock"
              className="shrink-0 rounded-xl bg-brand px-4 py-2 text-[13.5px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-strong"
            >
              Resolve
            </a>
          </div>
          <p className="mt-3.5 text-[12.5px] text-faint">
            Ranking runs automatically the moment the last answer is in.
          </p>
        </article>
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
        className="card space-y-2 p-8 text-center"
      >
        <h2 className="font-display text-[21px] font-bold tracking-tight text-ink">
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
    <section id="report" className="space-y-4">
      {/* kit header line: Top Matches + live counts */}
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 className="font-display text-[22px] font-bold tracking-tight text-ink">
          Top Matches
        </h3>
        <span className="tnum text-[13px] text-faint">
          {report.meter.unlockedCount} eligible · {visible.length} ranked
          {matchedUsd > 0 ? ` · up to ${fmtUsd(matchedUsd)}` : ""}
        </span>
      </div>

      {visible.map((m, i) => (
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
      {hidden > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowWeak((v) => !v)}
            className="text-[13px] font-medium text-muted transition-colors hover:text-ink"
          >
            {showWeak ? "Hide" : "Show"} {hidden} weaker {hidden === 1 ? "match" : "matches"}
            {showWeak ? "" : " ▸"}
          </button>
          {showWeak && (
            <ul className="mt-2 space-y-1">
              {report.matches
                .filter((m) => m.score < MIN_SCORE)
                .map((m) => (
                  <li
                    key={m.opportunityId}
                    className="flex items-baseline justify-between gap-3 rounded-xl bg-surface-low px-4 py-2 text-[13px]"
                  >
                    <span className="min-w-0 truncate text-muted">
                      {opps[m.opportunityId]?.title ?? m.opportunityId}
                    </span>
                    <span className="tnum shrink-0 text-faint">score {m.score}</span>
                  </li>
                ))}
            </ul>
          )}
        </div>
      )}
      <FutureFitsSection report={report} />
    </section>
  );
}

/** "Worth watching" — hard-fails whose only blocker is time-solvable. The
 *  copy is explicit that these are NOT matches today; saving the profile is
 *  what turns them into follow-ups (the watcher emails on grow-into). */
function FutureFitsSection({ report }: { report: UiReport }) {
  const fits = report.futureFits ?? [];
  if (fits.length === 0) return null;
  const REASON_LABEL: Record<string, string> = {
    reopens: "Next cycle",
    start_rnd: "If you start R&D",
    amount_mismatch: "As needs change",
  };
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h3 className="font-display text-[18px] font-bold tracking-tight text-ink">
          Worth watching
        </h3>
        <span className="text-[12.5px] text-faint">
          not a fit today — blocked by something time can fix
        </span>
      </div>
      <ul className="mt-2 space-y-2">
        {fits.map((f) => (
          <li key={f.opportunityId} className="rounded-xl bg-surface-low px-4 py-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="min-w-0 text-[14px] font-medium text-ink">{f.title}</span>
              <span className="shrink-0 rounded-full bg-surface-variant px-2.5 py-0.5 text-[11.5px] font-semibold text-muted">
                {REASON_LABEL[f.reason] ?? f.reason}
              </span>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">{f.detail}</p>
            <p className="mt-0.5 text-[12px] text-faint">{f.agency}</p>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12.5px] text-faint">
        Save &amp; monitor below and we&apos;ll email you when one of these unlocks.
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
      className="card space-y-3 p-6 sm:p-7"
    >
      {/* the one small risk accent this panel gets */}
      <span className="inline-block rounded-full bg-risk-soft px-3 py-1 text-[12px] font-semibold text-risk">
        Determination
      </span>
      <h2 className="font-display text-[21px] font-bold tracking-tight text-ink">
        No strong federal match — here&apos;s the honest read
      </h2>
      {report.honestNoExplanation && (
        <p className="text-sm text-muted">{report.honestNoExplanation}</p>
      )}
      {report.matches.length > 0 && (
        <div className="space-y-2.5 pt-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
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
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
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
      <FutureFitsSection report={report} />
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
          className="shimmer card space-y-3 p-6"
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
        <div key={s.n} className="card p-6">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-soft font-display text-[14px] font-bold text-brand">
            {s.n}
          </div>
          <p className="mt-3 font-display text-[16px] font-bold tracking-tight text-ink">
            {s.title}
          </p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{s.body}</p>
        </div>
      ))}
    </section>
  );
}
