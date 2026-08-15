/**
 * Imports the Utah precedent and navigator JSON resources into radar.db.
 * These tables are contextual evidence, never live opportunities.
 *
 * Run: pnpm tsx scripts/ingest/utah-intelligence.ts
 */
import fs from "fs";
import path from "path";
import { getDb } from "../../src/lib/db";

const root = path.join(process.cwd(), "data", "utah-intelligence");
const importedOn = new Date().toISOString().slice(0, 10);
const read = <T>(file: string): T => JSON.parse(fs.readFileSync(path.join(root, file), "utf8")) as T;
const text = (value: unknown) => String(value ?? "").replace(/\s+/g, " ").trim();
const json = (value: unknown) => JSON.stringify(value ?? []);

type Envelope<T> = { records: T[] };
type Precedent = {
  id: string; company: string; uei?: string | null; city?: string | null; company_website?: string | null;
  profile_icon: unknown; industry_tags?: string[]; agencies?: string[]; technology_summary?: string | null;
  award_count: number; total_award_amount_usd?: number | null; total_obligated_usd?: number | null;
  representative_awards?: unknown[]; representative_contracts?: unknown[]; public_people?: unknown[];
};
type Navigator = {
  id: string; name: string; organization: string; title?: string | null; resource_type?: string | null;
  help_topics?: string[]; profile_summary?: string | null; recommended_for?: string | null;
  public_contact?: unknown; source_url?: string | null; confidence?: string | null;
};
type CompanyProfile = { id: string; name: string; description?: string | null; website?: string | null; sector?: string | null; similarity_tags?: string[]; profile_icon: unknown };
type Peer = { awardee_company_id?: string; contract_company_id?: string; similarity_score: number; shared_industry_tags?: string[]; explanation: string; representative_awards?: unknown[]; representative_contracts?: unknown[] };
type PeerRecord = { company_id: string; sbir_sttr_peers?: Peer[]; federal_contract_peers?: Peer[] };

const grants = read<Envelope<Precedent>>("utah_sbir_sttr_companies.json").records;
const contracts = read<Envelope<Precedent>>("utah_federal_contract_companies.json").records;
const helpers = [
  ...read<Envelope<Navigator>>("utah_funding_helpers.json").records.map((item) => ({ ...item, resourceKind: "person" })),
  ...read<Envelope<Navigator>>("utah_research_commercialization_partners.json").records.map((item) => ({ ...item, resourceKind: "research_partner" })),
  ...read<Envelope<Navigator>>("utah_federal_market_access.json").records.map((item) => ({ ...item, resourceKind: item.resource_type ?? "market_access" })),
];
const profiles = read<Envelope<CompanyProfile>>("utah_company_similarity_index.json").records;
const grantPeers = read<Envelope<PeerRecord>>("utah_company_sbir_sttr_peer_edges.json").records;
const contractPeers = read<Envelope<PeerRecord>>("utah_company_contract_peer_edges.json").records;

const db = getDb();
db.transaction(() => {
  db.exec("DELETE FROM utah_precedents_fts; DELETE FROM utah_precedents; DELETE FROM utah_navigators; DELETE FROM utah_company_profiles; DELETE FROM utah_company_peer_links;");
  const precedentInsert = db.prepare(`INSERT INTO utah_precedents VALUES (@id, @path_kind, @company, @uei, @city, @website, @profile_icon, @industry_tags, @agencies, @summary, @award_count, @total_amount_usd, @representative_records, @public_people, @source_url, @imported_on)`);
  const ftsInsert = db.prepare("INSERT INTO utah_precedents_fts (id, company, search_text) VALUES (?, ?, ?)");
  for (const [pathKind, records] of [["grant", grants], ["contract", contracts]] as const) {
    for (const record of records) {
      const reps = pathKind === "grant" ? record.representative_awards : record.representative_contracts;
      const sourceUrl = (reps?.[0] as { source_url?: string } | undefined)?.source_url
        ?? (pathKind === "grant" ? "https://www.sbir.gov/awards" : "https://www.usaspending.gov/");
      precedentInsert.run({
        id: record.id, path_kind: pathKind, company: record.company, uei: record.uei ?? null, city: record.city ?? null,
        website: record.company_website ?? null, profile_icon: json(record.profile_icon), industry_tags: json(record.industry_tags), agencies: json(record.agencies),
        summary: record.technology_summary ?? (text((reps?.[0] as { description?: string } | undefined)?.description) || null),
        award_count: record.award_count, total_amount_usd: pathKind === "grant" ? record.total_award_amount_usd ?? null : record.total_obligated_usd ?? null,
        representative_records: json(reps), public_people: json(record.public_people), source_url: sourceUrl, imported_on: importedOn,
      });
      ftsInsert.run(record.id, record.company, [record.company, ...(record.industry_tags ?? []), ...(record.agencies ?? []), record.technology_summary, ...(reps ?? []).map((r) => text((r as { title?: string; description?: string }).title ?? (r as { description?: string }).description))].filter(Boolean).join(" "));
    }
  }
  const navigatorInsert = db.prepare("INSERT INTO utah_navigators VALUES (@id, @name, @organization, @title, @resource_kind, @help_topics, @summary, @public_contact, @source_url, @confidence, @imported_on)");
  for (const item of helpers) navigatorInsert.run({ id: item.id, name: item.name, organization: item.organization, title: item.title ?? null, resource_kind: item.resourceKind, help_topics: json(item.help_topics), summary: item.profile_summary ?? item.recommended_for ?? null, public_contact: json(item.public_contact), source_url: item.source_url ?? null, confidence: item.confidence ?? null, imported_on: importedOn });
  const profileInsert = db.prepare("INSERT INTO utah_company_profiles VALUES (@id, @name, @description, @website, @sector, @similarity_tags, @profile_icon, @imported_on)");
  for (const item of profiles) {
    if (!item.name) continue; // two source profiles are intentionally blank placeholders
    profileInsert.run({ ...item, description: item.description ?? null, website: item.website ?? null, sector: item.sector ?? null, similarity_tags: json(item.similarity_tags), profile_icon: json(item.profile_icon), imported_on: importedOn });
  }
  const peerInsert = db.prepare("INSERT INTO utah_company_peer_links VALUES (@company_profile_id, @path_kind, @precedent_company_id, @similarity_score, @shared_tags, @explanation, @representative_records)");
  for (const [pathKind, records, key, idKey] of [["grant", grantPeers, "sbir_sttr_peers", "awardee_company_id"], ["contract", contractPeers, "federal_contract_peers", "contract_company_id"]] as const) {
    for (const record of records) for (const peer of (record[key] ?? [])) peerInsert.run({ company_profile_id: record.company_id, path_kind: pathKind, precedent_company_id: peer[idKey]!, similarity_score: peer.similarity_score, shared_tags: json(peer.shared_industry_tags), explanation: peer.explanation, representative_records: json(pathKind === "grant" ? peer.representative_awards : peer.representative_contracts) });
  }
  db.prepare("INSERT INTO ingest_meta (source, last_run, row_count, notes) VALUES ('utah_intelligence', @last_run, @row_count, @notes) ON CONFLICT(source) DO UPDATE SET last_run=excluded.last_run, row_count=excluded.row_count, notes=excluded.notes").run({ last_run: new Date().toISOString(), row_count: grants.length + contracts.length + helpers.length + profiles.length, notes: "Utah grant and contract precedents, local peers, and public navigator/program routes" });
})();
console.log(`Ingested ${grants.length} grant precedents, ${contracts.length} contract precedents, ${helpers.length} navigator routes, and ${profiles.length} Utah company profiles.`);
