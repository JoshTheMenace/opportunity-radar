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
      className={`card-in card overflow-hidden ${
        match.tier === "likely_fit" ? "!border-accent/40" : ""
      }`}
      style={{ animationDelay: `${Math.min(index * 70, 490)}ms` }}
    >
      {/* header band */}
      <div
        className={`border-b border-hairline p-6 ${
          match.tier === "likely_fit" ? "bg-soft/60" : "bg-card"
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
          <div className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-[12px] font-semibold ${tier?.badge ?? ""}`}
              >
                {match.tier === "likely_fit" ? "✓ " : ""}
                {tier?.label ?? match.tier}
              </span>
              <span className="text-[12px] text-faint">
                ID <span className="font-mono">{shortId(match.opportunityId)}</span> · score{" "}
                <span className="font-mono font-semibold text-ink/70">{match.score}</span>
              </span>
            </div>
            <h4 className="font-display text-[20px] font-bold leading-[1.25] tracking-tight text-ink">
              <Link
                href={`/opportunity/${encodeURIComponent(match.opportunityId)}`}
                className="transition-colors hover:text-brand"
              >
                {opp?.title ?? match.opportunityId}
              </Link>
            </h4>
            <p className="mt-1 text-[12.5px] text-faint">
              {opp ? dedupeAgency(opp.agency) : "details unavailable"}
            </p>
          </div>
          <div className="text-right">
            {money && (
              <span className="tnum block font-display text-[20px] font-bold leading-6 text-brand">
                {money}
              </span>
            )}
            {opp?.closeDate ? (
              <span
                className={`text-[12.5px] ${
                  close != null && close <= 30 ? "font-semibold text-risk" : "text-faint"
                }`}
              >
                Deadline: {opp.closeDate}
                {close != null && close >= 0 ? ` (${close}d)` : ""}
              </span>
            ) : (
              <span className="text-[12.5px] text-faint">rolling deadline</span>
            )}
          </div>
        </div>
        {opp?.description && (
          <p className="mt-2.5 line-clamp-2 text-[14px] leading-relaxed text-muted">
            {opp.description}
          </p>
        )}
      </div>

      {/* body: why / disqualify columns */}
      <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
        <div>
          <h5 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.07em] text-good">
            Why it fits
          </h5>
          <ul className="list-inside list-disc space-y-1.5 text-[14px] leading-relaxed text-muted">
            {bullets(match.whyFit).map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        </div>
        <div>
          <h5 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.07em] text-risk">
            What could disqualify
          </h5>
          <ul className="list-inside list-disc space-y-1.5 text-[14px] leading-relaxed text-muted">
            {bullets(match.whatCouldDisqualify).map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
          <p className="mt-2.5 text-[13px] leading-relaxed text-faint">
            <span className="font-semibold text-warn">Verify:</span> {match.whatToVerify}
          </p>
        </div>

        {/* who wins this money + funding twin */}
        {evidence && (twin || (evidence.totalAwards != null && evidence.totalAwards > 0)) && (
          <div className="border-t border-hairline pt-4 md:col-span-2">
            <h5 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.07em] text-faint">
              Who else got this money
            </h5>
            <EvidenceStats evidence={evidence} />
            {twin && (
              <div className="mt-2.5 rounded-2xl bg-twin-soft/45 p-4">
                <div className="min-w-0">
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-twin">
                    Your funding twin
                  </span>
                  <p className="mt-1 text-[14.5px] font-semibold text-ink">{twin.recipient}</p>
                  <p className="mt-0.5 text-[13.5px] leading-relaxed text-muted">
                    Received {fmtUsd(twin.amountUsd)}
                    {twin.year ? ` in ${twin.year}` : ""} from this program
                    {twin.state ? ` (${twin.state})` : ""}.{" "}
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

        {/* collapsibles: timeline + officer preview */}
        {actionable && opp && profile && (
          <div className="md:col-span-2">
            <button
              type="button"
              onClick={() => setShowPlan((v) => !v)}
              className="text-[13px] font-semibold text-brand transition-colors hover:text-brand-strong"
            >
              {showPlan ? "▾" : "▸"} Plan backward from the deadline
            </button>
            {showPlan && (
              <ol className="mt-3 space-y-2 border-l-2 border-surface pl-4">
                {buildTimeline(opp, profile).map((s) => (
                  <li key={s.title} className="text-[13px]">
                    <span
                      className={`font-medium ${s.urgent ? "text-risk" : "text-ink"}`}
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-hairline bg-surface-low/50 px-6 py-4">
        <span className="max-w-[46%] text-[12.5px] leading-snug text-faint">
          {odds ?? bullets(match.nextSteps, 1)[0] ?? ""}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          {opp?.url && (
            <a
              href={opp.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-line bg-card px-4 py-2.5 text-[13.5px] font-medium text-muted transition-colors hover:bg-surface-low"
            >
              Official notice ↗
            </a>
          )}
          {actionable && profile && !officer && (
            <button
              type="button"
              onClick={() => void loadOfficer()}
              disabled={officerBusy}
              className="rounded-xl border border-line bg-card px-4 py-2.5 text-[13.5px] font-medium text-muted transition-colors hover:bg-surface-low disabled:opacity-50"
            >
              {officerBusy ? "Reviewing…" : "Officer preview"}
            </button>
          )}
          <Link
            href={`/opportunity/${encodeURIComponent(match.opportunityId)}`}
            className="rounded-xl bg-brand px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-strong"
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
  return <p className="tnum text-[13px] text-muted">{stats.join(" · ")}</p>;
}

/** Inline result of the "how would a program officer read this?" simulation. */
function OfficerPanel({ preview }: { preview: OfficerPreview }) {
  const b = preview.breakdown;
  return (
    <div className="space-y-2.5 rounded-2xl bg-surface-low p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
        Program officer preview
      </p>
      <p className="text-sm font-semibold text-ink">
        <span className="font-mono">{preview.score}</span>{" "}
        <span className="ml-1 rounded-full border border-line px-2 py-0.5 font-mono text-[11px] font-normal text-muted">
          {preview.tier}
        </span>
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
