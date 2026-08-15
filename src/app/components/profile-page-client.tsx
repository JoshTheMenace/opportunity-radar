"use client";

// /profile — the Company Profile page (Federal Catalyst "Profile" screen).
// Left: dossier card with readiness meter. Center: provenance legend,
// grouped editable fact sections, and the founder's verbatim words.
// Right: the top "answer this to unlock $" ask, or an all-clear card.
//
// Provenance honesty: CompanyProfile stores no per-field source, so the only
// badges we can truthfully show are "You edited" (tracked here, in
// localStorage "or:profileEdits"), "We inferred" (the two deterministic
// derivations from engine/profile.ts deriveFields: isSmallBusiness from
// employees, isForProfit from raised capital / funding stage), and "Unknown"
// (null fields). Everything else is unbadged — the scan read it from the
// founder's words and we can't distinguish stated from LLM-inferred.

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { CompanyProfile, GateField, InterviewQuestion } from "@/lib/types";
import { profileReadiness, sortQuestionsRequiredFirst } from "@/lib/engine/readiness";
import { fmtUsd, type UiReport } from "./shared";
import { Badge, Button, Icon, IconButton, KeyValueRow } from "./ui";
import { usePageAssistantContext } from "./assistant/context";

/* ---------- storage keys + small helpers ---------- */

const EDITS_KEY = "or:profileEdits";
type EditRecord = { prev: string; at: string };
type Edits = Record<string, EditRecord>;

const MATURITY = ["concept", "prototype", "pilot", "in-market"] as const;
const FOLLOW_UP = "\nFounder follow-up:";
const yn = (b: boolean | null) => (b == null ? null : b ? "Yes" : "No");

/** "$1.5M" / "750k" / "2000000" -> number; empty -> null; garbage -> undefined.
 *  (Same grammar as ProfileEditForm / engine applyAnswer.) */
function parseMoney(s: string): number | null | undefined {
  const t = s.trim();
  if (!t) return null;
  const m = t.replace(/[$,\s]/g, "").match(/^(\d+(?:\.\d+)?)([kmb])?$/i);
  if (!m) return undefined;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2]?.toLowerCase() as "k" | "m" | "b"] ?? 1;
  return parseFloat(m[1]) * mult;
}

/** Client copy of engine/profile.ts deriveFields (that module pulls the LLM
 *  backend into the bundle, so it can't be imported here). Same two rules. */
function deriveFields(p: CompanyProfile): CompanyProfile {
  const d = { ...p };
  if (d.isSmallBusiness === null && d.employees !== null) {
    if (d.employees >= 500) d.isSmallBusiness = false;
    else if (d.annualRevenueUsd === null || d.annualRevenueUsd < 50_000_000)
      d.isSmallBusiness = true;
  }
  if (d.isForProfit === null && (d.fundingStage !== null || (d.capitalRaisedUsd ?? 0) > 0))
    d.isForProfit = true;
  return d;
}

function initials(name: string | null): string {
  if (!name) return "—";
  return name.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
}

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short" });

/* ---------- field definitions (one row per fact) ---------- */

type Draft = { a: string; b: string };

interface FieldDef {
  key: string;
  label: string;
  kind: "bool" | "money" | "int" | "text" | "maturity" | "location" | "range";
  /** readiness.ts key when this fact is required before ranking. */
  requiredKey?: string;
  display: (p: CompanyProfile) => string | null;
  toDraft: (p: CompanyProfile) => Draft;
  /** Returns the updated profile, or an error message string. */
  apply: (p: CompanyProfile, d: Draft) => CompanyProfile | string;
}

type BoolKey = "hasActiveRnD" | "majorityUsOwned" | "samRegistered" | "isForProfit" | "isSmallBusiness";
type MoneyKey = "annualRevenueUsd" | "capitalRaisedUsd";

const boolField = (key: BoolKey, label: string, requiredKey?: string): FieldDef => ({
  key, label, kind: "bool", requiredKey,
  display: (p) => yn(p[key]),
  toDraft: (p) => ({ a: p[key] == null ? "" : p[key] ? "yes" : "no", b: "" }),
  apply: (p, d) => deriveFields({ ...p, [key]: d.a === "" ? null : d.a === "yes" }),
});

const moneyField = (key: MoneyKey, label: string): FieldDef => ({
  key, label, kind: "money",
  display: (p) => (p[key] == null ? null : fmtUsd(p[key])),
  toDraft: (p) => ({ a: p[key] != null ? String(p[key]) : "", b: "" }),
  apply: (p, d) => {
    const v = parseMoney(d.a);
    if (v === undefined) return 'Couldn\'t read that amount — try "1.5M" or "750K".';
    return deriveFields({ ...p, [key]: v });
  },
});

const seekingDisplay = (p: CompanyProfile) =>
  p.capitalNeedUsd.min == null && p.capitalNeedUsd.max == null
    ? null
    : [p.capitalNeedUsd.min, p.capitalNeedUsd.max]
        .filter((n): n is number => n != null)
        .map(fmtUsd)
        .join("–");

const ELIGIBILITY: FieldDef[] = [
  boolField("hasActiveRnD", "Active R&D", "hasActiveRnD"),
  boolField("majorityUsOwned", "Majority US-owned", "majorityUsOwned"),
  boolField("samRegistered", "Registered on SAM.gov"),
  boolField("isForProfit", "For-profit company"),
];

const SCALE: FieldDef[] = [
  {
    key: "employees", label: "Employees", kind: "int", requiredKey: "size",
    display: (p) => (p.employees != null ? String(p.employees) : null),
    toDraft: (p) => ({ a: p.employees != null ? String(p.employees) : "", b: "" }),
    apply: (p, d) => {
      const t = d.a.trim();
      if (t === "") return deriveFields({ ...p, employees: null });
      const n = parseInt(t, 10);
      if (!Number.isFinite(n) || n < 0) return "Team size needs to be a number.";
      const q = { ...p, employees: n };
      // SBA rule: >=500 heads invalidates a derived small-business flag.
      if (n >= 500) q.isSmallBusiness = false;
      return deriveFields(q);
    },
  },
  boolField("isSmallBusiness", "Small business (SBA)"),
  moneyField("annualRevenueUsd", "Revenue / yr"),
  moneyField("capitalRaisedUsd", "Raised"),
  {
    key: "capitalNeedUsd", label: "Seeking", kind: "range", requiredKey: "capitalNeed",
    display: seekingDisplay,
    toDraft: (p) => ({
      a: p.capitalNeedUsd.min != null ? String(p.capitalNeedUsd.min) : "",
      b: p.capitalNeedUsd.max != null ? String(p.capitalNeedUsd.max) : "",
    }),
    apply: (p, d) => {
      const min = parseMoney(d.a);
      const max = parseMoney(d.b);
      if (min === undefined || max === undefined)
        return 'Couldn\'t read the funding amount — try "500K" or "2M".';
      return deriveFields({ ...p, capitalNeedUsd: { min, max } });
    },
  },
];

const IDENTITY: FieldDef[] = [
  {
    key: "name", label: "Company name", kind: "text",
    display: (p) => p.name,
    toDraft: (p) => ({ a: p.name ?? "", b: "" }),
    apply: (p, d) => deriveFields({ ...p, name: d.a.trim() || null }),
  },
  {
    key: "location", label: "Location", kind: "location", requiredKey: "location",
    display: (p) =>
      p.location ? [p.location.city, p.location.state].filter(Boolean).join(", ") || null : null,
    toDraft: (p) => ({ a: p.location?.city ?? "", b: p.location?.state ?? "" }),
    apply: (p, d) => {
      const city = d.a.trim() || null;
      const state = d.b.trim().toUpperCase() || null;
      if (state && !/^[A-Z]{2}$/.test(state)) return "State should be its 2-letter code, e.g. UT.";
      return deriveFields({ ...p, location: city || state ? { city, state } : null });
    },
  },
  {
    key: "industry", label: "Industry", kind: "text",
    display: (p) => p.industry,
    toDraft: (p) => ({ a: p.industry ?? "", b: "" }),
    apply: (p, d) => deriveFields({ ...p, industry: d.a.trim() || null }),
  },
  {
    key: "productMaturity", label: "Stage", kind: "maturity",
    display: (p) => p.productMaturity,
    toDraft: (p) => ({ a: p.productMaturity ?? "", b: "" }),
    apply: (p, d) => deriveFields({ ...p, productMaturity: d.a || null }),
  },
];

const ALL_DEFS = [...ELIGIBILITY, ...SCALE, ...IDENTITY];

/** "We inferred" is only claimed where the deterministic derivation rule
 *  reproduces the stored value — the two mappings in deriveFields. */
function inferredNote(p: CompanyProfile, key: string): string | null {
  if (key === "isSmallBusiness" && p.isSmallBusiness != null && p.employees != null) {
    const derived =
      p.employees >= 500
        ? false
        : p.annualRevenueUsd == null || p.annualRevenueUsd < 50_000_000
          ? true
          : null;
    if (derived !== null && derived === p.isSmallBusiness)
      return derived
        ? `Inferred from ${p.employees} employees (under 500 — the SBA small-business line). Drives eligibility screens — correct it if we're wrong.`
        : `Inferred from ${p.employees} employees (500 or more). Correct it if we're wrong.`;
  }
  if (key === "isForProfit" && p.isForProfit === true && (p.fundingStage != null || (p.capitalRaisedUsd ?? 0) > 0))
    return "Inferred from raised capital / funding stage — investors imply a for-profit company.";
  return null;
}

/** What each still-missing required answer is actually blocking. */
const BLOCKING: Record<string, string> = {
  majorityUsOwned:
    "Ownership is the one still blocking SBIR programs (federal R&D grants for small businesses).",
  hasActiveRnD: "Active R&D is the one still blocking the SBIR programs.",
  capitalNeed: "How much you're seeking is the one still blocking amount matching.",
  location: "Your state is the one still blocking state-level programs.",
  size: "Team size is the one still blocking small-business-only programs.",
};

const GATE_KNOWN: Record<GateField, (p: CompanyProfile) => boolean> = {
  employees: (p) => p.employees != null,
  isForProfit: (p) => p.isForProfit != null,
  isSmallBusiness: (p) => p.isSmallBusiness != null,
  majorityUsOwned: (p) => p.majorityUsOwned != null,
  hasActiveRnD: (p) => p.hasActiveRnD != null,
  annualRevenueUsd: (p) => p.annualRevenueUsd != null,
  location: (p) => p.location?.state != null,
  samRegistered: (p) => p.samRegistered != null,
  productMaturity: (p) => p.productMaturity != null,
};

const note: React.CSSProperties = {
  margin: 0,
  font: "400 13px/18px var(--font-body)",
  color: "var(--color-on-surface-variant)",
};
const anno: React.CSSProperties = {
  font: "400 11px/14px var(--font-body)",
  fontStyle: "italic",
  color: "var(--color-outline)",
  letterSpacing: 0,
  textTransform: "none",
};

/* ---------- page ---------- */

export default function ProfilePageClient() {
  const router = useRouter();
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [report, setReport] = useState<UiReport | null>(null);
  const [edits, setEdits] = useState<Edits>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>({ a: "", b: "" });
  const [editErr, setEditErr] = useState<string | null>(null);
  const [words, setWords] = useState("");
  const [wordsSaved, setWordsSaved] = useState(false);

  // Load: session report first (sync), then prefer the durable saved company.
  useEffect(() => {
    let rep: UiReport | null = null;
    try {
      rep = JSON.parse(sessionStorage.getItem("or:lastReport") ?? "null") as UiReport | null;
    } catch {}
    setReport(rep);
    try {
      setEdits(JSON.parse(localStorage.getItem(EDITS_KEY) ?? "{}") as Edits);
    } catch {}
    const sessionProfile = rep?.profile ?? null;
    void fetch("/api/companies")
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { companies?: { name: string; profile: CompanyProfile; updatedAt: string }[] } | null) => {
        const companies = data?.companies ?? [];
        const match = sessionProfile?.name
          ? companies.find((c) => c.name === sessionProfile.name)
          : null;
        const latest = companies.reduce<(typeof companies)[number] | null>(
          (a, b) => (!a || b.updatedAt > a.updatedAt ? b : a),
          null,
        );
        // Saved copy wins (it includes autosaves + edits); session is fallback.
        setProfile(match?.profile ?? sessionProfile ?? latest?.profile ?? null);
      })
      .catch(() => setProfile(sessionProfile))
      .finally(() => setLoaded(true));
  }, []);

  // Founder's verbatim words: first segment before any interview follow-ups.
  useEffect(() => {
    if (profile && !words) setWords(profile.description.split(FOLLOW_UP)[0].trim());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile == null]);

  const readiness = profile ? profileReadiness(profile) : null;
  // Completeness over EVERY field this page displays — the required-only
  // fraction hit 100% while the ledger still showed Unknowns.
  const pct = profile
    ? Math.round(
        (ALL_DEFS.filter((d) => d.display(profile) != null).length / ALL_DEFS.length) * 100,
      )
    : 0;
  const missingKeys = useMemo(
    () => new Set((readiness?.missing ?? []).map((m) => m.key)),
    [readiness],
  );

  // Assistant: what this page is showing (names only, no values).
  const assistantCtx = useMemo(() => {
    if (!profile) return { page: "profile", title: "Company Profile", data: { empty: true } };
    const known = ALL_DEFS.filter((d) => d.display(profile) != null).map((d) => d.key);
    const unknown = ALL_DEFS.filter((d) => d.display(profile) == null).map((d) => d.key);
    return {
      page: "profile",
      title: "Company Profile",
      data: {
        knownFields: known,
        unknownFields: unknown,
        completenessPct: pct,
        editedFields: Object.keys(edits).filter((k) => ALL_DEFS.some((d) => d.key === k)),
      },
    };
  }, [profile, pct, edits]);
  usePageAssistantContext(assistantCtx);

  /** Write the profile everywhere the rest of the app reads it: the session
   *  report (so other pages see the change) and the companies API (durable —
   *  same body shape as opportunity-map's persist()). */
  function persistProfile(p: CompanyProfile): Promise<unknown> {
    try {
      const raw = sessionStorage.getItem("or:lastReport");
      if (raw) {
        const r = JSON.parse(raw) as UiReport;
        r.profile = p;
        sessionStorage.setItem("or:lastReport", JSON.stringify(r));
      }
    } catch {}
    return fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: p.name ?? "My company", profile: p }),
    }).catch(() => {});
  }

  function startEdit(def: FieldDef) {
    if (!profile) return;
    setDraft(def.toDraft(profile));
    setEditErr(null);
    setEditingKey(def.key);
  }

  function saveField(def: FieldDef) {
    if (!profile) return;
    const res = def.apply(profile, draft);
    if (typeof res === "string") {
      setEditErr(res);
      return;
    }
    const before = def.display(profile) ?? "Unknown";
    const after = def.display(res) ?? "Unknown";
    if (after !== before) {
      const next = { ...edits, [def.key]: { prev: before, at: new Date().toISOString() } };
      setEdits(next);
      try {
        localStorage.setItem(EDITS_KEY, JSON.stringify(next));
      } catch {}
    }
    setProfile(res);
    void persistProfile(res);
    setEditingKey(null);
  }

  /** New founder words, preserving any interview follow-up suffix (those
   *  answers are still facts about the company). */
  function withWords(p: CompanyProfile): CompanyProfile {
    const i = p.description.indexOf(FOLLOW_UP);
    return deriveFields({ ...p, description: words.trim() + (i >= 0 ? p.description.slice(i) : "") });
  }

  function saveWords() {
    if (!profile) return;
    const next = withWords(profile);
    setProfile(next);
    void persistProfile(next);
    setWordsSaved(true);
    setTimeout(() => setWordsSaved(false), 2500);
  }

  async function saveAndRescan() {
    if (!profile) return;
    const next = withWords(profile);
    setProfile(next);
    await persistProfile(next); // let the save land before the map re-reads it
    router.push("/");
  }

  /* ---------- early states ---------- */

  if (!loaded)
    return (
      <main className="mk-page">
        <div className="mk-pagehead">
          <h2 className="mk-h3">Company Profile</h2>
          <span className="mk-label">Loading…</span>
        </div>
      </main>
    );

  if (!profile)
    return (
      <main className="mk-page">
        <div className="mk-pagehead">
          <h2 className="mk-h3">Company Profile</h2>
        </div>
        <div
          className="or-card or-card--dashed"
          style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, padding: 48, textAlign: "center" }}
        >
          <Icon name="person_search" size={40} color="var(--color-outline)" />
          <p style={{ ...note, fontSize: 15, maxWidth: 420 }}>
            No profile yet — describe your company on the Opportunity Map first. One paragraph is
            enough; the scan builds this page from it.
          </p>
          <Button icon="radar" onClick={() => router.push("/")}>Go to the Opportunity Map</Button>
        </div>
      </main>
    );

  /* ---------- derived view state ---------- */


  // Top remaining ask: report questions (required first) whose field is still
  // unknown; else a readiness basic; else nothing is blocking.
  const openQuestions = sortQuestionsRequiredFirst(
    (report?.questions ?? []).filter((q) => !GATE_KNOWN[q.field](profile)),
  );
  const topQ: InterviewQuestion | null = openQuestions[0] ?? null;
  const topUnlockUsd = topQ
    ? (report?.meter?.unlocks ?? []).find((u) => u.field === topQ.field)?.unlockUsd ?? null
    : null;
  const readinessAsk = readiness && !readiness.ready ? readiness.missing[0] : null;

  const meterNote = readiness?.ready
    ? "All required answers are in — ranking runs with full data."
    : `${readiness!.missing.length} required answer${readiness!.missing.length === 1 ? "" : "s"} left. ${BLOCKING[readiness!.missing[0].key] ?? ""}`;

  const dossierRows: { label: string; value: string | null; missingKey?: string }[] = [
    { label: "Industry", value: profile.industry },
    { label: "Team", value: profile.employees != null ? `${profile.employees} people` : null, missingKey: "size" },
    { label: "Revenue", value: profile.annualRevenueUsd != null ? fmtUsd(profile.annualRevenueUsd) : null },
    { label: "Raised", value: profile.capitalRaisedUsd != null ? fmtUsd(profile.capitalRaisedUsd) : null },
    { label: "Seeking", value: seekingDisplay(profile), missingKey: "capitalNeed" },
    { label: "Active R&D", value: yn(profile.hasActiveRnD), missingKey: "hasActiveRnD" },
    {
      label: "Ownership",
      value: profile.majorityUsOwned == null ? null : profile.majorityUsOwned ? "US-owned" : "Foreign-majority",
      missingKey: "majorityUsOwned",
    },
  ];

  const loc = profile.location?.state
    ? [profile.location.city, `${profile.location.state}, USA`].filter(Boolean).join(", ")
    : "Location unknown";

  /* ---------- render ---------- */

  return (
    <main className="mk-page">
      <div className="mk-pagehead">
        <h2 className="mk-h3">Company Profile</h2>
        <span className="mk-label">
          {readiness!.missing.length} required · {pct}% complete
        </span>
      </div>

      <div className="mk-grid">
        {/* ------- left: dossier ------- */}
        <div className="mk-c3">
          <div
            className="or-card"
            style={{ overflow: "hidden", display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}
          >
            <span
              className="or-avatar"
              style={{ width: 80, height: 80, fontSize: 28, marginBottom: 12, marginTop: 4 }}
            >
              {initials(profile.name)}
            </span>
            <h3 style={{ margin: "0 0 4px", font: "600 24px/32px var(--font-headline)", color: "var(--color-text-deep)" }}>
              {profile.name ?? "Your company"}
            </h3>
            <span className="mk-label" style={{ textTransform: "uppercase", marginBottom: 12 }}>
              {loc}
            </span>
            <Badge
              tone={readiness!.ready ? "fit" : "caution"}
              icon={readiness!.ready ? "check_circle" : "info"}
              style={{ width: "100%", justifyContent: "center", marginBottom: 24 }}
            >
              {pct}% complete
            </Badge>
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
              {dossierRows.map((r) => (
                <KeyValueRow
                  key={r.label}
                  label={r.label}
                  value={
                    r.value ?? (
                      <span style={{ fontStyle: "italic", fontWeight: 400 }}>Unknown</span>
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
              <p className="mk-meter__note">{meterNote}</p>
            </div>
          </div>
        </div>

        {/* ------- center: editable facts + own words ------- */}
        <div className="mk-c6">
          <FactSection
            title="Eligibility"
            defs={ELIGIBILITY}
            footnote={
              'SAM.gov — the registry you must join before the government can pay you. "Active R&D" means you\'re building or testing something technically new, which SBIR grants require.'
            }
            {...{ profile, edits, editingKey, draft, editErr, missingKeys, setDraft, startEdit, saveField, setEditingKey }}
          />
          <FactSection
            title="Scale"
            defs={SCALE}
            {...{ profile, edits, editingKey, draft, editErr, missingKeys, setDraft, startEdit, saveField, setEditingKey }}
          />
          <FactSection
            title="Identity"
            defs={IDENTITY}
            {...{ profile, edits, editingKey, draft, editErr, missingKeys, setDraft, startEdit, saveField, setEditingKey }}
          />

          <div className="or-card">
            <label className="mk-label" htmlFor="own-words" style={{ display: "block", marginBottom: 12 }}>
              IN YOUR WORDS{" "}
              <span style={anno}>verbatim source — re-scanning re-derives everything above</span>
            </label>
            <textarea
              className="or-field"
              id="own-words"
              rows={5}
              value={words}
              onChange={(e) => setWords(e.target.value)}
            />
            <div className="mk-row" style={{ marginTop: 12, justifyContent: "flex-end" }}>
              {wordsSaved && (
                <span style={{ ...note, color: "var(--color-primary)" }}>Saved.</span>
              )}
              <Button variant="text" onClick={saveWords}>Just save</Button>
              <Button icon="radar" onClick={() => void saveAndRescan()}>Save &amp; re-scan</Button>
            </div>
            <p style={{ ...note, marginTop: 8 }}>
              Re-scan takes you back to the Opportunity Map and re-derives every fact above from
              these words.
            </p>
          </div>
        </div>

        {/* ------- right: unlock ask ------- */}
        <div className="mk-c3">
          {topQ || readinessAsk ? (
            <div className="or-card mk-ask">
              <h4
                style={{ margin: "0 0 8px", font: "600 20px/28px var(--font-headline)", color: "var(--color-text-deep)", display: "flex", alignItems: "center", gap: 8 }}
              >
                <Icon name="key" color="var(--color-primary)" />
                Unlock Results
              </h4>
              <p style={{ ...note, marginBottom: 16 }}>
                {topQ?.whyAsking ?? "Needed before we can rank accurately — early numbers inflate and then collapse."}
              </p>
              {topUnlockUsd != null && topUnlockUsd > 0 && (
                <p style={{ margin: "0 0 16px" }}>
                  <span className="mk-num" style={{ fontSize: 28, lineHeight: "32px" }}>
                    {fmtUsd(topUnlockUsd)}
                  </span>
                  <span style={{ ...note, display: "block" }}>rides on this one answer</span>
                </p>
              )}
              <p style={{ margin: "0 0 24px", font: "500 15px/22px var(--font-body)", color: "var(--color-text-deep)" }}>
                {topQ?.question ?? readinessAsk?.question}
              </p>
              <Button variant="tonal" block onClick={() => router.push("/")}>
                Answer on the Opportunity Map
              </Button>
            </div>
          ) : (
            <div className="or-card">
              <div className="mk-row" style={{ gap: 8 }}>
                <Icon name="check_circle" color="var(--color-fit-strong)" />
                <span style={{ font: "600 15px/22px var(--font-body)", color: "var(--color-text-deep)" }}>
                  Nothing blocking
                </span>
              </div>
              <p style={{ ...note, marginTop: 8 }}>
                Every required answer is in — ranking runs with full data.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

/* ---------- fact section + rows ---------- */

interface SectionProps {
  title: string;
  defs: FieldDef[];
  footnote?: string;
  profile: CompanyProfile;
  edits: Edits;
  editingKey: string | null;
  draft: Draft;
  editErr: string | null;
  missingKeys: Set<string>;
  setDraft: (d: Draft) => void;
  startEdit: (def: FieldDef) => void;
  saveField: (def: FieldDef) => void;
  setEditingKey: (k: string | null) => void;
}

function FactSection({ title, defs, footnote, profile, edits, editingKey, draft, editErr, missingKeys, setDraft, startEdit, saveField, setEditingKey }: SectionProps) {
  return (
    <div className="or-card">
      <h4 className="mk-h4">{title}</h4>
      <div className="mk-stack">
        {defs.map((def) => {
          const value = def.display(profile);
          const edit = edits[def.key];
          const requiredMissing = !!def.requiredKey && value == null && missingKeys.has(def.requiredKey);
          const inferred = edit ? null : inferredNote(profile, def.key);
          if (editingKey === def.key)
            return (
              <div key={def.key}>
                <div className="or-kv">
                  <span className="or-kv__label">{def.label}</span>
                  <span
                    className="mk-row"
                    style={{ gap: 8, justifyContent: "flex-end" }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveField(def);
                      if (e.key === "Escape") setEditingKey(null);
                    }}
                  >
                    <EditorInputs kind={def.kind} draft={draft} setDraft={setDraft} />
                    <Button size="sm" onClick={() => saveField(def)}>Save</Button>
                    <IconButton icon="close" size={16} dense aria-label="Cancel edit" onClick={() => setEditingKey(null)} />
                  </span>
                </div>
                {editErr && (
                  <p style={{ ...note, color: "var(--color-error)", marginTop: 4 }}>{editErr}</p>
                )}
              </div>
            );
          return (
            <div key={def.key}>
              <div className={requiredMissing ? "or-kv or-kv--danger" : "or-kv"}>
                <span className="or-kv__label">
                  {requiredMissing && (
                    <span className="or-ping" aria-hidden="true">
                      <span />
                      <span />
                    </span>
                  )}
                  {def.label}
                </span>
                <span className="mk-row" style={{ gap: 8, justifyContent: "flex-end" }}>
                  {value != null ? (
                    <span className="or-kv__value">{value}</span>
                  ) : (
                    <span className="or-kv__value" style={{ fontStyle: "italic", fontWeight: 400 }}>
                      Unknown
                    </span>
                  )}
                  {edit && <Badge tone="secondary">You edited</Badge>}
                  {inferred && <Badge tone="neutral">We inferred</Badge>}
                  {requiredMissing && <Badge tone="caution">Required</Badge>}
                  {requiredMissing ? (
                    <Button variant="tonal" size="sm" onClick={() => startEdit(def)}>
                      Answer
                    </Button>
                  ) : (
                    <IconButton icon="edit" size={16} dense aria-label={`Edit ${def.label}`} onClick={() => startEdit(def)} />
                  )}
                </span>
              </div>
              {edit && (
                <p style={{ ...note, marginTop: 4 }}>
                  You changed this from <b>{edit.prev}</b> on {fmtDay(edit.at)} — the agent
                  won&apos;t overwrite it. <span style={anno}>manual edits are sticky</span>
                </p>
              )}
              {!edit && inferred && <p style={{ ...note, marginTop: 4 }}>{inferred}</p>}
            </div>
          );
        })}
      </div>
      {footnote && <p style={{ ...note, marginTop: 12 }}>{footnote}</p>}
    </div>
  );
}

function EditorInputs({ kind, draft, setDraft }: { kind: FieldDef["kind"]; draft: Draft; setDraft: (d: Draft) => void }) {
  const field: React.CSSProperties = { padding: "6px 10px", width: 120 };
  const a = (v: string) => setDraft({ ...draft, a: v });
  const b = (v: string) => setDraft({ ...draft, b: v });
  switch (kind) {
    case "bool":
      return (
        <select className="or-field" style={field} autoFocus value={draft.a} onChange={(e) => a(e.target.value)}>
          <option value="">Unknown</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      );
    case "maturity":
      return (
        <select className="or-field" style={field} autoFocus value={draft.a} onChange={(e) => a(e.target.value)}>
          <option value="">unknown</option>
          {MATURITY.map((m) => (
            <option key={m} value={m}>{m}</option>
          ))}
        </select>
      );
    case "int":
      return <input className="or-field" style={field} autoFocus inputMode="numeric" placeholder="15" value={draft.a} onChange={(e) => a(e.target.value)} />;
    case "money":
      return <input className="or-field" style={field} autoFocus placeholder="$1.5M" value={draft.a} onChange={(e) => a(e.target.value)} />;
    case "text":
      return <input className="or-field" style={{ ...field, width: 180 }} autoFocus value={draft.a} onChange={(e) => a(e.target.value)} />;
    case "location":
      return (
        <>
          <input className="or-field" style={{ ...field, width: 130 }} autoFocus placeholder="City" value={draft.a} onChange={(e) => a(e.target.value)} />
          <input className="or-field" style={{ ...field, width: 60 }} placeholder="UT" maxLength={2} value={draft.b} onChange={(e) => b(e.target.value)} />
        </>
      );
    case "range":
      return (
        <>
          <input className="or-field" style={{ ...field, width: 90 }} autoFocus placeholder="$500K" value={draft.a} onChange={(e) => a(e.target.value)} />
          <span style={anno}>to</span>
          <input className="or-field" style={{ ...field, width: 90 }} placeholder="$2M" value={draft.b} onChange={(e) => b(e.target.value)} />
        </>
      );
  }
}
