"use client";

// Region: the company dossier — Federal Catalyst "founder profile" card.
// Initials avatar, name + location, confidence chip, then ledger rows.
// Unknown critical rows get a quiet hollow-dot marker so the founder can
// see what answering is still worth. Lives in the left column of the
// Opportunity Map.

import type { CompanyProfile } from "@/lib/types";
import { profileReadiness } from "@/lib/engine/readiness";
import { fmtUsd } from "./shared";

interface Row {
  label: string;
  value: string | null;
  /** Unknowns on required-for-ranking fields get a hollow-dot marker. */
  critical?: boolean;
}

function rows(p: CompanyProfile): Row[] {
  const yn = (b: boolean | null) => (b == null ? null : b ? "Yes" : "No");
  const seeking =
    p.capitalNeedUsd.min != null || p.capitalNeedUsd.max != null
      ? [
          p.capitalNeedUsd.min != null ? fmtUsd(p.capitalNeedUsd.min) : null,
          p.capitalNeedUsd.max != null ? fmtUsd(p.capitalNeedUsd.max) : null,
        ]
          .filter(Boolean)
          .join("–")
      : null;
  return [
    {
      label: "Industry",
      value: p.technologyKeywords.length > 0 ? titleCase(p.technologyKeywords[0]) : null,
    },
    { label: "Team", value: p.employees != null ? `${p.employees} people` : null },
    {
      label: "Revenue",
      value: p.annualRevenueUsd != null ? fmtUsd(p.annualRevenueUsd) : null,
      critical: true,
    },
    { label: "Raised", value: p.capitalRaisedUsd != null ? fmtUsd(p.capitalRaisedUsd) : null },
    { label: "Seeking", value: seeking, critical: true },
    { label: "Stage", value: p.productMaturity ?? p.fundingStage },
    { label: "Active R&D", value: yn(p.hasActiveRnD) },
    { label: "Ownership", value: p.majorityUsOwned == null ? null : p.majorityUsOwned ? "US-owned" : "Foreign-majority", critical: true },
    { label: "SAM.gov", value: yn(p.samRegistered) },
  ];
}

function titleCase(s: string): string {
  return s.length > 26 ? s.slice(0, 26) + "…" : s.charAt(0).toUpperCase() + s.slice(1);
}

function initials(name: string | null): string {
  if (!name) return "—";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function ProfileCard({ profile }: { profile: CompanyProfile | null }) {
  if (!profile) return null;
  const rs = rows(profile);
  const readiness = profileReadiness(profile);
  const confidence = readiness.ready ? "High" : readiness.knownCount >= 3 ? "Medium" : "Low";
  const loc = profile.location?.state ? `${profile.location.state}, USA` : "Location unknown";

  return (
    <section
      id="dossier"
      className="card relative flex flex-col items-center overflow-hidden p-6 text-center"
    >
      <div className="mb-2 mt-1 flex h-16 w-16 items-center justify-center rounded-full border-2 border-soft bg-soft font-display text-xl font-bold text-brand">
        {initials(profile.name)}
      </div>
      <h3 className="font-display text-[18px] font-bold tracking-tight text-ink">
        {profile.name ?? "Your company"}
      </h3>
      <span className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
        {loc}
      </span>
      <div
        className={`mb-4 rounded-full px-3 py-1 text-[12px] font-semibold ${
          confidence === "High" ? "bg-good-soft text-good" : "bg-warn-soft text-warn"
        }`}
      >
        Confidence: {confidence}
      </div>

      <dl className="w-full space-y-2 text-left">
        {rs.map((r) => {
          const missing = r.value == null;
          return (
            <div key={r.label} className="flex items-baseline justify-between gap-3 border-b border-hairline pb-1 last:border-0">
              <dt className="flex items-center gap-1.5 text-[12.5px] text-faint">
                {missing && r.critical && (
                  <span className="h-2 w-2 rounded-full border border-line" />
                )}
                {r.label}
              </dt>
              {r.value != null ? (
                // key on the value so a fresh fact re-triggers the entrance animation
                <dd key={r.value} className="card-in tnum text-[13.5px] font-semibold text-ink">
                  {r.value}
                </dd>
              ) : (
                <dd className="text-[13.5px] font-medium italic text-faint">Unknown</dd>
              )}
            </div>
          );
        })}
      </dl>
    </section>
  );
}
