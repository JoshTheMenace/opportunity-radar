"use client";

// One opportunity match card in the mock's collapsible or-opp anatomy:
//   toggle head  — tier Badge + ID/agency meta | title | $ + deadline + chev,
//                  short description lede
//   body grid    — "Why it fits" / "What could disqualify" / "What to verify"
//                  auto-fit columns, then the full-width "Who else got this
//                  money" evidence + YOUR FUNDING TWIN block, then the
//                  plan-backward and program-officer collapsibles
//   foot         — odds/next-step line, Save for Later, Start Pre-flight
// Collapse: data-expanded + mk-opp__toggle (CSS hides body/foot/lede). The
// agent's spotlight force-expands the card before firing the attention ring.

import Link from "next/link";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CompanyProfile, EvidenceSummary, Opportunity, RankedMatch } from "@/lib/types";
import { buildTimeline, oddsLabel } from "@/lib/engine/timeline";
import type { OfficerPreview } from "@/lib/engine/officer";
import { Badge, Icon } from "./ui";
import { TIER_META, bullets, daysUntil, dedupeAgency, fmtDate, fmtUsd, humanize, type BulkToggle } from "./shared";

/** Kit-style short ID from our namespaced opportunity ids. */
function shortId(id: string): string {
  const tail = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
  return tail.length > 18 ? `${tail.slice(0, 18)}…` : tail;
}

/** Save for Later: point the founder at the standing-watch card below. */
function goToSaveMonitor() {
  const el = document.getElementById("save-monitor");
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
  el?.querySelector<HTMLInputElement>("input")?.focus({ preventScroll: true });
}

export default function MatchCard({
  match,
  opp,
  evidence,
  profile,
  index = 0,
  spotlight,
  defaultExpanded = false,
  bulk,
}: {
  match: RankedMatch;
  opp?: Opportunity;
  evidence?: EvidenceSummary;
  profile?: CompanyProfile;
  /** Position in the list — staggers the materialize-in animation. */
  index?: number;
  /** Spotlight nonce: set (and changed) each time the agent points here. */
  spotlight?: number;
  /** Only the top-scored visible card opens on first paint. */
  defaultExpanded?: boolean;
  /** Pagehead collapse/expand-all broadcast. */
  bulk?: BulkToggle | null;
}) {
  const close = daysUntil(opp?.closeDate ?? null);
  const odds = opp ? oddsLabel(opp.expectedAwards, opp.expectedApplications) : null;
  const meta = TIER_META[match.tier];
  const actionable = match.tier === "likely_fit" || match.tier === "verify_eligibility";
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showPlan, setShowPlan] = useState(false);
  const [officer, setOfficer] = useState<OfficerPreview | null>(null);
  const [officerBusy, setOfficerBusy] = useState(false);
  const [officerErr, setOfficerErr] = useState<string | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);
  const pendingSpot = useRef<number | null>(null);
  const bodyId = `opp-body-${match.opportunityId}`;

  // Pagehead broadcast wins over the per-card default (cards streaming in
  // while "collapse all" is active arrive collapsed too).
  useEffect(() => {
    if (bulk) setExpanded(bulk.mode === "expand");
  }, [bulk]);

  // The agent pointed here: force-expand first, then (once the body is in the
  // DOM) scroll into view and (re)fire the attention ring. Class juggling
  // instead of state so the same card can be pointed at twice; the class is
  // cleared when the agent points somewhere else.
  useEffect(() => {
    cardRef.current?.classList.remove("card-spotlight");
    if (!spotlight) return;
    pendingSpot.current = spotlight;
    setExpanded(true);
  }, [spotlight]);
  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el || pendingSpot.current == null || !expanded) return;
    pendingSpot.current = null;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    void el.offsetWidth; // reflow restarts the animation
    el.classList.add("card-spotlight");
  }, [expanded, spotlight]);

  /** Fetch the officer preview once; cached in state so re-clicks are free. */
  async function loadOfficer() {
    if (officer || officerBusy || !profile) return;
    setOfficerBusy(true);
    setOfficerErr(null);
    try {
      const res = await fetch("/api/officer-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profile, opportunityId: match.opportunityId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setOfficer((await res.json()) as OfficerPreview);
    } catch (e) {
      setOfficerErr(e instanceof Error ? e.message : String(e));
    } finally {
      setOfficerBusy(false);
    }
  }

  // Real award band only: ceiling as-is, floor-only as "from".
  const money =
    opp?.awardCeilingUsd != null
      ? fmtUsd(opp.awardCeilingUsd)
      : opp?.awardFloorUsd != null
        ? `from ${fmtUsd(opp.awardFloorUsd)}`
        : null;
  const twin = evidence?.similarAwards?.[0];

  return (
    <article
      ref={cardRef}
      className="card-in or-opp"
      data-expanded={expanded}
      style={{ animationDelay: `${Math.min(index * 70, 490)}ms` }}
    >
      <button
        type="button"
        className="mk-opp__toggle"
        aria-expanded={expanded}
        aria-controls={bodyId}
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="or-opp__head">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 4, flexWrap: "wrap" }}>
                <Badge tone={meta.tone} icon={meta.icon}>
                  {meta.label}
                </Badge>
                <span className="or-opp__meta">
                  ID: {shortId(match.opportunityId)}
                  {opp ? ` · ${humanize(dedupeAgency(opp.agency))}` : ""}
                </span>
              </div>
              <h4 className="or-opp__title">{opp ? humanize(opp.title) : match.opportunityId}</h4>
            </div>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
              <div style={{ textAlign: "right" }}>
                {money && <span className="or-opp__amount">{money}</span>}
                <span
                  className="or-opp__meta"
                  style={
                    close != null && close <= 30
                      ? { color: "var(--color-error)", fontWeight: 700 }
                      : undefined
                  }
                >
                  Deadline: {opp?.closeDate ? fmtDate(opp.closeDate) : "Rolling"}
                </span>
              </div>
              <Icon name="expand_more" className="mk-opp__chev" aria-hidden />
            </div>
          </div>
          {opp?.description && <p className="or-opp__lede line-clamp-2">{opp.description}</p>}
        </div>
      </button>

      {/* body: why / disqualify / verify columns (auto-fit → 3, 2, then 1) */}
      <div
        className="or-opp__body"
        id={bodyId}
        style={{ gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}
      >
        <div>
          <h5 className="or-opp__h5">
            <Icon name="done_all" size={18} color="var(--color-primary)" aria-hidden />
            Why it fits
          </h5>
          <ul className="or-opp__list">
            {bullets(match.whyFit).map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
        <div>
          <h5 className="or-opp__h5" style={{ color: "var(--color-error)" }}>
            <Icon name="warning" size={18} aria-hidden />
            What could disqualify
          </h5>
          <ul className="or-opp__list">
            {bullets(match.whatCouldDisqualify).map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
        <div>
          <h5 className="or-opp__h5" style={{ color: "var(--color-caution-text)" }}>
            <Icon name="fact_check" size={18} aria-hidden />
            What to verify
          </h5>
          <ul className="or-opp__list">
            {bullets(match.whatToVerify).map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>

        {/* who wins this money + funding twin */}
        {evidence && (twin || (evidence.totalAwards != null && evidence.totalAwards > 0)) && (
          <div style={{ gridColumn: "1 / -1", paddingTop: 12, borderTop: "1px solid var(--color-border-ice)" }}>
            <h5 className="or-opp__h5">
              <Icon name="group" size={18} color="var(--color-outline)" aria-hidden />
              Who else got this money
            </h5>
            <EvidenceStats evidence={evidence} />
            {twin && (
              <div className="or-opp__twin" style={{ marginTop: 10 }}>
                <span
                  style={{
                    background: "rgba(126,212,253,.2)",
                    padding: 8,
                    borderRadius: 9999,
                    marginTop: 4,
                    display: "inline-flex",
                  }}
                  aria-hidden
                >
                  <Icon name="handshake" size={20} color="var(--color-secondary)" />
                </span>
                <div>
                  <span
                    style={{
                      font: "500 12px/14px var(--font-label)",
                      letterSpacing: ".05em",
                      color: "var(--color-secondary)",
                      textTransform: "uppercase",
                      display: "block",
                      marginBottom: 4,
                    }}
                  >
                    Your Funding Twin
                  </span>
                  <h6 style={{ margin: 0, font: "500 16px/24px var(--font-body)", color: "var(--color-text-deep)" }}>
                    {humanize(twin.recipient)}
                    {twin.state ? ` (${twin.state})` : ""}
                  </h6>
                  <p style={{ margin: "4px 0 0", font: "400 14px/20px var(--font-body)", color: "var(--color-on-surface-variant)" }}>
                    Received {fmtUsd(twin.amountUsd)}
                    {twin.year ? ` in ${twin.year}` : ""} from this program.{" "}
                    {twin.link && (
                      <a
                        href={twin.link}
                        target="_blank"
                        rel="noreferrer"
                        className="font-medium text-brand underline decoration-brand/30 underline-offset-2 hover:decoration-brand"
                      >
                        award record ↗
                      </a>
                    )}
                  </p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* collapsibles: plan-backward timeline + program-officer preview */}
        {actionable && opp && profile && (
          <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <button type="button" className="or-btn or-btn--text" onClick={() => setShowPlan((v) => !v)}>
                <Icon name={showPlan ? "expand_more" : "chevron_right"} size={16} aria-hidden />
                Plan backward from the deadline
              </button>
              {!officer && (
                <button
                  type="button"
                  className="or-btn or-btn--text"
                  disabled={officerBusy}
                  onClick={() => void loadOfficer()}
                >
                  <Icon name="badge" size={16} aria-hidden />
                  {officerBusy ? "Reviewing…" : "Officer preview"}
                </button>
              )}
            </div>
            {showPlan && (
              <ol className="space-y-2 border-l-2 border-surface pl-4">
                {buildTimeline(opp, profile).map((s) => (
                  <li key={s.title} className="text-[13px]">
                    <span className={`font-medium ${s.urgent ? "text-risk" : "text-ink"}`}>
                      {s.due ?? "rolling"} · {s.title}
                    </span>
                    <span className="text-muted"> — {s.detail}</span>
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
        {officer && (
          <div style={{ gridColumn: "1 / -1" }}>
            <OfficerPanel preview={officer} />
          </div>
        )}
        {officerErr && (
          <p className="text-[12px] text-faint" style={{ gridColumn: "1 / -1" }}>
            Officer preview unavailable ({officerErr})
          </p>
        )}
      </div>

      {/* footer / actions */}
      <div className="or-opp__foot" style={{ flexWrap: "wrap" }}>
        <span
          className="or-opp__meta line-clamp-2"
          style={{ color: "var(--color-on-surface-variant)", marginLeft: 8, maxWidth: "40%", whiteSpace: "normal" }}
        >
          {odds ?? bullets(match.nextSteps, 1)[0] ?? ""}
        </span>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          {opp?.url && (
            <a className="or-btn or-btn--text" href={opp.url} target="_blank" rel="noreferrer">
              Official notice
              <Icon name="open_in_new" size={16} aria-hidden />
            </a>
          )}
          <button type="button" className="or-btn or-btn--outline" onClick={goToSaveMonitor}>
            Save for Later
          </button>
          <Link className="or-btn or-btn--filled" href={`/opportunity/${encodeURIComponent(match.opportunityId)}`}>
            Start Pre-flight
            <Icon name="arrow_forward" size={18} aria-hidden />
          </Link>
        </div>
      </div>
    </article>
  );
}

/** Compact awards-history stat line. "0 awards" is absence of signal — omitted. */
function EvidenceStats({ evidence }: { evidence: EvidenceSummary }) {
  const stats: string[] = [];
  if (evidence.totalAwards != null && evidence.totalAwards > 0)
    stats.push(`${evidence.totalAwards} awards`);
  if (evidence.medianUsd != null) stats.push(`${fmtUsd(evidence.medianUsd)} median`);
  if (evidence.utahCount != null && evidence.utahCount > 0)
    stats.push(`${evidence.utahCount} in Utah`);
  if (stats.length === 0) return null;
  return <p className="tnum text-[13px] text-muted">{stats.join(" · ")}</p>;
}

/** Inline result of the "how would a program officer read this?" simulation. */
function OfficerPanel({ preview }: { preview: OfficerPreview }) {
  const b = preview.breakdown;
  return (
    <div className="or-card or-card--sunken space-y-2.5">
      <p className="mk-label" style={{ textTransform: "uppercase" }}>
        Program officer preview
      </p>
      <p className="text-sm font-semibold text-ink">
        <span className="font-mono">{preview.score}</span>{" "}
        <Badge tone="outline" className="ml-1">
          {preview.tier}
        </Badge>
      </p>
      <p className="tnum text-[12.5px] text-faint">
        merit {b.technical_merit} · mission {b.mission_alignment} · stage {b.stage_readiness} ·
        budget {b.budget_realism}
      </p>
      <dl className="space-y-1.5 text-[13.5px]">
        <OfficerList
          label="Strengths"
          tone="text-good"
          items={preview.strengths.map((s) => [s.headline, s.detail])}
        />
        <OfficerList
          label="Concerns"
          tone="text-risk"
          items={preview.concerns.map((c) => [c.headline, c.detail])}
        />
        <OfficerList
          label="What to improve"
          tone="text-warn"
          items={preview.whatToImprove.map((w) => [w.action, w.detail])}
        />
      </dl>
      <p className="border-l-2 border-line pl-3 text-[13.5px] italic leading-relaxed text-muted">
        {preview.officerNote}
      </p>
      <p className="tnum text-[12.5px] text-faint">
        confidence {preview.confidence}% — {preview.confidenceNote}
      </p>
    </div>
  );
}

/** Short [headline, detail] list under a toned label. */
function OfficerList({
  label,
  tone,
  items,
}: {
  label: string;
  tone: string;
  items: [string, string][];
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <dt className={`text-[11px] font-semibold uppercase tracking-[0.07em] ${tone}`}>
        {label}
      </dt>
      {items.map(([head, detail], i) => (
        <dd key={i} className="text-ink/90">
          <span className="font-medium">{head}</span>{" "}
          <span className="text-muted">— {detail}</span>
        </dd>
      ))}
    </div>
  );
}
