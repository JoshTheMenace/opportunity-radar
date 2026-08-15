"use client";

// Region: results — the kit's "Top Matches" column. Header line with live
// counts, one score-ordered list of Federal Catalyst match cards, the
// "Held — Missing Data" dashed card for the readiness hold, the honest-no
// determination, plus loading/empty states.

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
}: {
  report: UiReport;
  spotlight?: Spotlight | null;
}) {
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
  if (report.matches.length === 0 && !readiness.ready) {
    return (
      <section id="report">
        <article className="rounded-xl border-2 border-dashed border-line bg-surface-low p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <span className="rounded bg-surface-variant px-2 py-0.5 font-mono text-[11px] font-medium text-muted">
                Held — Missing Data
              </span>
              <h4 className="mt-2 font-display text-lg font-semibold text-ink">
                Your matches are ready to rank
              </h4>
              <p className="mt-1 max-w-2xl text-[13.5px] leading-relaxed text-muted">
                We screen 4,600 programs, but ranking without these facts would show numbers
                that collapse the moment you answer one more question. Still needed (
                {readiness.knownCount}/{readiness.requiredCount} known):
              </p>
              <ul className="mt-2 space-y-1 text-[13.5px] text-ink">
                {readiness.missing.map((m) => (
                  <li key={m.key}>
                    <span className="mr-1 text-brand">•</span> {m.question}
                  </li>
                ))}
              </ul>
            </div>
            <a
              href="#unlock"
              className="shrink-0 font-mono text-[12.5px] font-medium text-brand hover:underline"
            >
              Resolve ▸
            </a>
          </div>
          <p className="mt-3 font-mono text-[11px] text-faint">
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
        className="space-y-2 rounded-xl border border-hairline bg-card p-6 text-center shadow-sm"
      >
        <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
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
        <h3 className="font-display text-[22px] font-semibold tracking-tight text-ink">
          Top Matches
        </h3>
        <span className="font-mono text-[11.5px] text-faint">
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
        <p className="font-mono text-[11px] text-faint">
          {hidden} weaker {hidden === 1 ? "match" : "matches"} (score &lt; {MIN_SCORE}) hidden.
        </p>
      )}
    </section>
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
      className="space-y-3 rounded-xl border border-hairline bg-card p-6 shadow-sm"
    >
      {/* the one small risk accent this panel gets */}
      <span className="inline-block rounded-full bg-risk-soft px-3 py-1 font-mono text-[11px] font-semibold text-risk">
        DETERMINATION
      </span>
      <h2 className="font-display text-xl font-semibold tracking-tight text-ink">
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
          className="animate-pulse space-y-2.5 rounded-xl border border-hairline bg-card p-5 shadow-sm"
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
        <div key={s.n} className="rounded-xl border border-hairline bg-card p-5 shadow-sm">
          <div className="grid h-[30px] w-[30px] place-items-center rounded-full bg-soft font-mono text-xs font-semibold text-brand">
            {s.n}
          </div>
          <p className="mt-2.5 font-display text-[15px] font-semibold tracking-tight text-ink">
            {s.title}
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">{s.body}</p>
        </div>
      ))}
    </section>
  );
}
