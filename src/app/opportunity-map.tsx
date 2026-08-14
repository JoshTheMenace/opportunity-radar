"use client";

// Minimal functional UI for Opportunity Radar. A designer restyles later —
// keep everything Tailwind utilities, dark, and legible.

import { useRef, useState } from "react";
import type {
  CompanyProfile,
  EligibilityMeter,
  FitTier,
  GateField,
  GatedOpportunity,
  InterviewQuestion,
  MatchReport,
  Opportunity,
  RankedMatch,
} from "@/lib/types";

/** The report event carries an id→Opportunity lookup added by the API facade. */
type UiReport = MatchReport & { opportunities?: Record<string, Opportunity> };

type Ev =
  | { type: "activity"; message: string }
  | { type: "profile"; profile: CompanyProfile }
  | { type: "questions"; questions: InterviewQuestion[]; meter: EligibilityMeter }
  | { type: "report"; report: UiReport }
  | { type: "error"; message: string };

// ---------- formatting helpers ----------

function fmtUsd(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e6) return `$${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M`;
  if (n >= 1e3) return `$${Math.round(n / 1e3)}K`;
  return `$${n}`;
}

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000);
}

const TIERS: { tier: FitTier; label: string; badge: string }[] = [
  { tier: "likely_fit", label: "Likely fit", badge: "border-green-500/50 bg-green-500/10 text-green-400" },
  { tier: "verify_eligibility", label: "Verify eligibility", badge: "border-yellow-500/50 bg-yellow-500/10 text-yellow-400" },
  { tier: "adjacent", label: "Adjacent", badge: "border-orange-500/50 bg-orange-500/10 text-orange-400" },
];

// ---------- component ----------

export default function OpportunityMap() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<string[]>([]);
  const [meter, setMeter] = useState<EligibilityMeter | null>(null);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [report, setReport] = useState<UiReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const profileRef = useRef<CompanyProfile | null>(null);

  function handle(ev: Ev) {
    switch (ev.type) {
      case "activity":
        setActivity((a) => [...a, ev.message]);
        break;
      case "profile":
        profileRef.current = ev.profile;
        break;
      case "questions":
        setQuestions(ev.questions);
        setMeter(ev.meter);
        break;
      case "report":
        setReport(ev.report);
        setQuestions(ev.report.questions);
        setMeter(ev.report.meter);
        profileRef.current = ev.report.profile;
        break;
      case "error":
        setError(ev.message);
        break;
    }
  }

  async function stream(url: string, body: unknown) {
    setBusy(true);
    setError(null);
    setActivity([]);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (line) handle(JSON.parse(line.slice(6)) as Ev);
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  const analyze = () => {
    setReport(null);
    setMeter(null);
    setQuestions([]);
    void stream("/api/analyze", { founderText: text });
  };

  const answer = (field: GateField, value: unknown) => {
    if (!profileRef.current) return;
    void stream("/api/answer", { profile: profileRef.current, field, answer: value });
  };

  return (
    <main className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-4xl space-y-6 px-4 py-10">
        <header>
          <h1 className="text-2xl font-bold tracking-tight">Opportunity Radar</h1>
          <p className="text-sm text-neutral-400">
            Describe your company. We map it to US government funding — honestly.
          </p>
        </header>

        {/* 1. Intake */}
        <section className="space-y-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Tell us about your company — what you build, who it's for, your stage, where you're based…"
            rows={5}
            className="w-full resize-y rounded-lg border border-neutral-800 bg-neutral-900 p-3 text-sm placeholder:text-neutral-600 focus:border-neutral-600 focus:outline-none"
          />
          <button
            onClick={analyze}
            disabled={busy || !text.trim()}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? "Analyzing…" : "Analyze"}
          </button>
        </section>

        {error && (
          <div className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {/* 2. Activity feed */}
        {(busy || activity.length > 0) && (
          <section className="rounded-lg border border-neutral-800 bg-neutral-900 p-3 font-mono text-xs text-neutral-400">
            {activity.map((line, i) => (
              <div key={i}>
                <span className="text-neutral-600">›</span> {line}
              </div>
            ))}
            {busy && <div className="animate-pulse text-neutral-500">› working…</div>}
          </section>
        )}

        {/* 3. Eligibility meter + interview questions */}
        {meter && (
          <section className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
            <div className="flex items-end gap-3">
              <span className="text-3xl font-bold text-green-400">
                {fmtUsd(meter.unlockedUsd)}
              </span>
              <span className="pb-1 text-sm text-neutral-400">
                unlocked of {fmtUsd(meter.potentialUsd)} potential ·{" "}
                {meter.unlockedCount} eligible
              </span>
            </div>
            {meter.unlocks.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {meter.unlocks.map((u) => (
                  <span
                    key={u.field}
                    className="rounded-full border border-green-500/40 bg-green-500/10 px-2.5 py-0.5 text-xs text-green-400"
                  >
                    +{fmtUsd(u.unlockUsd)} · {u.opportunityCount} opp
                  </span>
                ))}
              </div>
            )}
            {questions.length > 0 && (
              <div className="space-y-2 border-t border-neutral-800 pt-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
                  Answer to unlock more
                </p>
                {questions.map((q) => (
                  <QuestionCard key={q.field} q={q} disabled={busy} onAnswer={answer} />
                ))}
              </div>
            )}
          </section>
        )}

        {/* 4. Report */}
        {report &&
          (report.honestNo ? (
            <HonestNoPanel report={report} />
          ) : (
            <ReportView report={report} />
          ))}
      </div>
    </main>
  );
}

// ---------- interview question ----------

function QuestionCard({
  q,
  disabled,
  onAnswer,
}: {
  q: InterviewQuestion;
  disabled: boolean;
  onAnswer: (field: GateField, value: unknown) => void;
}) {
  const [val, setVal] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm">{q.question}</p>
        <p className="text-xs text-neutral-500">{q.whyAsking}</p>
      </div>
      {q.answerType === "boolean" ? (
        <div className="flex gap-2">
          <button
            disabled={disabled}
            onClick={() => onAnswer(q.field, true)}
            className="rounded-md border border-green-500/50 px-3 py-1 text-sm text-green-400 hover:bg-green-500/10 disabled:opacity-40"
          >
            Yes
          </button>
          <button
            disabled={disabled}
            onClick={() => onAnswer(q.field, false)}
            className="rounded-md border border-neutral-700 px-3 py-1 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
          >
            No
          </button>
        </div>
      ) : q.answerType === "choice" && q.choices ? (
        <div className="flex flex-wrap gap-2">
          {q.choices.map((c) => (
            <button
              key={c}
              disabled={disabled}
              onClick={() => onAnswer(q.field, c)}
              className="rounded-md border border-neutral-700 px-3 py-1 text-sm hover:bg-neutral-800 disabled:opacity-40"
            >
              {c}
            </button>
          ))}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (val.trim()) onAnswer(q.field, val.trim());
          }}
          className="flex gap-2"
        >
          <input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            type={q.answerType === "number" ? "number" : "text"}
            className="w-32 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm focus:border-neutral-500 focus:outline-none"
          />
          <button
            disabled={disabled || !val.trim()}
            className="rounded-md border border-neutral-700 px-3 py-1 text-sm hover:bg-neutral-800 disabled:opacity-40"
          >
            Answer
          </button>
        </form>
      )}
    </div>
  );
}

// ---------- report views ----------

function ReportView({ report }: { report: UiReport }) {
  const opps = report.opportunities ?? {};
  const resolved = report.matches
    .map((m) => opps[m.opportunityId])
    .filter((o): o is Opportunity => o != null);
  const agencies = new Set(resolved.map((o) => o.agency)).size;
  const closingSoon = resolved.filter((o) => {
    const d = daysUntil(o.closeDate);
    return d != null && d >= 0 && d <= 30;
  }).length;

  return (
    <section className="space-y-4">
      {/* summary stats */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Matches" value={String(report.matches.length)} />
        <Stat label="Total potential" value={fmtUsd(report.meter.potentialUsd)} />
        <Stat label="Agencies" value={String(agencies)} />
        <Stat label="Closing ≤30d" value={String(closingSoon)} />
      </div>

      {/* tier groups */}
      {TIERS.map(({ tier, label, badge }) => {
        const group = report.matches.filter((m) => m.tier === tier);
        if (group.length === 0) return null;
        return (
          <div key={tier} className="space-y-2">
            <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${badge}`}>
              {label} · {group.length}
            </span>
            {group.map((m) => (
              <MatchCard key={m.opportunityId} match={m} opp={opps[m.opportunityId]} />
            ))}
          </div>
        );
      })}
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

function MatchCard({ match, opp }: { match: RankedMatch; opp?: Opportunity }) {
  const close = daysUntil(opp?.closeDate ?? null);
  const odds =
    opp?.expectedAwards != null
      ? `~${opp.expectedAwards} awards expected` +
        (opp.expectedApplications != null && opp.expectedAwards > 0
          ? ` · 1-in-${Math.max(1, Math.round(opp.expectedApplications / opp.expectedAwards))} odds`
          : "")
      : null;

  return (
    <div className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">{opp?.title ?? match.opportunityId}</h3>
        <span className="text-xs text-neutral-500">score {match.score}</span>
      </div>
      <p className="text-xs text-neutral-400">
        {opp ? (
          <>
            {opp.agency} · {opp.kind.replace(/_/g, "/")} ·{" "}
            {opp.awardFloorUsd != null && opp.awardCeilingUsd != null
              ? `${fmtUsd(opp.awardFloorUsd)}–${fmtUsd(opp.awardCeilingUsd)}`
              : opp.awardCeilingUsd != null
                ? `up to ${fmtUsd(opp.awardCeilingUsd)}`
                : "award size unlisted"}
            {opp.closeDate && (
              <span className={close != null && close <= 30 ? " text-red-400" : ""}>
                {" "}· closes {opp.closeDate}
                {close != null && close >= 0 ? ` (${close}d)` : ""}
              </span>
            )}
          </>
        ) : (
          "details unavailable"
        )}
      </p>
      {odds && <p className="text-xs text-neutral-500">{odds}</p>}
      <dl className="space-y-1.5 text-sm">
        <CardRow label="Why it fits" text={match.whyFit} tone="text-green-400" />
        <CardRow label="Could disqualify" text={match.whatCouldDisqualify} tone="text-red-400" />
        <CardRow label="Verify" text={match.whatToVerify} tone="text-yellow-400" />
        <CardRow label="Next steps" text={match.nextSteps} tone="text-blue-400" />
      </dl>
      {opp?.url && (
        <a
          href={opp.url}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-xs text-blue-400 underline hover:text-blue-300"
        >
          View opportunity ↗
        </a>
      )}
    </div>
  );
}

function CardRow({ label, text, tone }: { label: string; text: string; tone: string }) {
  return (
    <div>
      <dt className={`text-xs font-semibold uppercase tracking-wide ${tone}`}>{label}</dt>
      <dd className="text-neutral-300">{text}</dd>
    </div>
  );
}

function HonestNoPanel({ report }: { report: UiReport }) {
  const opps = report.opportunities ?? {};
  return (
    <section className="space-y-3 rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
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
            <MatchCard key={m.opportunityId} match={m} opp={opps[m.opportunityId]} />
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
