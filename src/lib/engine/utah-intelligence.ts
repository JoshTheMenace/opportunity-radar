// Utah context retrieval. It is intentionally a post-ranking layer: a past
// recipient or local helper should add confidence and next steps, never be
// presented as an open opportunity or allowed to distort the funding ranker.
import { getDb } from "../db";
import type { CompanyProfile, UtahCompanyPath, UtahNavigator, UtahPathContext, UtahPrecedent } from "../types";

type PrecedentRow = Record<string, unknown>;
type NavigatorRow = Record<string, unknown>;
const parse = <T>(value: unknown, fallback: T): T => {
  try { return JSON.parse(String(value ?? "")) as T; } catch { return fallback; }
};
const clean = (value: string | null | undefined) => String(value ?? "").trim();
const key = (value: string | null | undefined) => clean(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

function precedent(row: PrecedentRow): UtahPrecedent {
  return {
    id: row.id as string, pathKind: row.path_kind as "grant" | "contract", company: row.company as string,
    city: (row.city as string) ?? null, website: (row.website as string) ?? null,
    industryTags: parse(row.industry_tags, []), agencies: parse(row.agencies, []), summary: (row.summary as string) ?? null,
    awardCount: Number(row.award_count ?? 0), totalAmountUsd: row.total_amount_usd == null ? null : Number(row.total_amount_usd),
    representativeRecords: parse(row.representative_records, []), publicPeople: parse(row.public_people, []), sourceUrl: (row.source_url as string) ?? null,
  };
}

function buildFtsQuery(profile: CompanyProfile): string | null {
  const terms = [profile.industry, ...profile.technologyKeywords, ...profile.govKeywords]
    .flatMap((value) => clean(value).toLowerCase().split(/[^a-z0-9]+/))
    .filter((value) => value.length >= 4);
  const unique = [...new Set(terms)].slice(0, 8);
  return unique.length ? unique.map((term) => `"${term}"`).join(" OR ") : null;
}

function topPrecedents(profile: CompanyProfile, pathKind: "grant" | "contract"): UtahPrecedent[] {
  const query = buildFtsQuery(profile);
  if (!query) return [];
  const rows = getDb().prepare(`SELECT p.*, bm25(utah_precedents_fts) AS rank
    FROM utah_precedents_fts JOIN utah_precedents p ON p.id = utah_precedents_fts.id
    WHERE utah_precedents_fts MATCH ? AND p.path_kind = ? ORDER BY rank LIMIT 40`).all(query, pathKind) as PrecedentRow[];
  const signals = [profile.industry, ...profile.technologyKeywords, ...profile.govKeywords]
    .flatMap((value) => clean(value).toLowerCase().split(/[^a-z0-9]+/))
    .filter((value) => value.length >= 4);
  return rows.map(precedent).map((item) => {
    const tagText = item.industryTags.join(" ").replaceAll("_", " ");
    const agencyText = item.agencies.join(" ").toLowerCase();
    const score = signals.reduce((sum, signal) => sum + (tagText.includes(signal) ? 4 : 0) + (agencyText.includes(signal) ? 1 : 0), 0);
    return { item, score };
  }).sort((a, b) => b.score - a.score || b.item.awardCount - a.item.awardCount || a.item.company.localeCompare(b.item.company)).slice(0, 3).map(({ item }) => item);
}

function topNavigators(profile: CompanyProfile): UtahNavigator[] {
  const terms = [profile.industry, ...profile.technologyKeywords, ...profile.govKeywords, profile.targetCustomers]
    .map((value) => clean(value).toLowerCase()).filter(Boolean);
  const isFederal = terms.some((value) => /federal|government|defense|contract|procurement/.test(value));
  const isResearch = profile.hasActiveRnD === true || terms.some((value) => /research|university|clinical|prototype|sbir|sttr/.test(value));
  const rows = getDb().prepare("SELECT * FROM utah_navigators").all() as NavigatorRow[];
  return rows.map((row) => {
    const topics = parse<string[]>(row.help_topics, []);
    const haystack = [row.name, row.organization, row.title, row.summary, ...topics].map((value) => clean(value as string).toLowerCase()).join(" ");
    let score = terms.reduce((sum, term) => sum + (term.split(/\W+/).some((word) => word.length >= 4 && haystack.includes(word)) ? 1 : 0), 0);
    if (isFederal && /apex|contract|procurement|federal market/.test(haystack)) score += 4;
    if (isResearch && /nucleus|research|commercialization|sbir|sttr/.test(haystack)) score += 3;
    // Nucleus Grow is Utah's official SBIR/STTR resource partner. Always put
    // its public contacts before the broader directory, then rank by fit.
    const nucleus = /nucleus/i.test(`${row.organization ?? ""} ${row.name ?? ""}`);
    if (nucleus) score += 20;
    return { row, topics, score, nucleus };
  }).sort((a, b) => Number(b.nucleus) - Number(a.nucleus) || b.score - a.score || String(a.row.organization).localeCompare(String(b.row.organization))).slice(0, 4).map(({ row, topics }) => ({
    id: row.id as string, name: row.name as string, organization: row.organization as string, title: (row.title as string) ?? null,
    resourceKind: row.resource_kind as string, helpTopics: topics, summary: (row.summary as string) ?? null,
    publicContact: parse(row.public_contact, null), sourceUrl: (row.source_url as string) ?? null,
  }));
}

function exactCompanyPaths(profile: CompanyProfile): UtahCompanyPath[] {
  if (!profile.name) return [];
  const row = getDb().prepare("SELECT id FROM utah_company_profiles WHERE lower(name) = ?").get(key(profile.name)) as { id: string } | undefined;
  if (!row) return [];
  const rows = getDb().prepare(`SELECT l.*, p.company FROM utah_company_peer_links l
    JOIN utah_precedents p ON p.id = l.precedent_company_id WHERE l.company_profile_id = ?
    ORDER BY l.similarity_score DESC LIMIT 6`).all(row.id) as Array<Record<string, unknown>>;
  return rows.map((link) => ({ pathKind: link.path_kind as "grant" | "contract", company: link.company as string, sharedTags: parse(link.shared_tags, []), explanation: link.explanation as string, representativeRecords: parse(link.representative_records, []) }));
}

export function getUtahContext(profile: CompanyProfile): UtahPathContext {
  return { grantPrecedents: topPrecedents(profile, "grant"), contractPrecedents: topPrecedents(profile, "contract"), navigators: topNavigators(profile), exactCompanyPaths: exactCompanyPaths(profile) };
}
