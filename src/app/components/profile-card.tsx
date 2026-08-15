"use client";

// Region: the company dossier — the profile visibly building itself as the
// conversation (voice or text) extracts facts. Filled rows read as ledger
// entries; unknowns stay as "— unknown" slots so the founder can SEE what the
// interview is still worth. Lives in the guidance rail.

import type { CompanyProfile } from "@/lib/types";
import { profileReadiness } from "@/lib/engine/readiness";
import { fmtUsd } from "./shared";

interface Row {
  label: string;
  value: string | null;
}

function rows(p: CompanyProfile): Row[] {
  const yn = (b: boolean | null) => (b == null ? null : b ? "yes" : "no");
  const loc = p.location
    ? [p.location.city, p.location.state].filter(Boolean).join(", ") || null
    : null;
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
    { label: "Company", value: p.name },
    { label: "HQ", value: loc },
    { label: "Team", value: p.employees != null ? `${p.employees} people` : null },
    { label: "Revenue", value: p.annualRevenueUsd != null ? fmtUsd(p.annualRevenueUsd) : null },
    { label: "Raised", value: p.capitalRaisedUsd != null ? fmtUsd(p.capitalRaisedUsd) : null },
    { label: "Seeking", value: seeking },
    { label: "Stage", value: p.productMaturity ?? p.fundingStage },
    { label: "Active R&D", value: yn(p.hasActiveRnD) },
    { label: "US-owned", value: yn(p.majorityUsOwned) },
    { label: "Small business", value: yn(p.isSmallBusiness) },
    { label: "SAM.gov", value: yn(p.samRegistered) },
  ];
}

export default function ProfileCard({ profile }: { profile: CompanyProfile | null }) {
  if (!profile) return null;
  const rs = rows(profile);
  const filled = rs.filter((r) => r.value != null).length;
  const readiness = profileReadiness(profile);

  return (
    <section id="dossier" className="rounded-2xl border border-hairline bg-card p-5 shadow-card">
      <div className="flex items-center justify-between">
        <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-faint">
          Company dossier
        </p>
        <span
          className={`rounded-full px-2.5 py-1 font-mono text-[11px] font-semibold ${
            readiness.ready ? "bg-good-soft text-good" : "bg-soft text-brand"
          }`}
        >
          {readiness.ready
            ? `READY ${readiness.knownCount}/${readiness.requiredCount}`
            : `${readiness.knownCount}/${readiness.requiredCount} BASICS`}
        </span>
      </div>
      <dl className="mt-2">
        {rs.map((r) => (
          <div
            key={r.label}
            className="flex items-baseline justify-between gap-3 border-b border-dashed border-hairline py-1.5 text-[13.5px] last:border-0"
          >
            <dt className="text-muted">{r.label}</dt>
            {r.value != null ? (
              // key on the value so a fresh fact re-triggers the entrance animation
              <dd key={r.value} className="card-in font-mono text-[12.5px] text-ink">
                {r.value}
              </dd>
            ) : (
              <dd className="font-mono text-[12.5px] text-faint">— unknown</dd>
            )}
          </div>
        ))}
      </dl>
      <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-hairline">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-700"
          style={{ width: `${Math.round((filled / rs.length) * 100)}%` }}
        />
      </div>
    </section>
  );
}
