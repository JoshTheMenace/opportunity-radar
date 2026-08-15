"use client";

// Opportunity Map — the stateful orchestrator. Owns the SSE stream + profile
// state and composes the page structure; all visual regions live in
// ./components/* so the styling pass can go file-by-file.
//
// Page structure (stable for the restyle):
//   #intake                    — description box + analyze + sample chips
//   #workspace                 — two-column grid below lg, stacked on mobile
//     #results  (main column)  — activity feed, skeleton/partial note,
//                                #report or honest-no, save-&-monitor
//     #guidance (right rail)   — #meter, #interview, voice panel (sticky)

import { useEffect, useRef, useState } from "react";
import type { CompanyProfile, GateField } from "@/lib/types";
import VoicePanel from "./voice-panel";
import SaveMonitor from "./save-monitor";
import IntakePanel from "./components/intake-panel";
import ActivityFeed from "./components/activity-feed";
import MeterPanel from "./components/meter-panel";
import InterviewPanel from "./components/interview-panel";
import { HonestNoPanel, HowItWorks, ReportSkeleton, ReportView } from "./components/report-view";
import type { QuickReply, UiReport } from "./components/shared";
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
  const profileRef = useRef<CompanyProfile | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
          setText((t) => t || latest.profile.description || "");
          setRestored(true);
        }
      })
      .catch(() => {});
  }, []);

  /** Debounced autosave to the companies API (durable across refreshes). */
  function persist(profile: CompanyProfile) {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      void fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: profile.name ?? "My company", profile }),
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
        persist(ev.report.profile);
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
    // Carry durable interview answers (gate fields) into re-analysis; the
    // rest of the profile is re-extracted from whatever is in the box.
    const p = profileRef.current;
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
    void stream("/api/answer", { profile: profileRef.current, field, answer: value });
  };

  const sendMessage = (message: string) => {
    if (!profileRef.current || !message.trim()) return;
    void stream("/api/answer", { profile: profileRef.current, message: message.trim() });
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

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      <IntakePanel
        text={text}
        busy={busy}
        restored={restored}
        onText={setText}
        onAnalyze={analyze}
      />

      {error && (
        <div
          id="error"
          className="rounded-lg border border-red-500/50 bg-red-500/10 p-3 text-sm text-red-400"
        >
          {error}
        </div>
      )}

      {!started && <HowItWorks />}

      {/* Workspace: results (main) + guidance rail. Rail sticks on desktop and
          stacks above the report on mobile so questions stay reachable. */}
      <div id="workspace" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <aside id="guidance" className="min-w-0 space-y-4 lg:order-2 lg:sticky lg:top-20">
          {/* Voice mode (renders nothing unless GEMINI_API_KEY is set) */}
          <VoicePanel
            getProfile={() => profileRef.current}
            onReport={(r) => handle({ type: "report", report: r })}
          />
          {meter && <MeterPanel meter={meter} />}
          <InterviewPanel
            questions={questions}
            quickReplies={quickReplies}
            busy={busy}
            onAnswer={answer}
            onSend={sendMessage}
          />
        </aside>

        <div id="results" className="min-w-0 space-y-4 lg:order-1">
          <ActivityFeed lines={activity} busy={busy} />
          {report && busy && (
            <p className="animate-pulse text-xs text-neutral-500">
              Scoring in progress — matches below update live…
            </p>
          )}
          {busy && !report && <ReportSkeleton />}
          {report &&
            (report.honestNo ? <HonestNoPanel report={report} /> : <ReportView report={report} />)}
          {report && !busy && <SaveMonitor profile={report.profile} />}
        </div>
      </div>
    </main>
  );
}
