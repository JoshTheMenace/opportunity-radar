"use client";

// One opportunity match card: title row, meta row, odds, evidence strip,
// why-fit/disqualify/verify/next-steps, and the outbound link.

import Link from "next/link";
import type { EvidenceSummary, Opportunity, RankedMatch } from "@/lib/types";
import { daysUntil, fmtUsd } from "./shared";

export default function MatchCard({
  match,
  opp,
  evidence,
}: {
  match: RankedMatch;
  opp?: Opportunity;
  evidence?: EvidenceSummary;
}) {
  const close = daysUntil(opp?.closeDate ?? null);
  const odds =
    opp?.expectedAwards != null
      ? `~${opp.expectedAwards} awards expected` +
        (opp.expectedApplications != null && opp.expectedAwards > 0
          ? ` · 1-in-${Math.max(1, Math.round(opp.expectedApplications / opp.expectedAwards))} odds`
          : "")
      : null;

  return (
    <article className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold">
          <Link
            href={`/opportunity/${encodeURIComponent(match.opportunityId)}`}
            className="hover:text-blue-300 hover:underline"
          >
            {opp?.title ?? match.opportunityId}
          </Link>
        </h3>
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
      {evidence && <EvidenceStrip evidence={evidence} />}
      <dl className="space-y-1.5 text-sm">
        <CardRow label="Why it fits" text={match.whyFit} tone="text-green-400" />
        <CardRow label="Could disqualify" text={match.whatCouldDisqualify} tone="text-red-400" />
        <CardRow label="Verify" text={match.whatToVerify} tone="text-yellow-400" />
        <CardRow label="Next steps" text={match.nextSteps} tone="text-blue-400" />
      </dl>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Link
          href={`/opportunity/${encodeURIComponent(match.opportunityId)}`}
          className="rounded-md border border-blue-500/50 px-3 py-1 text-xs font-semibold text-blue-300 hover:bg-blue-500/10"
        >
          Details & submission plan →
        </Link>
        {opp?.url && (
          <a
            href={opp.url}
            target="_blank"
            rel="noreferrer"
            className="text-xs text-blue-400 underline hover:text-blue-300"
          >
            Official notice ↗
          </a>
        )}
      </div>
    </article>
  );
}

/** Compact "who wins this money" strip built from historical-award evidence. */
function EvidenceStrip({ evidence }: { evidence: EvidenceSummary }) {
  const stats: string[] = [];
  if (evidence.totalAwards != null) stats.push(`${evidence.totalAwards} awards`);
  if (evidence.medianUsd != null) stats.push(`${fmtUsd(evidence.medianUsd)} median`);
  if (evidence.utahCount != null && evidence.utahCount > 0)
    stats.push(`${evidence.utahCount} in Utah`);
  const similar = evidence.similarAwards.slice(0, 3);
  if (stats.length === 0 && similar.length === 0) return null;

  return (
    <div className="space-y-1 rounded-md border border-neutral-800 bg-neutral-950 p-2.5">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Who wins this money
      </p>
      {stats.length > 0 && <p className="text-xs text-neutral-300">{stats.join(" · ")}</p>}
      {similar.length > 0 && (
        <p className="text-xs text-neutral-400">
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
                    className="underline hover:text-blue-300"
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

function CardRow({ label, text, tone }: { label: string; text: string; tone: string }) {
  return (
    <div>
      <dt className={`text-xs font-semibold uppercase tracking-wide ${tone}`}>{label}</dt>
      <dd className="text-neutral-300">{text}</dd>
    </div>
  );
}
