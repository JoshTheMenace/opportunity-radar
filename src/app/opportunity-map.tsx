"use client";

// Opportunity Map — the stateful orchestrator. Owns the SSE stream + profile
// state and composes the Federal Catalyst page; all visual regions live in
// ./components/* so the styling pass can go file-by-file.
//
// Page structure (mock's 3/6/3 grid):
//   mk-pagehead        — "Top Matches" + live counts + filter/sort/collapse
//   mk-c3 (left)       — ProfileCard dossier + ActionPlan checklist
//   mk-c6 (center)     — AgentDock (live runs) + intake + report/honest-no,
//                        save-&-monitor; cards take the agent's spotlight
//   mk-c3 (right)      — UnlockPanel + Deadlines timeline
// Before anything exists (no profile, no report, not busy) the grid gives
// way to a single centered onboarding hero: intake + voice + how-it-works.

import { useEffect, useRef, useState } from "react";
import type { CompanyProfile, FitTier, GateField } from "@/lib/types";
import { profileReadiness, readinessAsks } from "@/lib/engine/readiness";
import { meterValueUsd } from "@/lib/engine/gates";
import VoicePanel from "./voice-panel";
import SaveMonitor from "./save-monitor";
import IntakePanel from "./components/intake-panel";
import AgentDock from "./components/agent-dock";
import ProfileCard from "./components/profile-card";
import ActionPlan from "./components/action-plan";
import UnlockPanel from "./components/unlock-panel";
import MapControls from "./components/map-controls";
import MapDeadlines from "./components/map-deadlines";
import { HonestNoPanel, HowItWorks, ReportSkeleton, ReportView } from "./components/report-view";
import { usePageAssistantContext } from "./components/assistant/context";
import {
  FILTERABLE_TIERS,
  MIN_SCORE,
  fmtUsd,
  visibleMatches,
  type BulkToggle,
  type QuickReply,
  type SortMode,
  type Spotlight,
  type UiReport,
} from "./components/shared";
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
  // Pagehead view controls — pure client-side; never touch the engine state.
  const [filters, setFilters] = useState<Set<FitTier>>(new Set(FILTERABLE_TIERS));
  const [sort, setSort] = useState<SortMode>("score");
  const [bulk, setBulk] = useState<BulkToggle | null>(null);
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
      // highest score wins, matching the card the list opens by default
      const top = report.matches
        .filter((m) => m.score >= MIN_SCORE)
        .reduce<(typeof report.matches)[number] | null>(
          (a, b) => (a && a.score >= b.score ? a : b),
          null,
        );
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

  // Register what this page shows with the app-wide assistant drawer.
  usePageAssistantContext({
    page: "map",
    title: "Opportunity Map",
    data: report
      ? {
          topMatches: report.matches.slice(0, 5).map((m) => {
            const o = report.opportunities?.[m.opportunityId];
            return {
              title: o?.title ?? m.opportunityId,
              tier: m.tier,
              score: m.score,
              closeDate: o?.closeDate ?? null,
              awardCeilingUsd: o?.awardCeilingUsd ?? null,
            };
          }),
          meterRemainingUsd: Math.max(0, report.meter.potentialUsd - report.meter.unlockedUsd),
          honestNo: report.honestNo,
        }
      : null,
  });

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

  // Nothing exists yet → the centered onboarding hero replaces the grid.
  // (activity counts as started so voice-driven runs flip to the dashboard.)
  const onboarding = !profileView && !report && !busy && activity.length === 0;

  // The one visible list everything on the page agrees on (cards, counts,
  // deadlines). Honest-no reports keep their own full adjacent list.
  const visible = report && !report.honestNo ? visibleMatches(report, filters, sort) : [];
  const tierCounts = Object.fromEntries(FILTERABLE_TIERS.map((t) => [t, 0])) as Record<
    FitTier,
    number
  >;
  for (const m of report?.matches ?? []) {
    if (m.score >= MIN_SCORE && m.tier in tierCounts) tierCounts[m.tier] += 1;
  }
  const matchedUsd = visible.reduce((sum, m) => {
    const o = report?.opportunities?.[m.opportunityId];
    return o ? sum + meterValueUsd(o) : sum;
  }, 0);
  const headLabel = report
    ? report.honestNo
      ? "no strong federal match"
      : `${report.meter.unlockedCount} eligible · ${visible.length} ranked${
          matchedUsd > 0 ? ` · up to ${fmtUsd(matchedUsd)}` : ""
        }`
    : busy
      ? "scan in progress…"
      : "awaiting scan";
  const collapsed = bulk?.mode === "collapse";
  const dockLive = busy || activity.length > 0;

  return (
    <main className="mk-page">
      {error && (
        <div id="error" className="or-alert or-alert--danger" style={{ marginBottom: 16 }}>
          <p className="or-alert__body" style={{ margin: 0 }}>
            {error}
          </p>
        </div>
      )}

      {!onboarding && (
        <div className="mk-pagehead">
          <h2 className="mk-h3">Top Matches</h2>
          <div className="mk-row" style={{ gap: 16 }}>
            <span className="mk-label">{headLabel}</span>
            <MapControls
              counts={tierCounts}
              filters={filters}
              onFilters={setFilters}
              sort={sort}
              onSort={setSort}
              collapsed={collapsed}
              onToggleCollapsed={() =>
                setBulk({ mode: collapsed ? "expand" : "collapse", nonce: Date.now() })
              }
            />
          </div>
        </div>
      )}

      <div className={onboarding ? "mx-auto w-full max-w-2xl" : "mk-grid"}>
        {/* span 3 — dossier + action plan */}
        {!onboarding && (
          <div className="mk-c3">
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
        )}

        {/* span 6 (or the onboarding hero column). Slot order is stable so
            VoicePanel keeps its live session across the onboarding→dashboard
            flip — a remount would kill the WebSocket mid-conversation. */}
        <div id="canvas" className={onboarding ? "flex min-w-0 flex-col gap-6" : "mk-c6 min-w-0"}>
          {!onboarding && dockLive && (
            <AgentDock lines={activity} busy={busy} report={report} onFocusMatch={focusMatch} />
          )}
          <IntakePanel
            text={text}
            busy={busy}
            restored={restored}
            hero={onboarding}
            onText={setText}
            onAnalyze={analyze}
          />
          {/* Voice mode (renders nothing unless GEMINI_API_KEY is set) */}
          <VoicePanel
            getProfile={() => profileRef.current}
            getReport={() => report}
            onEngineEvent={handle}
          />
          {onboarding && <HowItWorks />}
          {!onboarding && (
            <>
              {report && busy && (
                <p className="mk-label animate-pulse">
                  Matches below update live as scoring finishes…
                </p>
              )}
              {busy && !report && <ReportSkeleton />}
              {report &&
                (report.honestNo ? (
                  <HonestNoPanel report={report} spotlight={spotlight} bulk={bulk} />
                ) : (
                  <ReportView
                    report={report}
                    spotlight={spotlight}
                    busy={busy}
                    filters={filters}
                    sort={sort}
                    bulk={bulk}
                  />
                ))}
              {/* The full Utah intelligence lives on /utah now — the map keeps
                  a doorway, not a second copy of the page. */}
              {report?.utahContext && !busy && (
                <a
                  href="/utah"
                  className="or-card flex items-center justify-between gap-4 transition-shadow hover:shadow-md"
                >
                  <div>
                    <p className="mk-label" style={{ marginBottom: 4 }}>UTAH CONNECTIONS</p>
                    <p className="text-[15px] font-medium text-ink">
                      Who in Utah won this money before you — and who can help you apply
                    </p>
                  </div>
                  <span className="material-symbols-outlined" style={{ color: "var(--color-primary)" }} aria-hidden>
                    arrow_forward
                  </span>
                </a>
              )}
              {report && !busy && <SaveMonitor profile={report.profile} />}
            </>
          )}
        </div>

        {/* span 3 — the asking rail: unlock + deadlines */}
        {!onboarding && (
          <div className="mk-c3">
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
            {report && !report.honestNo && visible.length > 0 && (
              <MapDeadlines report={report} matches={visible} />
            )}
          </div>
        )}
      </div>
    </main>
  );
}
