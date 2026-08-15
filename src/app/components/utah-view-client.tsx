"use client";

// Utah View — client shell. The server page hands over DB-backed data
// (src/app/utah/data.ts); this layer adds the ONLY personalized parts by
// reading the founder's stored report (sessionStorage "or:lastReport"):
// the "You" city tag, comparison chips on winners, and real fit tiers on
// Utah-only programs. No stored report → no chips, never invented ones.

import { useEffect, useMemo, useState } from "react";
import type { UtahViewData } from "../utah/data";
import { usePageAssistantContext } from "./assistant/context";
import { Avatar, Badge, Button, KeyValueRow, ProgressBar, type BadgeTone } from "./ui";
import type { UiReport } from "./shared";
import { fmtUsdBig, fmtUsdFull, humanize, norm, type UtahPersona } from "./utah-view-format";
import UtahViewWinners, { rankWinners } from "./utah-view-winners";
import UtahViewPeople from "./utah-view-people";

/** Real report tiers → kit badge tones. Unscored programs get NO chip. */
const TIER_BADGE: Record<string, { tone: BadgeTone; label: string }> = {
  likely_fit: { tone: "fit", label: "Likely fit" },
  verify_eligibility: { tone: "caution", label: "Verify" },
  adjacent: { tone: "neutral", label: "Adjacent" },
  not_a_fit: { tone: "neutral", label: "Not a fit" },
};

function StatsCard({ data }: { data: UtahViewData }) {
  return (
    <div className="or-card" style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
      <Avatar initials="UT" size="lg" style={{ marginBottom: 12, marginTop: 4 }} />
      <h3 style={{ margin: "0 0 4px", font: "600 24px/32px var(--font-headline)", color: "var(--color-text-deep)" }}>
        Utah
      </h3>
      <span className="mk-label" style={{ textTransform: "uppercase", marginBottom: 12 }}>
        Documented federal winners
      </span>
      <Badge tone="secondary" style={{ width: "100%", justifyContent: "center", marginBottom: 24 }}>
        {data.winnersCount.toLocaleString("en-US")} winners found
      </Badge>
      <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
        {/* median of per-company grant totals (utah_precedents.total_amount_usd) */}
        <KeyValueRow label="Median grant total" value={fmtUsdFull(data.medianGrantUsd)} />
        {/* sum of per-company grant totals, same column */}
        <KeyValueRow label={`Total grants (${data.grantCount} winners)`} value={fmtUsdBig(data.totalGrantUsd)} />
        {/* sum of per-company contract obligations, same column */}
        <KeyValueRow label={`Contract obligations (${data.contractCount})`} value={fmtUsdBig(data.totalContractUsd)} />
        {/* COUNT(*) opportunities WHERE source='utah' */}
        <KeyValueRow label="Utah-only programs" value={String(data.utahOnlyCount)} />
      </div>
      <div className="mk-meter">
        <div className="mk-meter__head">
          <span className="mk-label">EVIDENCE CACHED</span>
          <span className="mk-meter__value">100%</span>
        </div>
        <div className="mk-meter__track" role="progressbar" aria-valuenow={100} aria-valuemin={0} aria-valuemax={100} aria-label="Evidence cached">
          <div className="mk-meter__fill" style={{ width: "100%" }} />
        </div>
        <p className="mk-meter__note">
          {data.winnersCount.toLocaleString("en-US")} of {data.winnersCount.toLocaleString("en-US")} Utah winner
          records cached{data.cachedOn ? ` ${data.cachedOn}` : ""}.
        </p>
      </div>
    </div>
  );
}

function CityCard({ data, persona }: { data: UtahViewData; persona: UtahPersona | null }) {
  const max = data.topCities[0]?.totalUsd ?? 0;
  if (!max) return null;
  return (
    <div className="or-card">
      <h4 className="mk-h4" style={{ marginBottom: 4 }}>
        Where the money lands
      </h4>
      <p className="mk-label" style={{ margin: "0 0 16px" }}>
        SBIR/STTR grant totals by recipient city
      </p>
      <div className="mk-stack">
        {data.topCities.map((c) => {
          const you = persona?.city != null && norm(persona.city) === norm(c.city);
          return (
            <div key={c.city}>
              <div className="mk-between" style={{ marginBottom: 4 }}>
                <span style={{ font: "400 14px/20px var(--font-body)", color: "var(--color-text-deep)" }}>
                  {humanize(c.city)} {you ? <Badge tone="primary">You</Badge> : null}
                </span>
                <span className="mk-num">{fmtUsdBig(c.totalUsd)}</span>
              </div>
              <ProgressBar rounded value={Math.max(2, Math.round((c.totalUsd / max) * 100))} aria-label={c.city} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ProgramsCard({ data, persona }: { data: UtahViewData; persona: UtahPersona | null }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? data.programs : data.programs.slice(0, 8);
  return (
    <div className="or-card">
      <h4 className="mk-h4" style={{ marginBottom: 16 }}>
        Utah-only programs
      </h4>
      <div className="mk-stack">
        {shown.map((p) => {
          const tier = persona?.tierById[p.id];
          const badge = tier ? TIER_BADGE[tier] : undefined;
          return (
            <div className="or-kv" key={p.id}>
              <span className="or-kv__label" style={{ minWidth: 0 }}>
                {p.title}
              </span>
              {/* only programs the stored report actually scored get a chip */}
              {badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : null}
            </div>
          );
        })}
      </div>
      {data.programs.length > 8 ? (
        <Button variant="text" size="sm" style={{ marginTop: 12 }} onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show fewer" : `See all ${data.utahOnlyCount}`}
        </Button>
      ) : null}
    </div>
  );
}

export default function UtahViewClient({ data }: { data: UtahViewData }) {
  const [persona, setPersona] = useState<UtahPersona | null>(null);

  // Layer in the founder's last scan, if one exists in this browser session.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("or:lastReport");
      if (!raw) return;
      const r = JSON.parse(raw) as UiReport;
      const top = r.matches?.[0];
      const opp = top ? r.opportunities?.[top.opportunityId] : undefined;
      setPersona({
        city: r.profile?.location?.city ?? null,
        topTitle: opp?.title ?? null,
        topAgency: opp?.agency ?? null,
        topKind: opp?.kind ?? null,
        tierById: Object.fromEntries((r.matches ?? []).map((m) => [m.opportunityId, m.tier])),
      });
    } catch {
      // unreadable stored report → an unpersonalized (still honest) page
    }
  }, []);

  usePageAssistantContext({
    page: "utah",
    title: "Utah View",
    data: {
      winnersCount: data.winnersCount,
      medianAwardUsd: data.medianGrantUsd,
      topCities: data.topCities.map((c) => humanize(c.city)),
      navigatorCount: data.navigators.length,
      utahOnlyCount: data.utahOnlyCount,
    },
  });

  const grants = useMemo(() => rankWinners(data.grants, persona), [data.grants, persona]);
  const contracts = useMemo(() => rankWinners(data.contracts, persona), [data.contracts, persona]);

  return (
    <main className="mk-page">
      <div className="mk-pagehead">
        <h2 className="mk-h3">Utah Winners</h2>
        <span className="mk-label">
          USAspending + SBIR.gov{data.cachedOn ? ` · cached ${data.cachedOn}` : ""}
        </span>
      </div>

      <div className="mk-grid">
        <div className="mk-c3">
          <StatsCard data={data} />
          <CityCard data={data} persona={persona} />
        </div>

        <div className="mk-c6">
          <UtahViewWinners
            title="Comparable grant paths"
            intro="Utah companies that won SBIR (Small Business Innovation Research) and STTR (Small Business Technology Transfer) awards. Dollar figures are each company's documented award total."
            winners={grants}
            persona={persona}
            showAllLabel={`Show all ${data.grantCount} Utah grant winners`}
          />
          <UtahViewWinners
            title="Comparable federal contract paths"
            intro="Utah companies with documented federal contract obligations on USAspending. Totals are obligations to date, not single awards."
            winners={contracts}
            persona={persona}
            showAllLabel={`Show all ${data.contractCount} Utah contract winners`}
          />
        </div>

        <div className="mk-c3">
          <ProgramsCard data={data} persona={persona} />
        </div>
      </div>

      <UtahViewPeople navigators={data.navigators} utif={data.utif} />
    </main>
  );
}
