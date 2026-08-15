"use client";

// Region: the company dossier — the mock's centered founder-profile card.
// 80px initials avatar, name + location, confidence chip, or-kv ledger rows
// (missing critical facts pulse red), then the mk-meter completeness bar fed
// by profileReadiness, naming the fact that's still blocking ranking.
// "Edit" flips the ledger into a compact form — the founder's manual
// corrections always win over both extraction and the weekly dream research.

import { useState } from "react";
import type { CompanyProfile } from "@/lib/types";
import { profileReadiness } from "@/lib/engine/readiness";
import { Avatar, Badge, Button, KeyValueRow } from "./ui";
import { fmtUsd } from "./shared";

interface Row {
  label: string;
  value: string | null;
  /** Unknowns on required-for-ranking fields get the red pulsing marker. */
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
  // Completeness = the ledger the founder is looking at, not just the 5
  // ranking-required facts (which hit 100% while half the rows say Unknown).
  const pct = Math.round((rs.filter((r) => r.value != null).length / rs.length) * 100);
  const loc = profile.location?.state ? `${profile.location.state}, USA` : "Location unknown";

  return (
    <section
      id="dossier"
      className="or-card"
      style={{ overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}
    >
      <Avatar
        initials={initials(profile.name)}
        size="lg"
        style={{ marginTop: 4, marginBottom: 12 }}
      />
      <h3 style={{ margin: "0 0 4px", font: "600 24px/32px var(--font-headline)", color: "var(--color-text-deep)" }}>
        {profile.name ?? "Your company"}
      </h3>
      <span className="mk-label" style={{ textTransform: "uppercase", marginBottom: 12 }}>
        {loc}
      </span>
      <Badge
        tone={confidence === "High" ? "fit" : "caution"}
        icon={confidence === "High" ? "check_circle" : "info"}
        style={{ width: "100%", justifyContent: "center", marginBottom: 24 }}
      >
        Confidence: {confidence}
      </Badge>

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
          <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8, textAlign: "left" }}>
            {rs.map((r) => (
              <KeyValueRow
                key={r.label}
                label={r.label}
                value={
                  r.value != null ? (
                    // key on the value so a fresh fact re-triggers the entrance animation
                    <span key={r.value} className="card-in tnum">
                      {r.value}
                    </span>
                  ) : (
                    <span className="italic text-faint">Unknown</span>
                  )
                }
              />
            ))}
          </div>
          <div className="mk-meter">
            <div className="mk-meter__head">
              <span className="mk-label">PROFILE COMPLETE</span>
              <span className="mk-meter__value">{pct}%</span>
            </div>
            <div
              className="mk-meter__track"
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Profile complete"
            >
              <div className="mk-meter__fill" style={{ width: `${pct}%` }} />
            </div>
            <p className="mk-meter__note">
              {rs.filter((r) => r.value != null).length} of {rs.length} facts known.
              {readiness.missing.length > 0 &&
                ` Still blocking ranking: ${readiness.missing[0].label}.`}
            </p>
          </div>
          {onSave && (
            <Button
              variant="outline"
              size="sm"
              block
              icon="edit"
              style={{ marginTop: 16 }}
              onClick={() => setEditing(true)}
            >
              Edit profile
            </Button>
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

  const input = "or-field";
  const inputPad = { padding: "6px 10px" } as const;
  const label = "mk-label block text-left uppercase";

  return (
    <div className="w-full space-y-2.5 text-left">
      <div>
        <span className={label}>Company name</span>
        <input className={input} style={inputPad} value={f.name} onChange={(e) => set("name", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className={label}>City</span>
          <input className={input} style={inputPad} value={f.city} onChange={(e) => set("city", e.target.value)} />
        </div>
        <div>
          <span className={label}>State</span>
          <input className={input} style={inputPad} value={f.state} maxLength={2} placeholder="UT" onChange={(e) => set("state", e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className={label}>Team size</span>
          <input className={input} style={inputPad} inputMode="numeric" value={f.employees} onChange={(e) => set("employees", e.target.value)} />
        </div>
        <div>
          <span className={label}>Revenue / yr</span>
          <input className={input} style={inputPad} placeholder="$500K" value={f.revenue} onChange={(e) => set("revenue", e.target.value)} />
        </div>
        <div>
          <span className={label}>Raised</span>
          <input className={input} style={inputPad} placeholder="$1.5M" value={f.raised} onChange={(e) => set("raised", e.target.value)} />
        </div>
        <div>
          <span className={label}>Stage</span>
          <select className={input} style={inputPad} value={f.maturity} onChange={(e) => set("maturity", e.target.value)}>
            <option value="">unknown</option>
            {MATURITY.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>
        <div>
          <span className={label}>Seeking (min)</span>
          <input className={input} style={inputPad} placeholder="$500K" value={f.needMin} onChange={(e) => set("needMin", e.target.value)} />
        </div>
        <div>
          <span className={label}>Seeking (max)</span>
          <input className={input} style={inputPad} placeholder="$3M" value={f.needMax} onChange={(e) => set("needMax", e.target.value)} />
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
            className="or-field w-auto"
            style={inputPad}
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
        <Button variant="filled" size="sm" className="flex-1" onClick={save}>
          Save changes
        </Button>
        <Button variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
