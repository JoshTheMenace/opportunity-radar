// ============================================================
// Historical-award evidence: USAspending + NIH RePORTER + NSF.
// Called server-side at request time. Every network result is
// cached in evidence_cache (7-day TTL); cache always wins.
// Endpoints/shapes verified in docs/api-notes.md — follow exactly.
// ============================================================

import { getDb } from "../db";
import type { CompanyProfile, Opportunity } from "../types";

export interface EvidenceBundle {
  alnStats: {
    totalAwards: number;
    totalUsd: number;
    medianUsd: number;
    utahCount: number;
  } | null;
  similarAwards: Array<{
    recipient: string;
    amountUsd: number;
    year: number;
    description: string;
    state: string | null;
    link: string | null;
  }>;
  nearbyWinners: Array<{
    org: string;
    city: string;
    amountUsd: number;
    program: string;
    abstract100: string;
  }>;
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 10_000;
const GRANT_TYPE_CODES = ["02", "03", "04", "05"];
const USASPENDING_URL =
  "https://api.usaspending.gov/api/v2/search/spending_by_award/";
const NIH_URL = "https://api.reporter.nih.gov/v2/projects/search";
// Do NOT mix NAICS/PSC fields with CFDA fields (api-notes).
const GRANT_FIELDS = [
  "Award ID",
  "Recipient Name",
  "Award Amount",
  "Start Date",
  "End Date",
  "Description",
  "CFDA Number",
  "Awarding Agency",
  "generated_internal_id",
];

// ---------- evidence_cache (7-day TTL) ----------

function cacheGet<T>(key: string): T | null {
  const row = getDb()
    .prepare("SELECT payload, fetched_at FROM evidence_cache WHERE key = ?")
    .get(key) as { payload: string; fetched_at: string } | undefined;
  if (!row) return null;
  if (Date.now() - Date.parse(row.fetched_at) > TTL_MS) return null;
  return JSON.parse(row.payload) as T;
}

function cachePut(key: string, payload: unknown): void {
  getDb()
    .prepare(
      "INSERT OR REPLACE INTO evidence_cache (key, payload, fetched_at) VALUES (?, ?, ?)",
    )
    .run(key, JSON.stringify(payload), new Date().toISOString());
}

/** Cache-first JSON fetch with a 10s AbortController timeout. */
async function cachedFetchJson<T>(
  key: string,
  url: string,
  init?: RequestInit,
): Promise<T> {
  const hit = cacheGet<T>(key);
  if (hit !== null) return hit;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
    const json = (await res.json()) as T;
    cachePut(key, json);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

function postJson(body: unknown): RequestInit {
  return {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}

// ---------- fiscal-year helpers ----------

/** Federal fiscal year: Oct 1 rolls into next FY. */
function currentFy(): number {
  const d = new Date();
  return d.getUTCMonth() >= 9 ? d.getUTCFullYear() + 1 : d.getUTCFullYear();
}

function last3FyPeriod(): Array<{ start_date: string; end_date: string }> {
  const fy = currentFy();
  return [{ start_date: `${fy - 3}-10-01`, end_date: `${fy}-09-30` }];
}

// ---------- cache keys (exported for the smoke test) ----------

const alnKey = (alns: string[], page: number) =>
  `usaspending:aln:${alns.join(",")}:fy${currentFy()}:p${page}`;
const alnUtKey = (alns: string[]) =>
  `usaspending:aln:${alns.join(",")}:fy${currentFy()}:UT`;
const kwKey = (kws: string[]) =>
  `usaspending:kw:${kws.join("|").toLowerCase()}:UT:fy${currentFy()}`;
const nihKey = (state: string) =>
  `nih:${state}:fy${currentFy() - 1}-${currentFy()}`;
const nsfKey = (state: string, kw: string) =>
  `nsf:${state}:${kw.toLowerCase()}`;

function techKeywords(profile: CompanyProfile): string[] {
  return profile.technologyKeywords
    .map((k) => k.trim())
    .filter((k) => k.length >= 3)
    .slice(0, 3);
}

/** First-page keys getEvidence will read for this opp/profile (for tests). */
export function evidenceCacheKeys(
  opp: Opportunity,
  profile: CompanyProfile,
): string[] {
  const keys: string[] = [];
  if (opp.alnNumbers.length > 0) {
    const alns = [...opp.alnNumbers].sort();
    keys.push(alnKey(alns, 1), alnUtKey(alns));
  }
  const kws = techKeywords(profile);
  if (kws.length > 0) keys.push(kwKey(kws));
  const state = profile.location?.state ?? "UT";
  keys.push(nihKey(state));
  if (kws[0]) keys.push(nsfKey(state, kws[0]));
  return keys;
}

// ---------- response shapes (only fields we read) ----------

interface UsaAward {
  "Recipient Name"?: string | null;
  "Award Amount"?: number | null;
  "Start Date"?: string | null;
  Description?: string | null;
  generated_internal_id?: string | null;
}
interface UsaResponse {
  results?: UsaAward[];
  page_metadata?: { hasNext?: boolean };
}
interface NihProject {
  organization?: { org_name?: string | null; org_city?: string | null } | null;
  award_amount?: number | null;
  activity_code?: string | null;
  abstract_text?: string | null;
}
interface NsfAward {
  awardeeName?: string;
  awardeeCity?: string;
  fundsObligatedAmt?: string;
  abstractText?: string;
}

// ---------- the three evidence parts ----------

async function fetchAlnStats(
  opp: Opportunity,
): Promise<EvidenceBundle["alnStats"]> {
  if (opp.alnNumbers.length === 0) return null;
  const alns = [...opp.alnNumbers].sort();
  const filters = {
    award_type_codes: GRANT_TYPE_CODES,
    program_numbers: alns,
    time_period: last3FyPeriod(),
  };
  const amounts: number[] = [];
  for (let page = 1; page <= 2; page++) {
    const resp = await cachedFetchJson<UsaResponse>(
      alnKey(alns, page),
      USASPENDING_URL,
      postJson({
        filters,
        fields: GRANT_FIELDS,
        limit: 100,
        page,
        sort: "Award Amount",
        order: "desc",
      }),
    );
    const rows = resp.results ?? [];
    for (const r of rows) amounts.push(Number(r["Award Amount"] ?? 0));
    if (rows.length < 100 || !resp.page_metadata?.hasNext) break;
  }
  const utResp = await cachedFetchJson<UsaResponse>(
    alnUtKey(alns),
    USASPENDING_URL,
    postJson({
      filters: {
        ...filters,
        recipient_locations: [{ country: "USA", state: "UT" }],
      },
      fields: GRANT_FIELDS,
      limit: 100,
      page: 1,
      sort: "Award Amount",
      order: "desc",
    }),
  );
  const sorted = [...amounts].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const medianUsd =
    sorted.length === 0
      ? 0
      : sorted.length % 2
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
  return {
    totalAwards: amounts.length,
    totalUsd: amounts.reduce((s, n) => s + n, 0),
    medianUsd,
    utahCount: (utResp.results ?? []).length,
  };
}

async function fetchSimilarAwards(
  profile: CompanyProfile,
): Promise<EvidenceBundle["similarAwards"]> {
  const kws = techKeywords(profile);
  if (kws.length === 0) return [];
  const resp = await cachedFetchJson<UsaResponse>(
    kwKey(kws),
    USASPENDING_URL,
    postJson({
      filters: {
        award_type_codes: GRANT_TYPE_CODES,
        keywords: kws,
        recipient_locations: [{ country: "USA", state: "UT" }],
        time_period: last3FyPeriod(),
      },
      fields: GRANT_FIELDS,
      limit: 10,
      page: 1,
      sort: "Award Amount",
      order: "desc",
    }),
  );
  return (resp.results ?? []).map((r) => ({
    recipient: r["Recipient Name"] ?? "Unknown recipient",
    amountUsd: Number(r["Award Amount"] ?? 0),
    year: r["Start Date"] ? Number(r["Start Date"].slice(0, 4)) : 0,
    description: r.Description ?? "",
    state: "UT", // filtered by recipient_locations UT
    link: r.generated_internal_id
      ? `https://www.usaspending.gov/award/${r.generated_internal_id}`
      : null,
  }));
}

function truncateWords(text: string, maxWords: number): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ") + "…";
}

async function fetchNearbyWinners(
  profile: CompanyProfile,
): Promise<EvidenceBundle["nearbyWinners"]> {
  const state = profile.location?.state ?? "UT";
  const fy = currentFy();
  const winners: EvidenceBundle["nearbyWinners"] = [];

  try {
    const resp = await cachedFetchJson<{ results?: NihProject[] }>(
      nihKey(state),
      NIH_URL,
      postJson({
        criteria: {
          org_states: [state],
          fiscal_years: [fy - 1, fy],
          activity_codes: ["R43", "R44"],
        },
        limit: 10,
      }),
    );
    for (const p of resp.results ?? []) {
      winners.push({
        org: p.organization?.org_name ?? "Unknown org",
        city: p.organization?.org_city ?? "",
        amountUsd: Number(p.award_amount ?? 0),
        program: `NIH ${p.activity_code ?? "SBIR"}`,
        abstract100: truncateWords(p.abstract_text ?? "", 100),
      });
    }
  } catch {
    // NIH down — NSF may still contribute.
  }

  try {
    const kw = techKeywords(profile)[0];
    if (kw) {
      const url =
        `https://api.nsf.gov/services/v1/awards.json?awardeeStateCode=${encodeURIComponent(state)}` +
        `&keyword=${encodeURIComponent(kw)}` +
        `&printFields=id,title,awardeeName,awardeeCity,fundsObligatedAmt,date,abstractText`;
      const resp = await cachedFetchJson<{ response?: { award?: NsfAward[] } }>(
        nsfKey(state, kw),
        url,
      );
      for (const a of resp.response?.award ?? []) {
        winners.push({
          org: a.awardeeName ?? "Unknown org",
          city: a.awardeeCity ?? "",
          amountUsd: Number(a.fundsObligatedAmt ?? 0),
          program: "NSF award",
          abstract100: truncateWords(a.abstractText ?? "", 100),
        });
      }
    }
  } catch {
    // NSF down — keep whatever NIH returned.
  }

  return winners.sort((a, b) => b.amountUsd - a.amountUsd).slice(0, 8);
}

// ---------- public API ----------

export async function getEvidence(
  opp: Opportunity,
  profile: CompanyProfile,
): Promise<EvidenceBundle> {
  // Each part is independent: a failed source degrades to null/[] and
  // never breaks the bundle.
  const [alnStats, similarAwards, nearbyWinners] = await Promise.all([
    fetchAlnStats(opp).catch((): EvidenceBundle["alnStats"] => null),
    fetchSimilarAwards(profile).catch(
      (): EvidenceBundle["similarAwards"] => [],
    ),
    fetchNearbyWinners(profile), // internal try/catch per source
  ]);
  return { alnStats, similarAwards, nearbyWinners };
}
