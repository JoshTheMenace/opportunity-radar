"use client";

// One opportunity match card: tier rail, title row, mono meta row, odds,
// evidence strip, why-fit/disqualify/verify/next-steps, plan-backward
// timeline, program officer preview, and the outbound link.

import Link from "next/link";
import { useState } from "react";
import type { CompanyProfile, EvidenceSummary, Opportunity, RankedMatch } from "@/lib/types";
import { buildTimeline, oddsLabel } from "@/lib/engine/timeline";
import type { OfficerPreview } from "@/lib/engine/officer";
import { daysUntil, fmtUsd, tierRail } from "./shared";

export default function MatchCard({
  match,
  opp,
  evidence,
  profile,
}: {
  match: RankedMatch;
  opp?: Opportunity;
  evidence?: EvidenceSummary;
  profile?: CompanyProfile;
}) {
  const close = daysUntil(opp?.closeDate ?? null);
  const odds = opp ? oddsLabel(opp.expectedAwards, opp.expectedApplications) : null;
  // Timeline + officer preview only earn space on tiers worth pursuing.
  const actionable = match.tier === "likely_fit" || match.tier === "verify_eligibility";
  const [showPlan, setShowPlan] = useState(false);
  const [officer, setOfficer] = useState<OfficerPreview | null>(null);
  const [officerBusy, setOfficerBusy] = useState(false);
  const [officerErr, setOfficerErr] = useState<string | null>(null);

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

  return (
    <article
      className={`space-y-2.5 rounded-lg border border-hairline border-l-2 bg-panel p-4 ${tierRail(match.tier)}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-paper">
          <Link
            href={`/opportunity/${encodeURIComponent(match.opportunityId)}`}
            className="transition-colors hover:text-brass-bright hover:underline"
          >
            {opp?.title ?? match.opportunityId}
          </Link>
        </h3>
        <span className="font-mono text-xs text-faint">score {match.score}</span>
      </div>
      <p className="font-mono text-xs text-muted">
        {opp ? (
          <>
            {dedupeAgency(opp.agency)} · {opp.kind.replace(/_/g, "/")} ·{" "}
            {opp.awardFloorUsd != null && opp.awardCeilingUsd != null
              ? `${fmtUsd(opp.awardFloorUsd)}–${fmtUsd(opp.awardCeilingUsd)}`
              : opp.awardCeilingUsd != null
                ? `up to ${fmtUsd(opp.awardCeilingUsd)}`
                : "award size unlisted"}
            {opp.closeDate && (
              <span className={close != null && close <= 30 ? " text-signal" : ""}>
                {" "}· closes {opp.closeDate}
                {close != null && close >= 0 ? ` (${close}d)` : ""}
              </span>
            )}
          </>
        ) : (
          "details unavailable"
        )}
      </p>
      {odds && <p className="font-mono text-xs text-faint">{odds}</p>}
      {evidence && <EvidenceStrip evidence={evidence} />}
      <dl className="space-y-1.5 text-sm">
        <CardRow label="Why it fits" text={match.whyFit} tone="text-treasury" />
        <CardRow label="Could disqualify" text={match.whatCouldDisqualify} tone="text-signal" />
        <CardRow label="Verify" text={match.whatToVerify} tone="text-brass" />
        <CardRow label="Next steps" text={match.nextSteps} tone="text-paper/70" />
      </dl>
      {actionable && opp && profile && (
        <div>
          <button
            type="button"
            onClick={() => setShowPlan((v) => !v)}
            className="font-mono text-xs font-semibold text-muted transition-colors hover:text-paper"
          >
            {showPlan ? "▾" : "▸"} Plan backward
          </button>
          {showPlan && (
            <ol className="mt-1.5 space-y-1.5 border-l border-hairline pl-3">
              {buildTimeline(opp, profile).map((s) => (
                <li key={s.title} className="text-xs">
                  <span
                    className={`font-mono font-semibold ${s.urgent ? "text-signal" : "text-paper/85"}`}
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
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Link
          href={`/opportunity/${encodeURIComponent(match.opportunityId)}`}
          className="rounded-md border border-brass/50 px-3 py-1 text-xs font-semibold text-brass transition-colors hover:bg-brass/10"
        >
          Details &amp; submission plan →
        </Link>
        {actionable && profile && !officer && (
          <button
            type="button"
            onClick={() => void loadOfficer()}
            disabled={officerBusy}
            className="rounded-md border border-hairline px-3 py-1 text-xs font-semibold text-muted transition-colors hover:bg-panel-2 hover:text-paper disabled:opacity-50"
          >
            {officerBusy ? "Reviewing…" : "Program officer preview"}
          </button>
        )}
        {opp?.url && (
          <a
            href={opp.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-muted underline transition-colors hover:text-paper"
          >
            Official notice ↗
          </a>
        )}
      </div>
    </article>
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
    <div className="space-y-1 rounded-md border border-hairline bg-ink p-2.5">
      <p className="font-mono text-[10px] font-medium tracking-[0.18em] text-faint">
        WHO WINS THIS MONEY
      </p>
      {stats.length > 0 && (
        <p className="font-mono text-xs text-paper/85">{stats.join(" · ")}</p>
      )}
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
                    className="underline transition-colors hover:text-paper"
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
    <div className="space-y-2 rounded-md border border-hairline bg-ink p-3">
      <p className="font-mono text-[10px] font-medium tracking-[0.18em] text-faint">
        PROGRAM OFFICER PREVIEW
      </p>
      <p className="text-sm font-semibold text-paper">
        <span className="font-mono">{preview.score}</span>{" "}
        <span className="ml-1 rounded-full border border-hairline px-2 py-0.5 text-xs font-normal text-muted">
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
          tone="text-treasury"
          items={preview.strengths.map((s) => [s.headline, s.detail])}
        />
        <OfficerList
          label="Concerns"
          tone="text-signal"
          items={preview.concerns.map((c) => [c.headline, c.detail])}
        />
        <OfficerList
          label="What to improve"
          tone="text-brass"
          items={preview.whatToImprove.map((w) => [w.action, w.detail])}
        />
      </dl>
      <p className="border-l-2 border-hairline pl-3 font-display text-sm italic leading-relaxed text-paper/80">
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
      <dt className={`text-xs font-semibold uppercase tracking-wide ${tone}`}>{label}</dt>
      {items.map(([head, detail], i) => (
        <dd key={i} className="text-paper/85">
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
      <dt className={`text-xs font-semibold uppercase tracking-wide ${tone}`}>{label}</dt>
      <dd className="text-paper/85">{text}</dd>
    </div>
  );
}
