"use client";

// Region: the company dossier — the profile visibly building itself as the
// conversation (voice or text) extracts facts. Filled rows read as ledger
// entries; unknowns stay as dotted slots so the founder can SEE what the
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
    <section id="dossier" className="space-y-2 rounded-lg border border-hairline bg-panel p-4">
      <div className="flex items-baseline justify-between">
        <p className="font-mono text-[10px] font-medium tracking-[0.18em] text-faint">
          COMPANY DOSSIER
        </p>
        <span
          className={`rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold ${
            readiness.ready
              ? "border-treasury/50 bg-treasury/10 text-treasury"
              : "border-brass/50 bg-brass/10 text-brass"
          }`}
        >
          {readiness.ready ? "ready to rank" : `${readiness.knownCount}/${readiness.requiredCount} basics`}
        </span>
      </div>
      <dl className="divide-y divide-hairline">
        {rs.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3 py-1">
            <dt className="text-xs text-muted">{r.label}</dt>
            {r.value != null ? (
              // key on the value so a fresh fact re-triggers the entrance animation
              <dd key={r.value} className="card-in font-mono text-xs text-paper">
                {r.value}
              </dd>
            ) : (
              <dd className="font-mono text-xs tracking-widest text-faint/60">· · ·</dd>
            )}
          </div>
        ))}
      </dl>
      <div className="h-1 overflow-hidden rounded-full bg-panel-2">
        <div
          className="h-full rounded-full bg-brass transition-[width] duration-700"
          style={{ width: `${Math.round((filled / rs.length) * 100)}%` }}
        />
      </div>
    </section>
  );
}
