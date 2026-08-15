// ============================================================
// Candidate retrieval — SQLite FTS5 only, NO LLM calls.
// Turns a CompanyProfile into a bounded set of Opportunity rows
// for the gates + ranker downstream.
// ============================================================

import { getDb, rowToOpportunity } from "../db";
import type { CompanyProfile, Opportunity } from "../types";

/** Sentinel-value hygiene at the read boundary. Sources encode "not
 *  specified" as $0 (there is no such thing as a $0 award ceiling), and some
 *  "ceilings" are program-wide totals or data errors (this DB has $108T).
 *  A null renders downstream as "not published"; an absurd figure renders as
 *  data. Everything the engine reads passes through here. */
const PLAUSIBLE_AWARD_MAX_USD = 100_000_000;

export function sanitizeOpportunity(o: Opportunity): Opportunity {
  const clean = (n: number | null) =>
    n == null || n <= 0 || n > PLAUSIBLE_AWARD_MAX_USD ? null : n;
  const ceiling = clean(o.awardCeilingUsd);
  let floor = clean(o.awardFloorUsd);
  if (floor != null && ceiling != null && floor > ceiling) floor = null; // inconsistent source data
  if (ceiling === o.awardCeilingUsd && floor === o.awardFloorUsd) return o;
  return { ...o, awardCeilingUsd: ceiling, awardFloorUsd: floor };
}

/** rowToOpportunity + sentinel hygiene — the only mapper this module uses. */
function toOpportunity(row: Record<string, unknown>): Opportunity {
  return sanitizeOpportunity(rowToOpportunity(row));
}

const DEFAULT_LIMIT = 120;
const TERMS_PER_QUERY = 8; // keep each MATCH expression small
const PER_QUERY_LIMIT = 60; // rows pulled per MATCH before merging
const PER_AGENCY_SEATS = 5; // reserved candidate seats per major funder

/** Major federal funders (agency LIKE patterns, verified against the DB).
 *  Each family gets up to PER_AGENCY_SEATS reserved seats in the candidate
 *  set so the ranker — not keyword luck against a 120-row cap — decides fit. */
const AGENCY_FAMILIES: string[][] = [
  ["%science foundation%"], // NSF
  ["%energy, department of%", "%department of energy%", "%projects agency energy%", "%energy technology laboratory%"], // DOE
  ["%national institutes of health%"], // NIH
  ["%health and human services%"], // HHS
  ["%defense%", "%air force%", "%army%", "%navy%", "%darpa%"], // DoD
  ["%aeronautics%"], // NASA
  ["%environmental protection%"], // EPA
  ["%homeland%"], // DHS
  ["%small business administration%"], // SBA
  ["%housing and urban development%", "%community%"], // HUD / community programs
  ["%agriculture%"], // USDA
];

/**
 * Make a term safe for fts5: strip all query-syntax characters
 * (quotes, parens, *, ^, :, etc.) and wrap the remainder in double
 * quotes so multi-word terms match as a phrase.
 */
function sanitizeTerm(term: string): string | null {
  const cleaned = term
    .replace(/[^A-Za-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? `"${cleaned}"` : null;
}

/** Collect profile terms and chunk them into OR-grouped MATCH queries. */
function buildMatchQueries(profile: CompanyProfile): string[] {
  const raw = [
    ...profile.technologyKeywords,
    ...profile.govKeywords,
    ...(profile.industry ? [profile.industry] : []),
  ];
  const seen = new Set<string>();
  const terms: string[] = [];
  for (const t of raw) {
    const s = sanitizeTerm(t);
    if (s && !seen.has(s.toLowerCase())) {
      seen.add(s.toLowerCase());
      terms.push(s);
    }
  }
  const queries: string[] = [];
  for (let i = 0; i < terms.length; i += TERMS_PER_QUERY) {
    queries.push(terms.slice(i, i + TERMS_PER_QUERY).join(" OR "));
  }
  return queries;
}

/** Loose single-word variant of the profile queries. Used only for the
 *  agency reserved-seat pass: quoted phrases ("advanced manufacturing")
 *  often miss an agency's own wording, and the agency filter + per-family
 *  seat cap already bound the extra noise. */
function buildWordQueries(profile: CompanyProfile): string[] {
  const words = new Set<string>();
  const raw = [
    ...profile.technologyKeywords,
    ...profile.govKeywords,
    ...(profile.industry ? [profile.industry] : []),
  ];
  for (const t of raw) {
    for (const w of t.toLowerCase().split(/[^a-z0-9]+/)) {
      if (w.length >= 4) words.add(`"${w}"`);
    }
  }
  const terms = [...words];
  const queries: string[] = [];
  for (let i = 0; i < terms.length; i += TERMS_PER_QUERY) {
    queries.push(terms.slice(i, i + TERMS_PER_QUERY).join(" OR "));
  }
  return queries;
}

/**
 * Retrieve candidate opportunities for a profile.
 * - bm25-ranked FTS matches (best rank kept across queries), capped at
 *   `opts.limit ?? 120`
 * - plus ALL source="utah" rows (small set)
 * - plus ALL kind="sbir_sttr" rows unless hasActiveRnD === false
 * Includes every status; deadline/eligibility gates filter later.
 */
export function retrieveCandidates(
  profile: CompanyProfile,
  opts?: { limit?: number },
): Opportunity[] {
  const limit = opts?.limit ?? DEFAULT_LIMIT;
  const db = getDb();

  const stmt = db.prepare(
    `SELECT o.*, bm25(opportunities_fts) AS fts_rank
     FROM opportunities_fts
     JOIN opportunities o ON o.rowid = opportunities_fts.rowid
     WHERE opportunities_fts MATCH ?
     ORDER BY fts_rank
     LIMIT ?`,
  );

  // Merge across queries, keeping the best (lowest) bm25 rank per id.
  const queries = buildMatchQueries(profile);
  const best = new Map<string, { row: Record<string, unknown>; rank: number }>();
  for (const match of queries) {
    let rows: Record<string, unknown>[];
    try {
      rows = stmt.all(match, PER_QUERY_LIMIT) as Record<string, unknown>[];
    } catch {
      continue; // defensive: a bad MATCH should never sink retrieval
    }
    for (const r of rows) {
      const id = r.id as string;
      const rank = r.fts_rank as number;
      const prev = best.get(id);
      if (!prev || rank < prev.rank) best.set(id, { row: r, rank });
    }
  }

  const results = [...best.values()]
    .sort((a, b) => a.rank - b.rank)
    .slice(0, limit)
    .map((e) => toOpportunity(e.row));
  const seen = new Set(results.map((o) => o.id));

  const union = (sql: string, param: string) => {
    for (const r of db.prepare(sql).all(param) as Record<string, unknown>[]) {
      const o = toOpportunity(r);
      if (!seen.has(o.id)) {
        seen.add(o.id);
        results.push(o);
      }
    }
  };
  union(`SELECT * FROM opportunities WHERE source = ?`, "utah");
  if (profile.hasActiveRnD !== false) {
    union(`SELECT * FROM opportunities WHERE kind = ?`, "sbir_sttr");
  }

  // Reserved seats per major funder: rerun the profile queries (phrase +
  // loose word form) filtered to each agency family and union in its best
  // few hits, so relevant NSF/DOE/community/etc. programs can't be crowded
  // out of the global top-N.
  const agencyQueries = [...queries, ...buildWordQueries(profile)];
  for (const patterns of AGENCY_FAMILIES) {
    const where = patterns.map(() => "o.agency LIKE ?").join(" OR ");
    const agencyStmt = db.prepare(
      `SELECT o.*, bm25(opportunities_fts) AS fts_rank
       FROM opportunities_fts
       JOIN opportunities o ON o.rowid = opportunities_fts.rowid
       WHERE opportunities_fts MATCH ? AND (${where})
       ORDER BY fts_rank
       LIMIT ?`,
    );
    const bestAgency = new Map<string, { row: Record<string, unknown>; rank: number }>();
    for (const match of agencyQueries) {
      let rows: Record<string, unknown>[];
      try {
        rows = agencyStmt.all(match, ...patterns, PER_AGENCY_SEATS) as Record<string, unknown>[];
      } catch {
        continue;
      }
      for (const r of rows) {
        const id = r.id as string;
        const rank = r.fts_rank as number;
        const prev = bestAgency.get(id);
        if (!prev || rank < prev.rank) bestAgency.set(id, { row: r, rank });
      }
    }
    for (const e of [...bestAgency.values()]
      .sort((a, b) => a.rank - b.rank)
      .slice(0, PER_AGENCY_SEATS)) {
      const o = toOpportunity(e.row);
      if (!seen.has(o.id)) {
        seen.add(o.id);
        results.push(o);
      }
    }
  }
  return results;
}

/** Fetch one opportunity by id, or null if absent. */
export function getOpportunityById(id: string): Opportunity | null {
  const row = getDb()
    .prepare(`SELECT * FROM opportunities WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? toOpportunity(row) : null;
}

/** Oldest source refresh (ISO date) — the honest "data current as of" stamp:
 *  every source has been refreshed since this moment. Null if no meta yet. */
export function corpusRefreshedAt(): string | null {
  try {
    const row = getDb().prepare(`SELECT MIN(last_run) AS t FROM ingest_meta`).get() as
      | { t: string | null }
      | undefined;
    return row?.t ?? null;
  } catch {
    return null; // table absent on fresh checkouts — freshness is optional
  }
}

/** Row counts per source, e.g. { grants_gov: 900, utah: 12 }. */
export function countBySource(): Record<string, number> {
  const rows = getDb()
    .prepare(`SELECT source, COUNT(*) AS n FROM opportunities GROUP BY source`)
    .all() as { source: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.source, r.n]));
}
