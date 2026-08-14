// Ingest ALL live federal grant opportunities from Grants.gov into SQLite.
// Run: pnpm tsx scripts/ingest/grants-gov.ts [--limit N] [--force]
// See docs/api-notes.md for verified endpoint behavior.

import { getDb, INSERT_OPPORTUNITY_SQL, opportunityToRow } from "../../src/lib/db";
import type { Opportunity, FundingKind } from "../../src/lib/types";

const SEARCH_URL = "https://api.grants.gov/v1/api/search2";
const FETCH_URL = "https://api.grants.gov/v1/api/fetchOpportunity";
const DELAY_MS = 100;

// ---------- API shapes (loose; only fields we use) ----------

interface OppHit {
  id: number | string;
  number: string;
  title: string;
  agencyCode: string;
  agency: string;
  openDate: string; // "MM/DD/YYYY"
  closeDate: string; // may be ""
  oppStatus: string;
  docType: string;
  cfdaList?: string[];
}

interface FetchData {
  id?: number;
  synopsis?: {
    synopsisDesc?: string | null;
    applicantEligibilityDesc?: string | null;
    applicantTypes?: { id?: string; description?: string }[] | null;
    awardCeiling?: string | null; // STRING, may be "none"
    awardFloor?: string | null;
    estimatedFunding?: string | null;
    numberOfAwards?: string | number | null;
    agencyContactName?: string | null;
    agencyContactEmail?: string | null;
    responseDate?: string | null;
    responseDateStr?: string | null; // "2026-10-19-00-00-00"
    postingDate?: string | null;
    postingDateStr?: string | null;
    fundingInstruments?: { id?: string; description?: string }[] | null;
  };
  opportunityPkgs?: { expectedApplicationCount?: number | string | null }[] | null;
  cfdas?: { cfdaNumber?: string | null; programTitle?: string | null }[] | null;
}

// ---------- Parsing helpers ----------

/** Strip HTML tags/entities to plain text. */
function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return html
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6])\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;|&rsquo;|&lsquo;/gi, "'")
    .replace(/&ldquo;|&rdquo;/gi, '"')
    .replace(/&ndash;|&mdash;/gi, "-")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** Parse "$1,000,000" / "1000000" / "none" / null → number | null. */
function parseUsd(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const n = Number(v.replace(/[$,\s]/g, ""));
  return Number.isFinite(n) && v.trim() !== "" && !/none/i.test(v) ? n : null;
}

function parseIntOrNull(v: string | number | null | undefined): number | null {
  const n = parseUsd(v);
  return n == null ? null : Math.round(n);
}

/** "MM/DD/YYYY" or "2026-10-19-00-00-00" or "yyyy-mm-dd" → "yyyy-mm-dd" | null. */
function toIsoDate(v: string | null | undefined): string | null {
  if (!v) return null;
  const s = v.trim();
  let m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1]}-${m[2]}`;
  m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  return null;
}

// Small-business friendly = eligibility codes ∩ {22,23,25,99} ≠ ∅; empty = unknown.
const SB_CODES = new Set(["22", "23", "25", "99"]);

function deriveOpenToSmallBusiness(codes: string[]): boolean | null {
  if (codes.length === 0) return null;
  return codes.some((c) => SB_CODES.has(c));
}

function deriveKind(hit: OppHit, data: FetchData): FundingKind {
  if (/SBIR|STTR/i.test(`${hit.title} ${hit.number}`)) return "sbir_sttr";
  const instruments = data.synopsis?.fundingInstruments ?? [];
  const text = instruments.map((i) => `${i.id ?? ""} ${i.description ?? ""}`).join(" ");
  if (/cooperative/i.test(text) || /\bCA\b/.test(text)) return "cooperative_agreement";
  return "grant";
}

function toOpportunity(hit: OppHit, data: FetchData): Opportunity {
  const syn = data.synopsis ?? {};
  const codes = (syn.applicantTypes ?? [])
    .map((t) => t.id ?? "")
    .filter((c) => c !== "");
  const cfdas = (data.cfdas ?? [])
    .map((c) => c.cfdaNumber ?? "")
    .filter((c) => c !== "");
  const alnNumbers = cfdas.length > 0 ? cfdas : (hit.cfdaList ?? []).filter(Boolean);
  const expectedApplications =
    (data.opportunityPkgs ?? [])
      .map((p) => parseIntOrNull(p.expectedApplicationCount))
      .find((n) => n != null) ?? null;
  const status =
    hit.oppStatus === "posted" || hit.oppStatus === "forecasted"
      ? hit.oppStatus
      : "unknown";

  return {
    id: `grants_gov:${hit.id}`,
    source: "grants_gov",
    kind: deriveKind(hit, data),
    title: hit.title,
    agency: hit.agency || hit.agencyCode || "Unknown agency",
    agencyCode: hit.agencyCode || null,
    description: stripHtml(syn.synopsisDesc),
    alnNumbers,
    eligibilityCodes: codes,
    eligibilityText: stripHtml(syn.applicantEligibilityDesc) || null,
    openToSmallBusiness: deriveOpenToSmallBusiness(codes),
    awardFloorUsd: parseUsd(syn.awardFloor),
    awardCeilingUsd: parseUsd(syn.awardCeiling),
    estimatedTotalUsd: parseUsd(syn.estimatedFunding),
    expectedAwards: parseIntOrNull(syn.numberOfAwards),
    expectedApplications,
    openDate: toIsoDate(syn.postingDateStr) ?? toIsoDate(syn.postingDate) ?? toIsoDate(hit.openDate),
    closeDate: toIsoDate(syn.responseDateStr) ?? toIsoDate(syn.responseDate) ?? toIsoDate(hit.closeDate),
    status,
    url: `https://grants.gov/search-results-detail/${hit.id}`,
    contactName: syn.agencyContactName?.trim() || null,
    contactEmail: syn.agencyContactEmail?.trim() || null,
    raw: JSON.stringify({ hit, synopsis: syn, cfdas: data.cfdas ?? [] }),
  };
}

// ---------- Fetching ----------

async function postJson<T>(url: string, body: object): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  return (await res.json()) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function searchAll(): Promise<OppHit[]> {
  // Omit sortBy (bad sortBy silently returns empty oppHits). rows is uncapped.
  const body = { keyword: "", oppStatuses: "forecasted|posted", rows: 5000, startRecordNum: 0 };
  const json = await postJson<{ data?: { hitCount?: number; oppHits?: OppHit[] } }>(SEARCH_URL, body);
  const hits = json.data?.oppHits ?? [];
  console.log(`search2: hitCount=${json.data?.hitCount ?? "?"}, got ${hits.length} hits`);
  return hits;
}

// ---------- Main ----------

async function main() {
  const args = process.argv.slice(2);
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx >= 0 ? Number(args[limitIdx + 1]) : Infinity;
  const force = args.includes("--force");

  const db = getDb();
  const existing = new Set(
    (db.prepare("SELECT id FROM opportunities WHERE source = 'grants_gov'").all() as { id: string }[])
      .map((r) => r.id),
  );
  console.log(`${existing.size} grants_gov rows already in DB${force ? " (--force: refetching all)" : ""}`);

  let hits = await searchAll();
  if (!force) hits = hits.filter((h) => !existing.has(`grants_gov:${h.id}`));
  if (Number.isFinite(limit)) hits = hits.slice(0, limit);
  console.log(`fetching details for ${hits.length} opportunities...`);

  const stmt = db.prepare(INSERT_OPPORTUNITY_SQL);
  const insertOne = db.transaction((opp: Opportunity) => {
    stmt.run(opportunityToRow(opp));
  });

  let ok = 0;
  let failed = 0;
  for (let i = 0; i < hits.length; i++) {
    const hit = hits[i];
    try {
      const json = await postJson<{ data?: FetchData }>(FETCH_URL, { opportunityId: Number(hit.id) });
      if (!json.data?.id) throw new Error("missing data.id (bad opportunity id)");
      insertOne(toOpportunity(hit, json.data));
      ok++;
    } catch (err) {
      failed++;
      console.error(`  FAIL ${hit.id} "${hit.title}": ${err instanceof Error ? err.message : err}`);
    }
    if ((i + 1) % 50 === 0) console.log(`  ${i + 1}/${hits.length} (ok=${ok}, failed=${failed})`);
    await sleep(DELAY_MS);
  }

  const rowCount = (
    db.prepare("SELECT COUNT(*) AS n FROM opportunities WHERE source = 'grants_gov'").get() as { n: number }
  ).n;
  db.prepare(
    `INSERT OR REPLACE INTO ingest_meta (source, last_run, row_count, notes)
     VALUES ('grants_gov', ?, ?, ?)`,
  ).run(new Date().toISOString(), rowCount, `inserted=${ok} failed=${failed} skipped_existing=${existing.size}`);

  console.log(`done: inserted ${ok}, failed ${failed}, total grants_gov rows in DB: ${rowCount}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
