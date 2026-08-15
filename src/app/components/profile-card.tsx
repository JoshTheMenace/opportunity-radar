"use client";

// Region: the company dossier — Federal Catalyst "founder profile" card.
// Initials avatar, name + location, confidence chip, then ledger rows.
// Unknown critical rows get a quiet hollow-dot marker so the founder can
// see what answering is still worth. "Edit" flips the ledger into a
// compact form — the founder's manual corrections always win over both
// extraction and the weekly dream research. Lives in the left column.

import { useState } from "react";
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

export default function ProfileCard({
  profile,
  onSave,
}: {
  profile: CompanyProfile | null;
  /** When provided, the dossier gets an Edit mode; the parent owns persistence. */
  onSave?: (p: CompanyProfile) => void;
}) {
  const [editing, setEditing] = useState(false);
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

      {editing && onSave ? (
        <ProfileEditForm
          profile={profile}
          onCancel={() => setEditing(false)}
          onSave={(p) => {
            onSave(p);
            setEditing(false);
          }}
        />
      ) : (
        <>
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
          {onSave && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="mt-4 w-full rounded-xl border border-line px-3 py-1.5 text-[13px] font-semibold text-muted transition-colors hover:bg-surface-low hover:text-ink"
            >
              Edit profile
            </button>
          )}
        </>
      )}
    </section>
  );
}

// ---------- edit mode ----------

const MATURITY = ["concept", "prototype", "pilot", "in-market"] as const;

/** "$1.5M" / "750k" / "2000000" -> number; empty -> null; garbage -> undefined. */
function parseMoney(s: string): number | null | undefined {
  const t = s.trim();
  if (!t) return null;
  const m = t.replace(/[$,\s]/g, "").match(/^(\d+(?:\.\d+)?)([kmb])?$/i);
  if (!m) return undefined;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2]?.toLowerCase() as "k" | "m" | "b"] ?? 1;
  return parseFloat(m[1]) * mult;
}

function ProfileEditForm({
  profile,
  onSave,
  onCancel,
}: {
  profile: CompanyProfile;
  onSave: (p: CompanyProfile) => void;
  onCancel: () => void;
}) {
  const [f, setF] = useState({
    name: profile.name ?? "",
    city: profile.location?.city ?? "",
    state: profile.location?.state ?? "",
    employees: profile.employees != null ? String(profile.employees) : "",
    revenue: profile.annualRevenueUsd != null ? String(profile.annualRevenueUsd) : "",
    raised: profile.capitalRaisedUsd != null ? String(profile.capitalRaisedUsd) : "",
    needMin: profile.capitalNeedUsd.min != null ? String(profile.capitalNeedUsd.min) : "",
    needMax: profile.capitalNeedUsd.max != null ? String(profile.capitalNeedUsd.max) : "",
    maturity: profile.productMaturity ?? "",
    rnd: profile.hasActiveRnD,
    usOwned: profile.majorityUsOwned,
    sam: profile.samRegistered,
  });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: unknown) => setF((s) => ({ ...s, [k]: v }));

  function save() {
    const money: Record<string, number | null> = {};
    for (const [k, raw] of [
      ["revenue", f.revenue],
      ["raised", f.raised],
      ["needMin", f.needMin],
      ["needMax", f.needMax],
    ] as const) {
      const v = parseMoney(raw);
      if (v === undefined) {
        setErr(`Couldn't read the ${k === "needMin" || k === "needMax" ? "funding amount" : k} — try "1.5M" or "750K".`);
        return;
      }
      money[k] = v;
    }
    const employees = f.employees.trim() === "" ? null : parseInt(f.employees, 10);
    if (employees !== null && !Number.isFinite(employees)) {
      setErr("Team size needs to be a number.");
      return;
    }
    onSave({
      ...profile,
      name: f.name.trim() || null,
      location:
        f.city.trim() || f.state.trim()
          ? { city: f.city.trim() || null, state: f.state.trim().toUpperCase() || null }
          : profile.location,
      employees,
      annualRevenueUsd: money.revenue,
      capitalRaisedUsd: money.raised,
      capitalNeedUsd: { min: money.needMin, max: money.needMax },
      productMaturity: f.maturity || null,
      hasActiveRnD: f.rnd,
      majorityUsOwned: f.usOwned,
      samRegistered: f.sam,
    });
  }

  const input =
    "w-full rounded-lg border border-line bg-surface-low px-2.5 py-1.5 text-[13px] text-ink focus:border-brand focus:outline-none";
  const label = "block text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-faint";

  return (
    <div className="w-full space-y-2.5 text-left">
      <div>
        <span className={label}>Company name</span>
        <input className={input} value={f.name} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className={label}>City</span>
          <input className={input} value={f.city} onChange={(e) => set("city", e.target.value)} />
        </div>
        <div>
          <span className={label}>State</span>
          <input className={input} value={f.state} maxLength={2} placeholder="UT" onChange={(e) => set("state", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className={label}>Team size</span>
          <input className={input} inputMode="numeric" value={f.employees} onChange={(e) => set("employees", e.target.value)} />
        </div>
        <div>
          <span className={label}>Revenue / yr</span>
          <input className={input} placeholder="$500K" value={f.revenue} onChange={(e) => set("revenue", e.target.value)} />
        </div>
        <div>
          <span className={label}>Raised</span>
          <input className={input} placeholder="$1.5M" value={f.raised} onChange={(e) => set("raised", e.target.value)} />
        </div>
        <div>
          <span className={label}>Stage</span>
          <select className={input} value={f.maturity} onChange={(e) => set("maturity", e.target.value)}>
            <option value="">unknown</option>
            {MATURITY.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Seeking (min)</span>
          <input className={input} placeholder="$500K" value={f.needMin} onChange={(e) => set("needMin", e.target.value)} />
        </div>
        <div>
          <span className={label}>Seeking (max)</span>
          <input className={input} placeholder="$3M" value={f.needMax} onChange={(e) => set("needMax", e.target.value)} />
        </div>
      </div>
      {(
        [
          ["Active R&D", "rnd"],
          ["Majority US-owned", "usOwned"],
          ["SAM.gov registered", "sam"],
        ] as const
      ).map(([lab, key]) => (
        <div key={key} className="flex items-center justify-between gap-2">
          <span className={label}>{lab}</span>
          <select
            className="rounded-lg border border-line bg-surface-low px-2 py-1 text-[13px] text-ink focus:border-brand focus:outline-none"
            value={f[key] == null ? "" : f[key] ? "yes" : "no"}
            onChange={(e) => set(key, e.target.value === "" ? null : e.target.value === "yes")}
          >
            <option value="">unknown</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
      ))}
      {err && <p className="text-[12.5px] text-risk">{err}</p>}
      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={save}
          className="flex-1 rounded-xl bg-brand px-3 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-brand-strong"
        >
          Save changes
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl border border-line px-3 py-1.5 text-[13px] font-semibold text-muted transition-colors hover:bg-surface-low"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
