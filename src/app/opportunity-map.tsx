"use client";

// Opportunity Map — the stateful orchestrator. Owns the SSE stream + profile
// state and composes the mission-control page; all visual regions live in
// ./components/* so the styling pass can go file-by-file.
//
// Page structure (mission control):
//   #intake                — description box, analyze, sample chips
//   #workspace             — two-column grid on lg, stacked on mobile
//     #canvas  (main)      — skeleton/report/honest-no, save-&-monitor;
//                            cards materialize + take the agent's spotlight
//     #agent-rail (right)  — AgentDock: ONE agent presence (scope, status,
//                            narration w/ pointing power) + meter/interview/
//                            voice as its instruments

import { useEffect, useRef, useState } from "react";
import type { CompanyProfile, GateField } from "@/lib/types";
import { profileReadiness, readinessAsks } from "@/lib/engine/readiness";
import VoicePanel from "./voice-panel";
import SaveMonitor from "./save-monitor";
import IntakePanel from "./components/intake-panel";
import AgentDock from "./components/agent-dock";
import ProfileCard from "./components/profile-card";
import ActionPlan from "./components/action-plan";
import UnlockPanel from "./components/unlock-panel";
import { HonestNoPanel, HowItWorks, ReportSkeleton, ReportView } from "./components/report-view";
import UtahPathways from "./components/utah-pathways";
import type { QuickReply, Spotlight, UiReport } from "./components/shared";
import type { EligibilityMeter, InterviewQuestion } from "@/lib/types";

type Ev =
  | { type: "activity"; message: string }
  | { type: "profile"; profile: CompanyProfile }
  | { type: "questions"; questions: InterviewQuestion[]; meter: EligibilityMeter }
  | { type: "report"; report: UiReport }
  | { type: "error"; message: string };

export default function OpportunityMap() {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<string[]>([]);
  const [meter, setMeter] = useState<EligibilityMeter | null>(null);
  const [questions, setQuestions] = useState<InterviewQuestion[]>([]);
  const [report, setReport] = useState<UiReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [restored, setRestored] = useState(false);
  const [spotlight, setSpotlight] = useState<Spotlight | null>(null);
  // Render mirror of profileRef so the dossier re-paints as facts land.
  const [profileView, setProfileView] = useState<CompanyProfile | null>(null);
  const profileRef = useRef<CompanyProfile | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevBusy = useRef(false);

  // Restore the most recently saved profile so a refresh doesn't lose
  // interview answers. Best-effort; failures leave a blank slate.
  useEffect(() => {
    void fetch("/api/companies")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { companies?: { profile: CompanyProfile; updatedAt: string }[] } | null) => {
        const latest = (data?.companies ?? []).reduce<
          { profile: CompanyProfile; updatedAt: string } | null
        >((a, b) => (!a || b.updatedAt > a.updatedAt ? b : a), null);
        if (latest?.profile && !profileRef.current) {
          profileRef.current = latest.profile;
          setProfileView(latest.profile);
          // show only the founder's own words — interview follow-ups live in
          // the profile card, not the textarea
          const desc = (latest.profile.description ?? "").split("\nFounder follow-up:")[0].trim();
          setText((t) => t || desc);
          setRestored(true);
        }
      })
      .catch(() => {});
    // Restore the last finished report so nav round-trips don't lose the scan.
    try {
      const raw = sessionStorage.getItem("or:lastReport");
      if (raw) {
        const r = JSON.parse(raw) as UiReport;
        setReport(r);
        setMeter(r.meter);
        setQuestions(r.questions);
      }
    } catch {}
  }, []);

  /** Debounced autosave to the companies API (durable across refreshes).
   *  futureFits ride along when a report carried them, so the watcher can
   *  notify the founder when they grow into a blocked opportunity. */
  function persist(profile: CompanyProfile, futureFits?: import("@/lib/types").FutureFit[]) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: profile.name ?? "My company", profile, futureFits }),
      }).catch(() => {});
    }, 800);
  }

  function handle(ev: Ev) {
    switch (ev.type) {
      case "activity":
        setActivity((a) => [...a, ev.message]);
        break;
      case "profile":
        profileRef.current = ev.profile;
        setProfileView(ev.profile);
        persist(ev.profile);
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
        setProfileView(ev.report.profile);
        persist(ev.report.profile, ev.report.futureFits);
        // a scan is expensive — survive navigation (issue: report evaporated)
        try {
          sessionStorage.setItem("or:lastReport", JSON.stringify(ev.report));
        } catch {}
        break;
      case "error":
        setError(ev.message);
        break;
    }
  }

  /** The agent's pointing power: spotlight a card on the canvas. */
  const focusMatch = (opportunityId: string) => {
    setSpotlight({ id: opportunityId, nonce: Date.now() });
  };

  // When a run completes with matches, the agent presents its top pick:
  // spotlight + scroll the strongest card the founder can actually see.
  useEffect(() => {
    if (prevBusy.current && !busy && report && !report.honestNo) {
      const top = report.matches.find((m) => m.score >= 50);
      if (top) setSpotlight({ id: top.opportunityId, nonce: Date.now() });
    }
    prevBusy.current = busy;
  }, [busy, report]);

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
    setSpotlight(null);
    // Carry durable interview answers (gate fields) into re-analysis — but
    // ONLY when the box still builds on this profile's own description
    // (appended follow-ups). A rewritten description is a different company;
    // carrying the old answers leaks stale employees/revenue into the run.
    let p = profileRef.current;
    // compare against the founder's own words (pre-follow-up) — the textarea
    // never shows appended interview answers anymore
    const ownWords = p?.description?.split("\nFounder follow-up:")[0].trim() ?? "";
    if (p && !(ownWords && text.trim().startsWith(ownWords.slice(0, 80)))) {
      p = null;
      profileRef.current = null;
      setRestored(false);
    }
    const prior = p && {
      employees: p.employees,
      annualRevenueUsd: p.annualRevenueUsd,
      isForProfit: p.isForProfit,
      isSmallBusiness: p.isSmallBusiness,
      majorityUsOwned: p.majorityUsOwned,
      hasActiveRnD: p.hasActiveRnD,
      samRegistered: p.samRegistered,
      productMaturity: p.productMaturity,
      location: p.location,
    };
    void stream("/api/analyze", { founderText: text, prior });
  };

  const answer = (field: GateField, value: unknown) => {
    if (!profileRef.current) return;
    // priorReport unlocks the incremental fast path (re-gate + subtract, no re-ranking).
    void stream("/api/answer", {
      profile: profileRef.current,
      field,
      answer: value,
      priorReport: report,
    });
  };

  const sendMessage = (message: string) => {
    if (!profileRef.current || !message.trim()) return;
    void stream("/api/answer", {
      profile: profileRef.current,
      message: message.trim(),
      priorReport: report,
    });
  };

  // Quick replies: fetch one-tap suggestions once a stream settles and
  // questions are open. Best-effort — chips just don't show on failure.
  useEffect(() => {
    setQuickReplies([]);
    if (busy || questions.length === 0) return;
    const ac = new AbortController();
    void fetch("/api/suggest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ questions }),
      signal: ac.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { replies?: QuickReply[] } | null) => {
        if (d?.replies) setQuickReplies(d.replies);
      })
      .catch(() => {});
    return () => ac.abort();
  }, [busy, questions]);

  const started = busy || report != null || activity.length > 0;

  // Readiness hold: matches were intentionally not ranked. Meter questions
  // only cover fields some retrieved gate misses, so synthesize cards for the
  // remaining required basics (incl. the freeform-backed funding amount) —
  // otherwise the hold panel points at questions that don't exist.
  const holding =
    report != null && report.matches.length === 0 && !profileReadiness(report.profile).ready;
  const asks = holding ? readinessAsks(report.profile) : null;
  const interviewQuestions = asks
    ? [
        ...asks.gateQuestions.filter((s) => !questions.some((q) => q.field === s.field)),
        ...questions,
      ]
    : questions;

  return (
    <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10">
      {error && (
        <div
          id="error"
          className="mb-4 rounded-xl border border-[#F2C4BC] bg-risk-soft p-3 text-[13px] text-risk"
        >
          {error}
        </div>
      )}

      {/* Federal Catalyst 12-col map: dossier+plan | intake+matches | unlock+agent.
          DOM order puts the center first so mobile stacks intake → rail → dossier. */}
      <div id="workspace" className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        <div id="canvas" className="min-w-0 space-y-4 lg:order-2 lg:col-span-6">
          <IntakePanel
            text={text}
            busy={busy}
            restored={restored}
            onText={setText}
            onAnalyze={analyze}
          />
          {!started && !profileView && <HowItWorks />}
          {report && busy && (
            <p className="animate-pulse font-mono text-[11px] text-faint">
              Matches below update live as scoring finishes…
            </p>
          )}
          {busy && !report && <ReportSkeleton />}
          {report &&
            (report.honestNo ? (
              <HonestNoPanel report={report} spotlight={spotlight} />
            ) : (
              <ReportView report={report} spotlight={spotlight} busy={busy} />
            ))}
          {report?.utahContext && !busy && <UtahPathways context={report.utahContext} />}
          {report && !busy && <SaveMonitor profile={report.profile} />}
        </div>

        <div className="min-w-0 space-y-6 lg:order-1 lg:col-span-3">
          <ProfileCard
            profile={profileView}
            onSave={(p) => {
              // Manual edits are authoritative: update the working profile,
              // persist (keeps the stored future-fit snapshot), refresh view.
              profileRef.current = p;
              setProfileView(p);
              persist(p);
            }}
          />
          <ActionPlan report={report} />
        </div>

        <aside
          id="agent-rail"
          className="min-w-0 space-y-6 lg:sticky lg:top-20 lg:order-3 lg:col-span-3 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto"
        >
          <UnlockPanel
            meter={meter}
            questions={interviewQuestions}
            quickReplies={quickReplies}
            busy={busy}
            askCapitalNeed={asks?.needsCapitalNeed ?? false}
            preliminary={report != null && report.matches.length === 0}
            onAnswer={answer}
            onSend={sendMessage}
          />
          <AgentDock lines={activity} busy={busy} report={report} onFocusMatch={focusMatch}>
            {/* Voice mode (renders nothing unless GEMINI_API_KEY is set) */}
            <VoicePanel
              getProfile={() => profileRef.current}
              getReport={() => report}
              onEngineEvent={handle}
            />
          </AgentDock>
        </aside>
      </div>
    </main>
  );
}
