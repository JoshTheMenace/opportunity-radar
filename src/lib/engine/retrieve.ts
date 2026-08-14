// ============================================================
// Candidate retrieval — SQLite FTS5 only, NO LLM calls.
// Turns a CompanyProfile into a bounded set of Opportunity rows
// for the gates + ranker downstream.
// ============================================================

import { getDb, rowToOpportunity } from "../db";
import type { CompanyProfile, Opportunity } from "../types";

const DEFAULT_LIMIT = 120;
const TERMS_PER_QUERY = 8; // keep each MATCH expression small
const PER_QUERY_LIMIT = 60; // rows pulled per MATCH before merging

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
  const best = new Map<string, { row: Record<string, unknown>; rank: number }>();
  for (const match of buildMatchQueries(profile)) {
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
    .map((e) => rowToOpportunity(e.row));
  const seen = new Set(results.map((o) => o.id));

  const union = (sql: string, param: string) => {
    for (const r of db.prepare(sql).all(param) as Record<string, unknown>[]) {
      const o = rowToOpportunity(r);
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
  return results;
}

/** Fetch one opportunity by id, or null if absent. */
export function getOpportunityById(id: string): Opportunity | null {
  const row = getDb()
    .prepare(`SELECT * FROM opportunities WHERE id = ?`)
    .get(id) as Record<string, unknown> | undefined;
  return row ? rowToOpportunity(row) : null;
}

/** Row counts per source, e.g. { grants_gov: 900, utah: 12 }. */
export function countBySource(): Record<string, number> {
  const rows = getDb()
    .prepare(`SELECT source, COUNT(*) AS n FROM opportunities GROUP BY source`)
    .all() as { source: string; n: number }[];
  return Object.fromEntries(rows.map((r) => [r.source, r.n]));
}
