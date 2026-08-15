"use client";

// Region: results — the Opportunity Map itself. Summary stat band, matches
// grouped by fit tier, the honest-no panel, plus empty/loading states so
// every phase of the flow has a designed surface.

import type { GatedOpportunity, Opportunity } from "@/lib/types";
import { profileReadiness } from "@/lib/engine/readiness";
import { meterValueUsd } from "@/lib/engine/gates";
import MatchCard from "./match-card";
import { TIERS, daysUntil, fmtUsd, type UiReport } from "./shared";

/** Matches below this score are noise — hidden from the report entirely. */
const MIN_SCORE = 50;

export function ReportView({ report }: { report: UiReport }) {
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
      <section id="report" className="space-y-3 rounded-lg border border-blue-500/40 bg-blue-500/5 p-6">
        <h2 className="text-lg font-bold">
          A few basics first — then an accurate answer
        </h2>
        <p className="text-sm text-neutral-400">
          We screen 4,600 programs, but ranking them without these facts would show you
          numbers that collapse the moment you answer one more question. Still needed
          ({readiness.knownCount}/{readiness.requiredCount} known):
        </p>
        <ul className="space-y-1 text-sm text-neutral-200">
          {readiness.missing.map((m) => (
            <li key={m.key}>
              <span className="text-blue-300">•</span> {m.question}
            </li>
          ))}
        </ul>
        <p className="text-xs text-neutral-500">
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
      <section id="report" className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-6 text-center">
        <h2 className="text-lg font-bold">
          {scoring ? "Scoring your candidates…" : "No strong matches yet"}
        </h2>
        <p className="mx-auto max-w-md text-sm text-neutral-400">
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
      {/* summary stat band */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Matches" value={String(visible.length)} />
        <Stat
          label="across these matches"
          value={matchedUsd > 0 ? `up to ${fmtUsd(matchedUsd)}` : "—"}
        />
        <Stat label="Agencies" value={String(agencies)} />
        <Stat label="Closing ≤30d" value={String(closingSoon)} />
      </div>

      {/* tier groups */}
      {TIERS.map(({ tier, label, badge }) => {
        const group = visible.filter((m) => m.tier === tier);
        if (group.length === 0) return null;
        return (
          <div key={tier} className="space-y-2">
            <span
              className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge}`}
            >
              {label} · {group.length}
            </span>
            {group.map((m) => (
              <MatchCard
                key={m.opportunityId}
                match={m}
                opp={opps[m.opportunityId]}
                evidence={report.evidence?.[m.opportunityId]}
              />
            ))}
          </div>
        );
      })}
      {hidden > 0 && (
        <p className="text-xs text-neutral-600">
          {hidden} weaker {hidden === 1 ? "match" : "matches"} (score &lt; {MIN_SCORE}) hidden.
        </p>
      )}
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <p className="text-lg font-bold">{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}

export function HonestNoPanel({ report }: { report: UiReport }) {
  const opps = report.opportunities ?? {};
  return (
    <section id="report" className="space-y-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
      <h2 className="text-lg font-bold text-amber-400">No strong federal match</h2>
      {report.honestNoExplanation && (
        <p className="text-sm text-amber-100/90">{report.honestNoExplanation}</p>
      )}
      {report.matches.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-400/80">
            Adjacent & state options worth a look
          </p>
          {report.matches.map((m) => (
            <MatchCard
              key={m.opportunityId}
              match={m}
              opp={opps[m.opportunityId]}
              evidence={report.evidence?.[m.opportunityId]}
            />
          ))}
        </div>
      )}
      {report.rejected.length > 0 && (
        <div className="space-y-1 border-t border-amber-500/30 pt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-400/80">
            Near-misses (and why they fail)
          </p>
          {report.rejected.map((g: GatedOpportunity) => (
            <p key={g.opportunity.id} className="text-sm text-amber-100/80">
              <span className="font-semibold">{g.opportunity.title}</span> —{" "}
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
        <div key={i} className="animate-pulse space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <div className="h-4 w-2/3 rounded bg-neutral-800" />
          <div className="h-3 w-1/2 rounded bg-neutral-800" />
          <div className="h-3 w-5/6 rounded bg-neutral-800" />
        </div>
      ))}
    </div>
  );
}

/** Pre-first-run empty state: how the product works, in three steps. */
export function HowItWorks() {
  const steps = [
    {
      title: "1 · Describe",
      body: "Tell us about your company in plain words — or just talk to it with voice mode.",
    },
    {
      title: "2 · Answer to unlock",
      body: "Each eligibility answer unlocks real dollars: the meter shows exactly what every question is worth.",
    },
    {
      title: "3 · Apply with evidence",
      body: "Every match shows why it fits, what could disqualify you, and who actually wins this money.",
    },
  ];
  return (
    <section id="how-it-works" className="grid gap-3 sm:grid-cols-3">
      {steps.map((s) => (
        <div key={s.title} className="rounded-lg border border-neutral-800 bg-neutral-900 p-4">
          <p className="text-sm font-semibold text-neutral-200">{s.title}</p>
          <p className="mt-1 text-xs text-neutral-400">{s.body}</p>
        </div>
      ))}
    </section>
  );
}
