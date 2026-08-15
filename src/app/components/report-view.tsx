"use client";

// Region: results — the mock's "Top Matches" center column. One filtered,
// sorted list of collapsible match cards (the pagehead owns the filter/sort/
// collapse controls), the "Held — missing data" dashed card for the readiness
// hold, the honest-no determination, plus loading/empty states.

import { useState } from "react";
import type { GatedOpportunity } from "@/lib/types";
import { profileReadiness } from "@/lib/engine/readiness";
import MatchCard from "./match-card";
import { Badge } from "./ui";
import {
  MIN_SCORE,
  visibleMatches,
  type BulkToggle,
  type SortMode,
  type Spotlight,
  type UiReport,
} from "./shared";
import type { FitTier } from "@/lib/types";

export function ReportView({
  report,
  spotlight,
  busy = false,
  filters,
  sort = "score",
  bulk,
}: {
  report: UiReport;
  spotlight?: Spotlight | null;
  busy?: boolean;
  /** Tier filter from the pagehead; undefined = show every tier. */
  filters?: ReadonlySet<FitTier>;
  sort?: SortMode;
  bulk?: BulkToggle | null;
}) {
  const [showWeak, setShowWeak] = useState(false);
  const opps = report.opportunities ?? {};
  const strong = report.matches.filter((m) => m.score >= MIN_SCORE);
  const tierSet = filters ?? new Set(strong.map((m) => m.tier));
  const visible = visibleMatches(report, tierSet, sort);
  const weak = report.matches.length - strong.length;
  // The top-scored visible card opens on first paint; the rest stay folded.
  const topScoredId = visible.reduce<{ id: string; score: number } | null>(
    (best, m) => (best && best.score >= m.score ? best : { id: m.opportunityId, score: m.score }),
    null,
  )?.id;

  // Ranking hasn't run yet: the required basics aren't known. Rendered as the
  // kit's "Held — missing data" dashed card; Resolve points at the Unlock rail.
  const readiness = profileReadiness(report.profile);
  // While a run is LIVE the hold card would contradict the working rail —
  // the scoring state below covers it instead.
  if (report.matches.length === 0 && !readiness.ready && !busy) {
    return (
      <section id="report">
        <article className="or-card or-card--dashed">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <Badge tone="neutral" pill>
                Held — missing data
              </Badge>
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
            <a href="#unlock" className="or-btn or-btn--filled shrink-0">
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
  if (strong.length === 0) {
    // While a run is live, NEVER show failure copy — a judge mid-demo reads
    // "no strong matches" as the verdict, not as a loading state.
    const scoring = report.evidence == null || busy;
    return (
      <section id="report" className="or-card space-y-2 p-8 text-center">
        <h2 className="font-display text-[21px] font-bold tracking-tight text-ink">
          {scoring ? "Scoring your candidates…" : "No strong matches yet"}
        </h2>
        <p className="mx-auto max-w-md text-sm text-muted">
          {scoring ? (
            <>Strong matches appear here the moment one clears the bar — most runs surface
            them in the later batches.</>
          ) : (
            <>Nothing scored high enough to be worth your time
            {weak > 0 ? ` (${weak} weak ${weak === 1 ? "match" : "matches"} hidden)` : ""}.
            Answering the eligibility questions usually sharpens the picture — each answer can
            unlock programs we couldn&apos;t confirm yet.</>
          )}
        </p>
      </section>
    );
  }

  return (
    <section id="report" className="space-y-4">
      {/* the pagehead filter can empty the list — say so rather than go blank */}
      {visible.length === 0 && (
        <div className="or-card p-6 text-center text-sm text-muted">
          All {strong.length} matches are hidden by the current filter — re-check a tier above
          to see them.
        </div>
      )}

      {visible.map((m, i) => (
        <MatchCard
          key={m.opportunityId}
          match={m}
          opp={opps[m.opportunityId]}
          evidence={report.evidence?.[m.opportunityId]}
          profile={report.profile}
          index={i}
          spotlight={spotlight?.id === m.opportunityId ? spotlight.nonce : undefined}
          defaultExpanded={m.opportunityId === topScoredId}
          bulk={bulk}
        />
      ))}
      {weak > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowWeak((v) => !v)}
            className="text-[13px] font-medium text-muted transition-colors hover:text-ink"
          >
            {showWeak ? "Hide" : "Show"} {weak} weaker {weak === 1 ? "match" : "matches"}
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
              <Badge tone="neutral" pill className="shrink-0">
                {REASON_LABEL[f.reason] ?? f.reason}
              </Badge>
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
  bulk,
}: {
  report: UiReport;
  spotlight?: Spotlight | null;
  bulk?: BulkToggle | null;
}) {
  const opps = report.opportunities ?? {};
  return (
    <section id="report" className="or-card space-y-3">
      {/* the one small risk accent this panel gets */}
      <Badge tone="danger" pill>
        Determination
      </Badge>
      <h2 className="font-display text-[21px] font-bold tracking-tight text-ink">
        No strong federal match — here&apos;s the honest read
      </h2>
      {report.honestNoExplanation && (
        <p className="text-sm text-muted">{report.honestNoExplanation}</p>
      )}
      {report.matches.length > 0 && (
        <div className="space-y-2.5 pt-1">
          <p className="mk-label" style={{ textTransform: "uppercase" }}>
            Adjacent &amp; state options worth a look
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
              defaultExpanded={i === 0}
              bulk={bulk}
            />
          ))}
        </div>
      )}
      {report.rejected.length > 0 && (
        <div className="space-y-1 border-t border-hairline pt-3">
          <p className="mk-label" style={{ textTransform: "uppercase" }}>
            Near-misses (and why they fail)
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
        <div key={i} className="shimmer or-card space-y-3">
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
    <section id="how-it-works" className="grid gap-3 text-left sm:grid-cols-3">
      {steps.map((s) => (
        <div key={s.n} className="or-card">
          <span
            style={{
              display: "grid",
              placeItems: "center",
              width: 36,
              height: 36,
              borderRadius: 9999,
              background: "var(--color-primary-fixed)",
              color: "var(--color-primary)",
              font: "700 15px/1 var(--font-headline)",
            }}
          >
            {s.n}
          </span>
          <p className="mt-3 font-display text-[16px] font-bold tracking-tight text-ink">
            {s.title}
          </p>
          <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{s.body}</p>
        </div>
      ))}
    </section>
  );
}
