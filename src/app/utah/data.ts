// ============================================================
// /utah data assembly — SERVER ONLY. Every number rendered on
// the Utah View traces to a query in this file (the DB tables
// are filled by scripts/ingest/utah-intelligence.ts and the
// utah opportunities ingest). utah-intelligence.ts only exports
// profile-personalized getUtahContext(), so the page-level
// aggregates live here; personalization stays client-side.
// ============================================================

import { getDb } from "@/lib/db";

const parse = <T,>(value: unknown, fallback: T): T => {
  try { return JSON.parse(String(value ?? "")) as T; } catch { return fallback; }
};

/** One Utah company that won federal money — compact, serializable. */
export interface UtahWinner {
  id: string;
  kind: "grant" | "contract";
  company: string;
  city: string | null;
  /** e.g. "Air Force SBIR Phase II" / "Department of the Air Force contract" */
  program: string;
  year: number | null; // most recent representative record's year
  amountUsd: number | null; // documented company total (grants awarded / contract obligations)
  awards: number; // documented award/contract count
  desc: string | null; // one-line technology summary (top rows only, for payload size)
  agencies: string[];
  sourceUrl: string | null;
}

export interface UtahCityTotal {
  city: string;
  totalUsd: number;
  winners: number;
}

export interface UtahNavigatorRow {
  id: string;
  name: string;
  organization: string;
  title: string | null;
  kind: string;
  topics: string[];
  summary: string | null;
  email: string | null;
  url: string | null;
  sourceUrl: string | null;
}

export interface UtahProgramRow {
  id: string; // matches RankedMatch.opportunityId, so the client can attach real tiers
  title: string;
}

export interface UtahViewData {
  cachedOn: string | null; // ingest_meta.last_run date for utah_intelligence
  winnersCount: number; // grant + contract precedent companies
  grantCount: number;
  contractCount: number;
  medianGrantUsd: number | null; // median of per-company grant totals
  totalGrantUsd: number; // sum of per-company grant totals
  totalContractUsd: number; // sum of per-company contract obligations
  utahOnlyCount: number; // opportunities WHERE source='utah'
  topCities: UtahCityTotal[]; // grant money by recipient city
  grants: UtahWinner[]; // sorted by documented total, desc
  contracts: UtahWinner[]; // sorted by documented total, desc
  navigators: UtahNavigatorRow[]; // Nucleus-first ordering
  programs: UtahProgramRow[];
  utif: { title: string; url: string | null; floorUsd: number | null; ceilingUsd: number | null } | null;
}

const DESC_ROWS = 80; // only the top rows per kind carry a description (payload size)

function toWinner(row: Record<string, unknown>, withDesc: boolean): UtahWinner {
  const kind = row.path_kind as "grant" | "contract";
  const reps = parse<Array<Record<string, unknown>>>(row.representative_records, []);
  const r0 = reps[0] ?? {};
  let program: string;
  let year: number | null = null;
  if (kind === "grant") {
    // grant reps carry branch/program/phase (e.g. Air Force · SBIR · Phase II)
    program =
      [String(r0.branch ?? "") || String(r0.agency ?? ""), r0.program, r0.phase]
        .map((v) => String(v ?? "").trim())
        .filter(Boolean)
        .join(" ") || "SBIR/STTR award";
    year = r0.award_year ? Number(r0.award_year) || null : null;
  } else {
    const who = String(r0.subagency ?? r0.agency ?? "").trim();
    program = who ? `${who} contract` : "Federal contract";
    const d = String(r0.latest_action_date ?? "");
    year = /^\d{4}/.test(d) ? Number(d.slice(0, 4)) : null;
  }
  const summary = String(row.summary ?? "").trim();
  return {
    id: row.id as string,
    kind,
    company: row.company as string,
    city: (row.city as string) ?? null,
    program,
    year,
    amountUsd: row.total_amount_usd == null ? null : Number(row.total_amount_usd),
    awards: Number(row.award_count ?? 0),
    desc: withDesc && summary ? summary.slice(0, 200) : null,
    agencies: parse<string[]>(row.agencies, []),
    sourceUrl: (row.source_url as string) ?? null,
  };
}

export function getUtahViewData(): UtahViewData {
  const db = getDb();

  const winners = (kind: "grant" | "contract") =>
    (db
      .prepare(
        `SELECT id, path_kind, company, city, summary, award_count, total_amount_usd,
                agencies, representative_records, source_url
         FROM utah_precedents WHERE path_kind = ?
         ORDER BY total_amount_usd DESC NULLS LAST, company`,
      )
      .all(kind) as Record<string, unknown>[])
      .map((row, i) => toWinner(row, i < DESC_ROWS));

  const grants = winners("grant");
  const contracts = winners("contract");

  // Median + total of per-company grant award totals (utah_precedents.total_amount_usd).
  const grantTotals = grants
    .map((g) => g.amountUsd)
    .filter((n): n is number => n != null)
    .sort((a, b) => a - b);
  const mid = grantTotals.length / 2;
  const medianGrantUsd = grantTotals.length
    ? grantTotals.length % 2
      ? grantTotals[Math.floor(mid)]
      : (grantTotals[mid - 1] + grantTotals[mid]) / 2
    : null;
  const totalGrantUsd = grantTotals.reduce((s, n) => s + n, 0);
  const totalContractUsd = contracts.reduce((s, c) => s + (c.amountUsd ?? 0), 0);

  // Grant money by recipient city (source casing varies — group case-insensitively).
  const cityMap = new Map<string, UtahCityTotal>();
  for (const g of grants) {
    const name = (g.city ?? "").trim();
    if (!name || g.amountUsd == null) continue;
    const k = name.toLowerCase();
    const cur = cityMap.get(k) ?? { city: name, totalUsd: 0, winners: 0 };
    cur.totalUsd += g.amountUsd;
    cur.winners += 1;
    cityMap.set(k, cur);
  }
  const topCities = [...cityMap.values()].sort((a, b) => b.totalUsd - a.totalUsd).slice(0, 5);

  // Utah-only programs = opportunities ingested with source='utah'.
  const programs = db
    .prepare(`SELECT id, title FROM opportunities WHERE source = 'utah' ORDER BY title`)
    .all() as UtahProgramRow[];

  // Public navigators. Nucleus Grow leads (Utah's official SBIR/STTR resource
  // partner — same rule utah-intelligence.ts applies), then the rest of the
  // Nucleus Institute, then individual people, then organizations.
  const navigators = (db.prepare(`SELECT * FROM utah_navigators`).all() as Record<string, unknown>[])
    .map((row): UtahNavigatorRow => {
      const contact = parse<{ email?: string; url?: string } | null>(row.public_contact, null);
      return {
        id: row.id as string,
        name: row.name as string,
        organization: row.organization as string,
        title: (row.title as string) ?? null,
        kind: (row.resource_kind as string) ?? "resource",
        topics: parse<string[]>(row.help_topics, []),
        summary: (row.summary as string) ?? null,
        email: contact?.email ?? null,
        url: contact?.url ?? null,
        sourceUrl: (row.source_url as string) ?? null,
      };
    })
    .sort((a, b) => {
      const lead = (n: UtahNavigatorRow) => {
        const hay = `${n.organization} ${n.name} ${n.title ?? ""}`;
        if (/nucleus grow/i.test(hay)) return 3;
        if (/nucleus/i.test(hay)) return 2;
        if (n.kind === "person") return 1;
        return 0;
      };
      return lead(b) - lead(a) || a.organization.localeCompare(b.organization);
    });

  // UTIF microgrant — real DB row (title, url, $3K–$5K floor/ceiling).
  const utifRow = db
    .prepare(`SELECT title, url, award_floor_usd, award_ceiling_usd FROM opportunities WHERE id = 'utah:utif-sbir-microgrant'`)
    .get() as { title: string; url: string | null; award_floor_usd: number | null; award_ceiling_usd: number | null } | undefined;

  const meta = db
    .prepare(`SELECT last_run FROM ingest_meta WHERE source = 'utah_intelligence'`)
    .get() as { last_run: string } | undefined;

  return {
    cachedOn: meta?.last_run ? meta.last_run.slice(0, 10) : null,
    winnersCount: grants.length + contracts.length,
    grantCount: grants.length,
    contractCount: contracts.length,
    medianGrantUsd,
    totalGrantUsd,
    totalContractUsd,
    utahOnlyCount: programs.length,
    topCities,
    grants,
    contracts,
    navigators,
    programs,
    utif: utifRow
      ? { title: utifRow.title, url: utifRow.url, floorUsd: utifRow.award_floor_usd, ceilingUsd: utifRow.award_ceiling_usd }
      : null,
  };
}
