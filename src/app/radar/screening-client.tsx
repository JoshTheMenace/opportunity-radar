"use client";

// Screening — the eligibility control room. Every number on this page is
// derived from the stored report (sessionStorage "or:lastReport"), the DB
// (server-passed screenedCount), or the live monitor APIs. Nothing invented.
//
// Layout follows the approved Screening mock: mk-pagehead, then a 3/6/3
// mk-grid — summary meter left, rule cards center, ask + deadlines right.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import type { CompanyProfile, GateField, MeterUnlock } from "@/lib/types";
import { fmtUsd, type UiReport, daysUntil } from "../components/shared";
import { usePageAssistantContext } from "../components/assistant/context";
import { Avatar, Badge, Button, Icon, Timeline, type TimelineItem } from "../components/ui";

/* ---------------------------------------------------------------- data */

interface CompanyRow {
  id: number;
  name: string;
  email: string | null;
  monitoring: boolean;
  updatedAt: string;
  completeness: { score: number; monitorable: boolean; missing: string[] };
}

interface NotificationRow {
  id: number;
  companyName: string;
  score: number;
  tier: string;
  whyFit: string;
  emailSubject: string | null;
  emailBody: string | null;
  createdAt: string;
  opportunity: { title: string; agency: string; closeDate: string | null; url: string | null } | null;
}

/* ------------------------------------------------- field → plain language */

/** Gate name shown as the technical mk-label on each unresolved card. */
const FIELD_GATE: Record<GateField, string> = {
  majorityUsOwned: "sbir:ownership",
  employees: "sbir:employees",
  hasActiveRnD: "sbir:rnd",
  isSmallBusiness: "eligibility:small_business",
  isForProfit: "eligibility:for_profit",
  samRegistered: "sam:lead_time",
  location: "geo:utah",
  annualRevenueUsd: "size:revenue",
  productMaturity: "stage",
};

const FIELD_TITLE: Record<GateField, string> = {
  majorityUsOwned: "Majority US ownership",
  employees: "Team size",
  hasActiveRnD: "Active R&D",
  isSmallBusiness: "Small-business status",
  isForProfit: "For-profit status",
  samRegistered: "SAM.gov registration",
  location: "Company location",
  annualRevenueUsd: "Annual revenue",
  productMaturity: "Product stage",
};

/** Honest, generic why-it-matters copy per gate field — no invented numbers. */
const FIELD_WHY: Record<GateField, string> = {
  majorityUsOwned:
    "SBIR (the federal small-business R&D program) requires >50% ownership by US citizens or permanent residents. One answer settles it for every SBIR program at once.",
  employees:
    "SBIR and small-business programs cap company size at 500 employees. Your headcount settles the size rule everywhere it applies.",
  hasActiveRnD:
    "SBIR/STTR specifically funds active research and development. If you're not doing R&D those programs drop out — honestly, rather than lingering as false hope.",
  isSmallBusiness:
    "Several programs are restricted to small businesses under SBA (Small Business Administration) size rules — roughly under 500 employees. A yes or no settles them all at once.",
  isForProfit:
    "Some federal programs exclude for-profit companies; others require them. Knowing which you are lets the applicant-type rule run deterministically.",
  samRegistered:
    "Federal awards need an active SAM.gov registration (the government's contractor registry), and it takes 10–15 business days. For near-term deadlines this one answer decides feasibility.",
  location:
    "State programs are location-restricted. Your state settles every geographic rule in one answer.",
  annualRevenueUsd:
    "Some programs use revenue-based size limits instead of headcount. Last year's revenue settles them.",
  productMaturity:
    "Programs target specific development stages, from concept to in-market. Your stage tells us which ones actually fit.",
};

/* ---------------------------------------------------------- rule status */

/** The 9 deterministic rules in gates.ts, mapped to the profile fact each
 *  needs. "Settled" = the profile can answer the rule today (either way). */
const RULES: { key: string; settled: (p: CompanyProfile) => boolean }[] = [
  { key: "deadline", settled: () => true }, // source data — closed programs auto-dropped
  { key: "eligibility:for_profit", settled: (p) => p.isForProfit != null },
  { key: "eligibility:small_business", settled: (p) => p.isSmallBusiness != null || p.employees != null },
  { key: "sbir:ownership", settled: (p) => p.majorityUsOwned != null },
  { key: "sbir:employees", settled: (p) => p.employees != null || p.isSmallBusiness === true },
  { key: "sbir:rnd", settled: (p) => p.hasActiveRnD != null },
  { key: "amount_overlap", settled: (p) => p.capitalNeedUsd.min != null || p.capitalNeedUsd.max != null },
  { key: "sam:lead_time", settled: (p) => p.samRegistered != null },
  { key: "geo:utah", settled: (p) => (p.location?.state ?? null) != null },
];

/** Screens the profile genuinely clears (favorable, derivable facts only). */
function clearedRows(p: CompanyProfile): { label: string; source: string }[] {
  const rows: { label: string; source: string }[] = [];
  if (p.isSmallBusiness === true) rows.push({ label: "Small business (<500 employees)", source: "Profile" });
  if (p.isForProfit === true) rows.push({ label: "For-profit entity", source: "Profile" });
  if ((p.location?.state ?? "").toUpperCase() === "UT")
    rows.push({ label: `Location — ${p.location?.city ? `${p.location.city}, ` : ""}Utah, eligible for state programs`, source: "Profile" });
  if (p.majorityUsOwned === true) rows.push({ label: "Majority US-owned (SBIR statute)", source: "Profile" });
  if (p.hasActiveRnD === true) rows.push({ label: "Active R&D underway (SBIR/STTR)", source: "Profile" });
  if (p.employees != null && p.employees <= 500)
    rows.push({ label: `Team of ${p.employees} — under the 500-employee SBIR cap`, source: "Profile" });
  if (p.samRegistered === true) rows.push({ label: "SAM.gov registration active", source: "Profile" });
  if (p.capitalNeedUsd.min != null || p.capitalNeedUsd.max != null) {
    const range = [p.capitalNeedUsd.min, p.capitalNeedUsd.max].filter((n): n is number => n != null).map(fmtUsd).join("–");
    rows.push({ label: `Funding need stated (${range}) — award-size screen active`, source: "Profile" });
  }
  rows.push({ label: "Deadline screen — closed programs dropped automatically", source: "Source data" });
  return rows;
}

/** Plain-language phrasing for the hard-fail gate names in report.rejected. */
const FAIL_PHRASE: Record<string, string> = {
  deadline: "the deadline already passed",
  "eligibility:for_profit": "restricted to non-profits, universities or agencies",
  "eligibility:small_business": "not open to small businesses",
  "sbir:ownership": "requires majority US ownership",
  "sbir:employees": "over the 500-employee SBIR cap",
  "sbir:rnd": "funds active R&D only",
  amount_overlap: "award size doesn't overlap your need",
  "sam:lead_time": "closes too soon to finish SAM.gov registration",
  "geo:utah": "restricted to Utah companies",
};

/* ------------------------------------------------------------- helpers */

/** ALL-CAPS words longer than 3 chars → Capitalized; short/mixed unchanged. */
function humanize(s: string): string {
  return s.replace(/\b[A-Z]{4,}\b/g, (w) => w[0] + w.slice(1).toLowerCase());
}

/** "2026-10-15" → "OCT 15" (adds 'YY when not this year). */
function fmtDeadline(iso: string): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00`);
  const md = d
    .toLocaleDateString("en-US", { month: "short", day: "2-digit" })
    .toUpperCase()
    .replace(",", "");
  return d.getFullYear() === new Date().getFullYear() ? md : `${md} '${String(d.getFullYear()).slice(2)}`;
}

/** "found 3:42 PM" same-day, "found Aug 14" otherwise. */
function fmtFound(createdAt: string): string {
  const d = new Date(createdAt + "Z");
  return d.toDateString() === new Date().toDateString()
    ? `found ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
    : `found ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

function initials(name: string | null): string {
  if (!name) return "SC";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? parts[0]?.[1] ?? "")).toUpperCase();
}

const h4: React.CSSProperties = {
  margin: "0 0 4px",
  font: "600 18px/26px var(--font-headline)",
  color: "var(--color-text-deep)",
};
const bodyP: React.CSSProperties = {
  margin: "0 0 16px",
  font: "400 14px/20px var(--font-body)",
  color: "var(--color-on-surface-variant)",
};

/* ================================================================ page */

export default function ScreeningClient({
  screenedCount,
  ruleCount,
}: {
  screenedCount: number;
  ruleCount: number;
}) {
  const [report, setReport] = useState<UiReport | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [openEmail, setOpenEmail] = useState<number | null>(null);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("or:lastReport");
      if (raw) setReport(JSON.parse(raw) as UiReport);
    } catch {}
    setLoaded(true);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [c, n] = await Promise.all([
        fetch("/api/companies").then((r) => r.json()),
        fetch("/api/notifications").then((r) => r.json()),
      ]);
      setCompanies(c.companies ?? []);
      setNotifications(n.notifications ?? []);
    } catch {
      // transient — next poll retries
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  /* ---------------- derivations (all from the stored report) ---------------- */

  const meter = report?.meter ?? null;
  // Money currently held = potential minus already-unlocked (everything gated
  // by an unknown), split into what answers free vs. what only the notice can.
  const heldUsd = meter ? Math.max(0, meter.potentialUsd - meter.unlockedUsd) : 0;
  const answerableUsd = meter ? meter.unlocks.reduce((s, u) => s + u.unlockUsd, 0) : 0;
  const noticeOnlyUsd = Math.max(0, heldUsd - answerableUsd);
  const unlocks: MeterUnlock[] = useMemo(
    () => [...(meter?.unlocks ?? [])].sort((a, b) => b.unlockUsd - a.unlockUsd),
    [meter],
  );
  const blockedCount = report?.rejected.length ?? 0;
  const verifyMatches = useMemo(
    () => (report?.matches ?? []).filter((m) => m.tier === "verify_eligibility"),
    [report],
  );
  const profile = report?.profile ?? null;
  const settled = profile ? RULES.filter((r) => r.settled(profile)).length : 0;
  const cleared = profile ? clearedRows(profile) : [];

  // Dominant hard-fail reasons across report.rejected (each gate detail).
  const failReasons = useMemo(() => {
    const tally = new Map<string, number>();
    for (const g of report?.rejected ?? []) {
      for (const gate of g.gates) {
        if (gate.verdict === "fail") tally.set(gate.gate, (tally.get(gate.gate) ?? 0) + 1);
      }
    }
    return [...tally.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([gate, n]) => `${FAIL_PHRASE[gate] ?? gate} (${n})`);
  }, [report]);

  // Deadlines: real close dates from the report's matches, soonest first.
  const deadlineItems: TimelineItem[] = useMemo(() => {
    const opps = report?.opportunities ?? {};
    const dated: { iso: string; title: string; agency: string }[] = [];
    const rolling: { title: string; agency: string }[] = [];
    const today = new Date().toISOString().slice(0, 10);
    for (const m of report?.matches ?? []) {
      if (m.tier === "not_a_fit") continue; // ranked out — its deadline is noise
      const o = opps[m.opportunityId];
      if (!o) continue;
      if (o.closeDate && o.closeDate >= today)
        dated.push({ iso: o.closeDate, title: humanize(o.title), agency: o.agency });
      else if (!o.closeDate) rolling.push({ title: humanize(o.title), agency: o.agency });
    }
    dated.sort((a, b) => a.iso.localeCompare(b.iso));
    const items: TimelineItem[] = dated.slice(0, 4).map((d, i) => {
      const days = daysUntil(d.iso);
      return {
        date: fmtDeadline(d.iso),
        title: d.title,
        detail: d.agency,
        state: i === 0 ? "current" : "todo",
        badge: days != null && days <= 7 ? `IN ${days} DAY${days === 1 ? "" : "S"}` : undefined,
      };
    });
    for (const r of rolling.slice(0, Math.max(0, 5 - items.length)))
      items.push({ date: "Rolling", title: r.title, detail: `${r.agency} — no fixed close date; we won't invent one.` });
    return items;
  }, [report]);

  // Assistant: what this page is showing, in serializable form.
  usePageAssistantContext(
    useMemo(
      () => ({
        page: "screening",
        title: "Screening",
        data: {
          unresolved: unlocks.map((u) => ({
            field: u.field,
            unlockUsd: u.unlockUsd,
            programCount: u.opportunityCount,
          })),
          blockedCount,
          verifyCount: verifyMatches.length,
          heldUsd,
        },
      }),
      [unlocks, blockedCount, verifyMatches.length, heldUsd],
    ),
  );

  const topUnlock = unlocks[0] ?? null;
  const questionFor = (field: GateField): string =>
    report?.questions.find((q) => q.field === field)?.question ??
    unlocks.find((u) => u.field === field)?.question ??
    FIELD_TITLE[field];

  /* ------------------------------------------------------------- render */

  const monitoring = (
    <>
      {/* the monitoring story — this screening re-runs itself */}
      <div className="or-card">
        <div className="mk-row" style={{ marginBottom: 8 }}>
          <Icon name="radar" size={20} color="var(--color-primary)" />
          <h4 style={{ ...h4, margin: 0 }}>This screening re-runs itself</h4>
        </div>
        <p style={{ ...bodyP, marginBottom: 12 }}>
          The Nucleus Institute charges $125 per manual search; Opportunity Radar watches{" "}
          <span className="mk-num">{screenedCount > 0 ? screenedCount.toLocaleString() : "every listed"}</span>{" "}
          programs weekly for free, re-researches your company, and emails you when something
          unlocks. Saved companies are gated and ranked against every new opportunity — no buttons.
        </p>
        {companies.length === 0 ? (
          <p style={{ ...bodyP, marginBottom: 0 }}>
            No companies saved yet — run an analysis and hit Save &amp; monitor.
          </p>
        ) : (
          <div className="mk-stack">
            {companies.map((c) => (
              <div className="or-kv" key={c.id}>
                <span className="or-kv__label">
                  {c.name}
                  <span className="mk-label" style={{ marginLeft: 8 }}>
                    profile {Math.round(c.completeness.score * 100)}%
                    {c.email ? ` · ${c.email}` : " · no email on file"}
                  </span>
                </span>
                {c.completeness.monitorable ? (
                  <Badge tone="fit">monitoring active</Badge>
                ) : (
                  <Badge tone="caution">needs: {c.completeness.missing.join(", ")}</Badge>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* notifications feed */}
      <div className="or-card or-card--flush">
        <div className="mk-cardhead">
          Notifications
          <span className="mk-label">{notifications.length} found by the watcher</span>
        </div>
        {notifications.length === 0 ? (
          <p style={{ ...bodyP, margin: 0, padding: 16 }}>
            Nothing new for your companies yet. The radar checks every cycle — you don&apos;t have to.
          </p>
        ) : (
          notifications.map((n) => (
            <div key={n.id} style={{ padding: 16, borderTop: "1px solid var(--color-border-ice)" }}>
              <div className="mk-between" style={{ alignItems: "flex-start" }}>
                <div style={{ minWidth: 0 }}>
                  <span className="mk-label">New match · {n.companyName} · {fmtFound(n.createdAt)}</span>
                  <h5 style={{ ...h4, fontSize: 16, lineHeight: "24px", margin: "4px 0 2px" }}>
                    {n.opportunity?.url ? (
                      <a href={n.opportunity.url} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
                        {humanize(n.opportunity?.title ?? n.emailSubject ?? "")}
                      </a>
                    ) : (
                      humanize(n.opportunity?.title ?? n.emailSubject ?? "")
                    )}
                  </h5>
                  <span className="mk-label">
                    {n.opportunity?.agency}
                    {n.opportunity?.closeDate ? ` · closes ${fmtDeadline(n.opportunity.closeDate)}` : ""}
                  </span>
                </div>
                <Badge tone={n.tier === "likely_fit" ? "fit" : "caution"}>
                  {n.tier.replace("_", " ")} · {n.score}
                </Badge>
              </div>
              <p style={{ ...bodyP, margin: "8px 0 0" }}>{n.whyFit}</p>
              {n.emailBody && (
                <div style={{ marginTop: 8 }}>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setOpenEmail(openEmail === n.id ? null : n.id)}
                  >
                    {openEmail === n.id ? "Hide drafted email" : "View drafted email"}
                  </Button>
                  {openEmail === n.id && (
                    <pre
                      style={{
                        marginTop: 8,
                        padding: 16,
                        borderRadius: "var(--radius-lg)",
                        background: "var(--color-surface-container)",
                        font: "400 13px/19px var(--font-body)",
                        whiteSpace: "pre-wrap",
                        overflowX: "auto",
                        color: "var(--color-text-deep)",
                      }}
                    >
                      {`Subject: ${n.emailSubject}\n\n${n.emailBody}`}
                    </pre>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      {/* link to the dream agent's research diary */}
      <Link href="/dream" className="or-card" style={{ textDecoration: "none", display: "block" }}>
        <div className="mk-between">
          <div>
            <h4 style={{ ...h4, marginBottom: 2 }}>Weekly research log →</h4>
            <p style={{ ...bodyP, margin: 0 }}>
              The agent&apos;s research diary — what it re-checked about your company while you slept,
              with a source for every change.
            </p>
          </div>
          <Icon name="bedtime" size={24} color="var(--color-primary)" />
        </div>
      </Link>
    </>
  );

  return (
    <main className="mk-page">
      <div className="mk-pagehead">
        <h2 className="mk-h3">Screening</h2>
        <span className="mk-label">
          {screenedCount > 0 ? `${screenedCount.toLocaleString()} screened · ` : ""}
          {ruleCount} rules
        </span>
      </div>

      {loaded && !report ? (
        /* ------------------------- empty state ------------------------- */
        <div className="mk-grid">
          <div className="mk-c6" style={{ gridColumn: "4 / span 6" }}>
            <div className="or-card" style={{ textAlign: "center", padding: 40 }}>
              <Icon name="filter_alt" size={40} color="var(--color-primary)" />
              <h3 style={{ ...h4, fontSize: 22, lineHeight: "30px", margin: "12px 0 8px" }}>
                Run your first scan
              </h3>
              <p style={{ ...bodyP, maxWidth: 480, margin: "0 auto 20px" }}>
                Run your first scan and this page becomes your eligibility control room — every rule
                we check, what each answer is worth, and what no answer can fix.
              </p>
              <Link href="/" className="or-btn or-btn--filled">
                Start on the Opportunity Map
              </Link>
            </div>
            {monitoring}
          </div>
        </div>
      ) : loaded && report && meter && profile ? (
        /* ----------------------- populated state ----------------------- */
        <div className="mk-grid">
          {/* left: summary + money held */}
          <div className="mk-c3">
            <div
              className="or-card"
              style={{ overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}
            >
              <Avatar size="lg" initials={initials(profile.name)} style={{ marginBottom: 12, marginTop: 4 }} />
              <h3 style={{ margin: "0 0 4px", font: "600 24px/32px var(--font-headline)", color: "var(--color-text-deep)" }}>
                {settled} of {RULES.length} settled
              </h3>
              <span className="mk-label" style={{ textTransform: "uppercase", marginBottom: 12 }}>
                Federal screens
              </span>
              {unlocks.length > 0 ? (
                <Badge tone="caution" icon="info" style={{ width: "100%", justifyContent: "center", marginBottom: 24 }}>
                  {unlocks.length} answer{unlocks.length === 1 ? "" : "s"} from full ranking
                </Badge>
              ) : (
                <Badge tone="fit" icon="check" style={{ width: "100%", justifyContent: "center", marginBottom: 24 }}>
                  Every answerable rule settled
                </Badge>
              )}
              <div className="mk-meter" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
                <div className="mk-meter__head">
                  <span className="mk-label">MONEY CURRENTLY HELD</span>
                  <span className="mk-meter__value">{fmtUsd(heldUsd)}</span>
                </div>
                {heldUsd > 0 && (
                  <div
                    className="mk-stackbar"
                    role="img"
                    aria-label={`Of ${fmtUsd(heldUsd)} held: ${fmtUsd(answerableUsd)} you can settle with answers, ${fmtUsd(noticeOnlyUsd)} only the notice can settle, plus ${blockedCount} blocked programs`}
                  >
                    <span style={{ width: `${(answerableUsd / heldUsd) * 100}%`, background: "var(--color-caution-text)" }} />
                    <span style={{ width: `${(noticeOnlyUsd / heldUsd) * 100}%`, background: "var(--color-outline-variant)" }} />
                  </div>
                )}
                <div className="mk-legend">
                  <div className="mk-legend__row">
                    <span className="mk-legend__key">
                      <span className="mk-legend__dot" style={{ background: "var(--color-caution-text)" }} />
                      You can settle
                    </span>
                    <span className="mk-num">{fmtUsd(answerableUsd)}</span>
                  </div>
                  <div className="mk-legend__row">
                    <span className="mk-legend__key">
                      <span className="mk-legend__dot" style={{ background: "var(--color-outline-variant)" }} />
                      Only the notice can
                    </span>
                    <span className="mk-num">{fmtUsd(noticeOnlyUsd)}</span>
                  </div>
                  <div className="mk-legend__row">
                    <span className="mk-legend__key">
                      <span className="mk-legend__dot" style={{ background: "var(--color-error)" }} />
                      Blocked outright
                    </span>
                    <span className="mk-num">{blockedCount} programs</span>
                  </div>
                </div>
                <p className="mk-meter__note">
                  The grey share is the honest part — no answer you give can free it.
                </p>
              </div>
            </div>
          </div>

          {/* center: unresolved rules, the honest card, blocked, cleared, monitoring */}
          <div className="mk-c6">
            {unlocks.map((u) => (
              <div className="or-card" key={u.field}>
                <div className="mk-between" style={{ marginBottom: 8 }}>
                  <div className="mk-row">
                    <Badge tone="caution">Unresolved</Badge>
                    <span className="mk-label">{FIELD_GATE[u.field]}</span>
                  </div>
                  <span className="mk-num" style={{ color: "var(--color-primary)" }}>
                    {fmtUsd(u.unlockUsd)}
                  </span>
                </div>
                <h4 style={h4}>{FIELD_TITLE[u.field]}</h4>
                <p style={{ ...bodyP, marginBottom: 8 }}>{questionFor(u.field)}</p>
                <p style={bodyP}>{FIELD_WHY[u.field]}</p>
                <div className="mk-between">
                  <span className="mk-label">
                    {u.opportunityCount} program{u.opportunityCount === 1 ? "" : "s"}
                  </span>
                  <Link href="/#unlock" className="or-btn or-btn--filled or-btn--sm">
                    Answer this
                  </Link>
                </div>
              </div>
            ))}

            {/* the honest half — verify_eligibility, no answer resolves it */}
            {verifyMatches.length > 0 && (
              <div className="or-card">
                <div className="mk-between" style={{ marginBottom: 8 }}>
                  <Badge tone="caution">Uncertain eligibility</Badge>
                  <span className="mk-num" style={{ color: "var(--color-outline)" }}>
                    {verifyMatches.length} program{verifyMatches.length === 1 ? "" : "s"}
                  </span>
                </div>
                <h4 style={h4}>We can&apos;t determine these — and neither can any answer you give us</h4>
                <p style={{ ...bodyP, maxWidth: 640 }}>
                  {verifyMatches.length} program{verifyMatches.length === 1 ? " states" : "s state"}{" "}
                  eligibility in prose we can&apos;t parse into a rule. We rank these{" "}
                  <b>verify eligibility</b> rather than guessing, and point you at the paragraph to
                  read.
                </p>
                <div className="mk-stack">
                  {verifyMatches.slice(0, 3).map((m) => {
                    const o = report.opportunities?.[m.opportunityId];
                    return (
                      <div className="or-kv" key={m.opportunityId}>
                        <span className="or-kv__label">{humanize(o?.title ?? m.opportunityId)}</span>
                        <span className="mk-row">
                          <Badge tone="caution">Verify</Badge>
                          {o?.url && (
                            <a href={o.url} target="_blank" rel="noreferrer" className="or-btn or-btn--text or-btn--sm">
                              Read the notice
                            </a>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* blocked outright */}
            {blockedCount > 0 && (
              <div className="or-alert or-alert--danger">
                <Icon name="warning" size={20} color="var(--color-error)" style={{ marginTop: 2 }} />
                <div style={{ flex: 1 }}>
                  <h4 className="or-alert__title">Blocked — {blockedCount} program{blockedCount === 1 ? "" : "s"}</h4>
                  <div className="or-alert__body">
                    Hard-failed screens: {failReasons.join("; ")}. No answer fixes this, so
                    we&apos;ve stopped ranking them.
                  </div>
                </div>
              </div>
            )}

            {/* cleared screens */}
            {cleared.length > 0 && (
              <div className="or-card or-card--sunken">
                <h4 className="mk-h4" style={{ marginBottom: 12 }}>
                  Cleared — {cleared.length} screen{cleared.length === 1 ? "" : "s"}
                </h4>
                <div className="mk-stack">
                  {cleared.map((row) => (
                    <div className="or-kv" key={row.label}>
                      <span className="or-kv__label">{row.label}</span>
                      <span className="mk-row">
                        <Badge tone="fit">Pass</Badge>
                        <Badge tone="neutral">{row.source}</Badge>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {monitoring}
          </div>

          {/* right: ask + deadlines */}
          <div className="mk-c3">
            {topUnlock && (
              <div className="or-card mk-ask">
                <h4
                  style={{
                    margin: "0 0 8px",
                    font: "600 20px/28px var(--font-headline)",
                    color: "var(--color-text-deep)",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <Icon name="key" color="var(--color-primary)" />
                  Unlock Results
                </h4>
                <p style={{ ...bodyP, marginBottom: 16 }}>{questionFor(topUnlock.field)}</p>
                <p style={{ ...bodyP, marginBottom: 24 }}>
                  One answer frees up to <span className="mk-num">{fmtUsd(topUnlock.unlockUsd)}</span>{" "}
                  across {topUnlock.opportunityCount} program
                  {topUnlock.opportunityCount === 1 ? "" : "s"}.
                </p>
                <Link href="/#unlock" className="or-btn or-btn--tonal or-btn--block">
                  Answer on the map
                </Link>
              </div>
            )}

            {deadlineItems.length > 0 && (
              <div className="or-card or-card--flush">
                <div className="mk-cardhead">Deadlines</div>
                <div className="mk-cardbody">
                  <Timeline items={deadlineItems} />
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </main>
  );
}
