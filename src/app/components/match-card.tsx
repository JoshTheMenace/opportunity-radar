"use client";

// One opportunity match card in the Federal Catalyst anatomy:
//   header band   — tier chip + ID | title | $ + deadline, short description
//   body grid     — "Why it fits" / "What could disqualify" bullet columns
//   evidence      — "Who else got this money" stats + FUNDING TWIN block
//   footer        — odds/next-step line + Start Pre-flight CTA
// Collapsibles (plan-backward timeline, program officer preview) and the
// agent's spotlight/materialize behaviors are preserved.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { CompanyProfile, EvidenceSummary, Opportunity, RankedMatch } from "@/lib/types";
import { buildTimeline, oddsLabel } from "@/lib/engine/timeline";
import type { OfficerPreview } from "@/lib/engine/officer";
import { TIERS, daysUntil, fmtUsd } from "./shared";

/** Prose → short bullet list (the rank LLM writes sentences; the kit shows bullets). */
function bullets(s: string, max = 4): string[] {
  return s
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, max);
}

/** Kit-style short ID from our namespaced opportunity ids. */
function shortId(id: string): string {
  const tail = id.includes(":") ? id.slice(id.indexOf(":") + 1) : id;
  return tail.length > 18 ? `${tail.slice(0, 18)}…` : tail;
}

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
  /** Position in the list — staggers the materialize-in animation. */
  index?: number;
  /** Spotlight nonce: set (and changed) each time the agent points here. */
  spotlight?: number;
}) {
  const close = daysUntil(opp?.closeDate ?? null);
  const odds = opp ? oddsLabel(opp.expectedAwards, opp.expectedApplications) : null;
  const tier = TIERS.find((t) => t.tier === match.tier);
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

  const money =
    opp?.awardCeilingUsd != null
      ? `up to ${fmtUsd(opp.awardCeilingUsd)}`
      : opp?.awardFloorUsd != null
        ? `from ${fmtUsd(opp.awardFloorUsd)}`
        : null;
  const twin = evidence?.similarAwards?.[0];

  return (
    <article
      ref={cardRef}
      className={`card-in overflow-hidden rounded-xl border bg-card shadow-sm ${
        match.tier === "likely_fit" ? "border-accent/40" : "border-hairline"
      }`}
      style={{ animationDelay: `${Math.min(index * 70, 490)}ms` }}
    >
      {/* header band */}
      <div
        className={`border-b border-hairline p-5 ${
          match.tier === "likely_fit" ? "bg-soft/60" : "bg-card"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span
                className={`rounded px-2 py-0.5 font-mono text-[11px] font-medium ${tier?.badge ?? ""}`}
              >
                {match.tier === "likely_fit" ? "✓ " : ""}
                {tier?.label ?? match.tier}
              </span>
              <span className="font-mono text-[11px] text-faint">
                ID: {shortId(match.opportunityId)} · score {match.score}
              </span>
            </div>
            <h4 className="font-display text-[19px] font-semibold leading-6 text-ink">
              <Link
                href={`/opportunity/${encodeURIComponent(match.opportunityId)}`}
                className="transition-colors hover:text-brand"
              >
                {opp?.title ?? match.opportunityId}
              </Link>
            </h4>
            <p className="mt-0.5 font-mono text-[11.5px] text-faint">
              {opp ? dedupeAgency(opp.agency) : "details unavailable"}
            </p>
          </div>
          <div className="text-right">
            {money && (
              <span className="block font-display text-[19px] font-semibold leading-6 text-brand">
                {money}
              </span>
            )}
            {opp?.closeDate ? (
              <span
                className={`font-mono text-[11.5px] ${
                  close != null && close <= 30 ? "font-medium text-risk" : "text-faint"
                }`}
              >
                Deadline: {opp.closeDate}
                {close != null && close >= 0 ? ` (${close}d)` : ""}
              </span>
            ) : (
              <span className="font-mono text-[11.5px] text-faint">rolling deadline</span>
            )}
          </div>
        </div>
        {opp?.description && (
          <p className="mt-2 line-clamp-2 text-[13.5px] leading-relaxed text-muted">
            {opp.description}
          </p>
        )}
      </div>

      {/* body: why / disqualify columns */}
      <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-2">
        <div>
          <h5 className="mb-1.5 font-mono text-[12px] font-medium tracking-[0.05em] text-ink">
            <span className="mr-1 text-good">✓✓</span> Why it fits
          </h5>
          <ul className="list-inside list-disc space-y-1 text-[13.5px] leading-relaxed text-muted">
            {bullets(match.whyFit).map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
        <div>
          <h5 className="mb-1.5 font-mono text-[12px] font-medium tracking-[0.05em] text-risk">
            <span className="mr-1">⚠</span> What could disqualify
          </h5>
          <ul className="list-inside list-disc space-y-1 text-[13.5px] leading-relaxed text-muted">
            {bullets(match.whatCouldDisqualify).map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          <p className="mt-2 text-[12.5px] leading-relaxed text-faint">
            <span className="font-mono font-medium text-warn">Verify:</span> {match.whatToVerify}
          </p>
        </div>

        {/* who wins this money + funding twin */}
        {evidence && (twin || (evidence.totalAwards != null && evidence.totalAwards > 0)) && (
          <div className="border-t border-hairline pt-4 md:col-span-2">
            <h5 className="mb-2 font-mono text-[12px] font-medium tracking-[0.05em] text-ink">
              Who else got this money
            </h5>
            <EvidenceStats evidence={evidence} />
            {twin && (
              <div className="mt-2 flex items-start gap-3 rounded-lg border border-twin-soft bg-bg p-3">
                <div className="mt-0.5 rounded-full bg-twin-soft/50 px-2 py-1 font-mono text-[13px] text-twin">
                  ⇄
                </div>
                <div className="min-w-0">
                  <span className="block font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-twin">
                    Your funding twin
                  </span>
                  <p className="mt-0.5 text-[13.5px] font-medium text-ink">{twin.recipient}</p>
                  <p className="text-[13px] text-muted">
                    Received {fmtUsd(twin.amountUsd)}
                    {twin.year ? ` in ${twin.year}` : ""} from this program
                    {twin.state ? ` (${twin.state})` : ""}.{" "}
                    {twin.link && (
                      <a
                        href={twin.link}
                        target="_blank"
                        rel="noreferrer"
                        className="font-mono text-[12px] text-brand underline-offset-2 hover:underline"
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

        {/* collapsibles: timeline + officer preview */}
        {actionable && opp && profile && (
          <div className="md:col-span-2">
            <button
              type="button"
              onClick={() => setShowPlan((v) => !v)}
              className="font-mono text-[12px] font-medium text-muted transition-colors hover:text-ink"
            >
              {showPlan ? "▾" : "▸"} Plan backward from the deadline
            </button>
            {showPlan && (
              <ol className="mt-2 space-y-1.5 border-l-2 border-surface-variant pl-4">
                {buildTimeline(opp, profile).map((s) => (
                  <li key={s.title} className="text-[13px]">
                    <span
                      className={`font-mono font-medium ${s.urgent ? "text-risk" : "text-ink"}`}
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
        {officer && (
          <div className="md:col-span-2">
            <OfficerPanel preview={officer} />
          </div>
        )}
        {officerErr && (
          <p className="text-[12px] text-faint md:col-span-2">
            Officer preview unavailable ({officerErr})
          </p>
        )}
      </div>

      {/* footer / actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline bg-card px-5 py-3">
        <span className="font-mono text-[11.5px] text-faint">
          {odds ?? bullets(match.nextSteps, 1)[0] ?? ""}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {opp?.url && (
            <a
              href={opp.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-line px-3.5 py-2 font-mono text-[12.5px] font-medium text-muted transition-colors hover:bg-surface-low"
            >
              Official notice ↗
            </a>
          )}
          {actionable && profile && !officer && (
            <button
              type="button"
              onClick={() => void loadOfficer()}
              disabled={officerBusy}
              className="rounded-lg border border-line px-3.5 py-2 font-mono text-[12.5px] font-medium text-muted transition-colors hover:bg-surface-low disabled:opacity-50"
            >
              {officerBusy ? "Reviewing…" : "Officer preview"}
            </button>
          )}
          <Link
            href={`/opportunity/${encodeURIComponent(match.opportunityId)}`}
            className="rounded-lg bg-brand px-3.5 py-2 font-mono text-[12.5px] font-medium text-white shadow-sm transition-colors hover:bg-brand-strong"
          >
            Start Pre-flight →
          </Link>
        </div>
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

/** Compact awards-history stat line. "0 awards" is absence of signal — omitted. */
function EvidenceStats({ evidence }: { evidence: EvidenceSummary }) {
  const stats: string[] = [];
  if (evidence.totalAwards != null && evidence.totalAwards > 0)
    stats.push(`${evidence.totalAwards} awards`);
  if (evidence.medianUsd != null) stats.push(`${fmtUsd(evidence.medianUsd)} median`);
  if (evidence.utahCount != null && evidence.utahCount > 0)
    stats.push(`${evidence.utahCount} in Utah`);
  if (stats.length === 0) return null;
  return <p className="font-mono text-[12px] text-muted">{stats.join(" · ")}</p>;
}

/** Inline result of the "how would a program officer read this?" simulation. */
function OfficerPanel({ preview }: { preview: OfficerPreview }) {
  const b = preview.breakdown;
  return (
    <div className="space-y-2 rounded-lg border border-hairline bg-surface-low p-4">
      <p className="font-mono text-[10.5px] font-medium uppercase tracking-[0.08em] text-faint">
        Program officer preview
      </p>
      <p className="text-sm font-semibold text-ink">
        <span className="font-mono">{preview.score}</span>{" "}
        <span className="ml-1 rounded-full border border-line px-2 py-0.5 font-mono text-[11px] font-normal text-muted">
          {preview.tier}
        </span>
      </p>
      <p className="font-mono text-[11.5px] text-faint">
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
      <p className="font-mono text-[11.5px] text-faint">
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
      <dt className={`font-mono text-[11px] font-medium uppercase tracking-[0.05em] ${tone}`}>
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
