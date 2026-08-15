"use client";

// One opportunity match card: rank + title row, mono agency line, score tile,
// facts row, evidence strip, why-fit/disqualify/verify/next-steps,
// plan-backward timeline, program officer preview, and the outbound link.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CompanyProfile, EvidenceSummary, FitTier, Opportunity, RankedMatch } from "@/lib/types";
import { buildTimeline, oddsLabel } from "@/lib/engine/timeline";
import type { OfficerPreview } from "@/lib/engine/officer";
import { daysUntil, fmtUsd } from "./shared";

/** Score-tile tints: good for strong fit, warn for verify tier, brand otherwise. */
const SCORE_TILE: Record<FitTier, { box: string; fill: string }> = {
  likely_fit: { box: "bg-good-soft text-good", fill: "bg-good" },
  verify_eligibility: { box: "bg-warn-soft text-warn", fill: "bg-warn" },
  adjacent: { box: "bg-soft text-brand", fill: "bg-brand" },
  not_a_fit: { box: "bg-soft text-faint", fill: "bg-faint" },
};

export default function MatchCard({
  match,
  opp,
  evidence,
  profile,
  index = 0,
  spotlight,
}: {
  match: RankedMatch;
  opp?: Opportunity;
  evidence?: EvidenceSummary;
  profile?: CompanyProfile;
  /** Position in its tier group — staggers the materialize-in animation. */
  index?: number;
  /** Spotlight nonce: set (and changed) each time the agent points here. */
  spotlight?: number;
}) {
  const close = daysUntil(opp?.closeDate ?? null);
  const odds = opp ? oddsLabel(opp.expectedAwards, opp.expectedApplications) : null;
  // Timeline + officer preview only earn space on tiers worth pursuing.
  const actionable = match.tier === "likely_fit" || match.tier === "verify_eligibility";
  const [showPlan, setShowPlan] = useState(false);
  const [officer, setOfficer] = useState<OfficerPreview | null>(null);
  const [officerBusy, setOfficerBusy] = useState(false);
  const [officerErr, setOfficerErr] = useState<string | null>(null);
  const cardRef = useRef<HTMLElement | null>(null);

  // The agent pointed here: scroll into view and (re)fire the attention ring.
  // Class juggling instead of state so the same card can be pointed at twice;
  // the class is cleared when the agent points somewhere else.
  useEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    el.classList.remove("card-spotlight");
    if (!spotlight) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    void el.offsetWidth; // reflow restarts the animation
    el.classList.add("card-spotlight");
  }, [spotlight]);

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

  const tile = SCORE_TILE[match.tier] ?? SCORE_TILE.adjacent;

  return (
    <article
      ref={cardRef}
      className="card-in space-y-3 rounded-2xl border border-hairline bg-card p-5 shadow-card"
      style={{ animationDelay: `${Math.min(index * 70, 490)}ms` }}
    >
      {/* header: rank · title/agency · score tile */}
      <div className="flex items-start gap-3.5">
        <span className="pt-0.5 font-mono text-xs text-faint">
          {String(index + 1).padStart(2, "0")}
        </span>
        <div className="min-w-0">
          <h3 className="text-[17px] font-bold tracking-tight text-ink">
            <Link
              href={`/opportunity/${encodeURIComponent(match.opportunityId)}`}
              className="transition-colors hover:text-brand"
            >
              {opp?.title ?? match.opportunityId}
            </Link>
          </h3>
          <p className="mt-1 font-mono text-[11.5px] uppercase tracking-[0.02em] text-muted">
            {opp ? (
              <>
                {dedupeAgency(opp.agency)} · {opp.kind.replace(/_/g, "/")}
              </>
            ) : (
              "details unavailable"
            )}
          </p>
        </div>
        <div className="ml-auto flex-none text-center">
          <div
            className={`grid h-14 w-14 place-items-center rounded-[14px] font-mono text-lg font-semibold ${tile.box}`}
          >
            {match.score}
          </div>
          <div className="mt-1.5 h-[3px] w-14 overflow-hidden rounded-[2px] bg-hairline">
            <div
              className={`h-full rounded-[2px] ${tile.fill}`}
              style={{ width: `${Math.min(100, Math.max(0, match.score))}%` }}
            />
          </div>
        </div>
      </div>

      {/* facts row */}
      <div className="flex flex-wrap items-center gap-x-7 gap-y-2 border-t border-hairline pt-3.5">
        <Fact
          value={
            opp?.awardFloorUsd != null && opp?.awardCeilingUsd != null
              ? `${fmtUsd(opp.awardFloorUsd)}–${fmtUsd(opp.awardCeilingUsd)}`
              : opp?.awardCeilingUsd != null
                ? `up to ${fmtUsd(opp.awardCeilingUsd)}`
                : "—"
          }
          label="Max award"
        />
        <Fact value={opp?.closeDate ?? "rolling"} label="Deadline" />
        {close != null && close >= 0 && close <= 30 && (
          <span className="rounded-full bg-risk-soft px-2.5 py-1 font-mono text-[11px] font-bold text-risk">
            IN {close}D
          </span>
        )}
        {odds && <span className="ml-auto font-mono text-[11px] text-faint">{odds}</span>}
      </div>

      <p className="text-[13.5px] text-muted">{match.whyFit}</p>
      {evidence && <EvidenceStrip evidence={evidence} />}
      <dl className="space-y-1.5 text-sm">
        <CardRow label="Could disqualify" text={match.whatCouldDisqualify} tone="text-risk" />
        <CardRow label="Verify" text={match.whatToVerify} tone="text-warn" />
        <CardRow label="Next steps" text={match.nextSteps} tone="text-faint" />
      </dl>
      {actionable && opp && profile && (
        <div>
          <button
            type="button"
            onClick={() => setShowPlan((v) => !v)}
            className="font-mono text-xs font-semibold text-brand transition-colors hover:text-brand-strong"
          >
            {showPlan ? "▾" : "▸"} Plan backward
          </button>
          {showPlan && (
            <ol className="mt-1.5 space-y-1.5 border-l border-hairline pl-3">
              {buildTimeline(opp, profile).map((s) => (
                <li key={s.title} className="text-xs">
                  <span
                    className={`font-mono font-semibold ${s.urgent ? "text-risk" : "text-ink"}`}
                  >
                    {s.due ?? "rolling"} · {s.title}
                  </span>
                  <span className="text-muted"> — {s.detail}</span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
      {officer && <OfficerPanel preview={officer} />}
      {officerErr && (
        <p className="text-xs text-faint">Officer preview unavailable ({officerErr})</p>
      )}
      <div className="flex flex-wrap items-center gap-2.5 pt-1">
        {actionable ? (
          <Link
            href={`/opportunity/${encodeURIComponent(match.opportunityId)}`}
            className="rounded-xl bg-brand px-4 py-2 font-mono text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-strong"
          >
            Pursue this →
          </Link>
        ) : (
          <Link
            href={`/opportunity/${encodeURIComponent(match.opportunityId)}`}
            className="rounded-xl border border-hairline bg-card px-4 py-2 font-mono text-[12.5px] font-semibold text-brand transition-colors hover:bg-soft"
          >
            Full details
          </Link>
        )}
        {actionable && profile && !officer && (
          <button
            type="button"
            onClick={() => void loadOfficer()}
            disabled={officerBusy}
            className="rounded-xl border border-hairline bg-card px-4 py-2 font-mono text-[12.5px] font-semibold text-brand transition-colors hover:bg-soft disabled:opacity-50"
          >
            {officerBusy ? "Reviewing…" : "Program officer preview"}
          </button>
        )}
        {opp?.url && (
          <a
            href={opp.url}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-xs text-muted underline transition-colors hover:text-brand"
          >
            Official notice ↗
          </a>
        )}
      </div>
    </article>
  );
}

/** One facts-row entry: big value over a tiny mono caps label. */
function Fact({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="text-[15.5px] font-bold tracking-tight text-ink">{value}</p>
      <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-faint">{label}</p>
    </div>
  );
}

/** Source rows sometimes repeat the agency ("SBA, SBA") — keep unique segments. */
function dedupeAgency(agency: string): string {
  const seen = new Set<string>();
  return agency
    .split(",")
    .map((s) => s.trim())
    .filter((s) => {
      const k = s.toLowerCase();
      if (!s || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .join(", ");
}

/** Compact "who wins this money" strip built from historical-award evidence. */
function EvidenceStrip({ evidence }: { evidence: EvidenceSummary }) {
  const stats: string[] = [];
  // "0 awards" is an absence of signal, not evidence — say nothing instead.
  if (evidence.totalAwards != null && evidence.totalAwards > 0)
    stats.push(`${evidence.totalAwards} awards`);
  if (evidence.medianUsd != null) stats.push(`${fmtUsd(evidence.medianUsd)} median`);
  if (evidence.utahCount != null && evidence.utahCount > 0)
    stats.push(`${evidence.utahCount} in Utah`);
  const similar = evidence.similarAwards.slice(0, 3);
  if (stats.length === 0 && similar.length === 0) return null;

  return (
    <div className="space-y-1 rounded-xl border border-hairline bg-[#FBFCFE] p-3">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-faint">
        WHO WINS THIS MONEY
      </p>
      {stats.length > 0 && <p className="font-mono text-xs text-ink">{stats.join(" · ")}</p>}
      {similar.length > 0 && (
        <p className="text-xs text-muted">
          {similar.map((a, i) => {
            const label = `${a.recipient} · ${fmtUsd(a.amountUsd)}${a.year ? ` · ${a.year}` : ""}`;
            return (
              <span key={i}>
                {i > 0 && " · "}
                {a.link ? (
                  <a
                    href={a.link}
                    target="_blank"
                    rel="noreferrer"
                    className="underline transition-colors hover:text-brand"
                  >
                    {label}
                  </a>
                ) : (
                  label
                )}
              </span>
            );
          })}
        </p>
      )}
    </div>
  );
}

/** Inline result of the "how would a program officer read this?" simulation —
 *  styled as the memo it is. */
function OfficerPanel({ preview }: { preview: OfficerPreview }) {
  const b = preview.breakdown;
  return (
    <div className="space-y-2 rounded-xl border border-hairline bg-[#FBFCFE] p-3.5">
      <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.09em] text-faint">
        PROGRAM OFFICER PREVIEW
      </p>
      <p className="text-sm font-semibold text-ink">
        <span className="font-mono">{preview.score}</span>{" "}
        <span className="ml-1 rounded-full bg-soft px-2.5 py-0.5 font-mono text-[11px] font-normal text-brand">
          {preview.tier}
        </span>
      </p>
      <p className="font-mono text-xs text-faint">
        merit {b.technical_merit} · mission {b.mission_alignment} · stage {b.stage_readiness} ·
        budget {b.budget_realism}
      </p>
      <dl className="space-y-1.5 text-sm">
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
          tone="text-brand"
          items={preview.whatToImprove.map((w) => [w.action, w.detail])}
        />
      </dl>
      <p className="border-l-2 border-soft pl-3 text-[13.5px] italic leading-relaxed text-muted">
        {preview.officerNote}
      </p>
      <p className="font-mono text-xs text-faint">
        confidence {preview.confidence}% — {preview.confidenceNote}
      </p>
    </div>
  );
}

/** CardRow's visual pattern, but the body is a short [headline, detail] list. */
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
      <dt className={`font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${tone}`}>
        {label}
      </dt>
      {items.map(([head, detail], i) => (
        <dd key={i} className="text-[13.5px] text-ink">
          <span className="font-medium">{head}</span>{" "}
          <span className="text-muted">— {detail}</span>
        </dd>
      ))}
    </div>
  );
}

function CardRow({ label, text, tone }: { label: string; text: string; tone: string }) {
  return (
    <div>
      <dt className={`font-mono text-[10px] font-semibold uppercase tracking-[0.08em] ${tone}`}>
        {label}
      </dt>
      <dd className="text-[13.5px] text-ink">{text}</dd>
    </div>
  );
}
