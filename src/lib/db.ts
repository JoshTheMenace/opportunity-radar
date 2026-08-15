import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

// Single SQLite database for all cached federal data.
// Ingest scripts write it; the engine only reads it.
const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "radar.db");

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  fs.mkdirSync(DATA_DIR, { recursive: true });
  db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  migrate(db);
  return db;
}

function migrate(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS opportunities (
      id TEXT PRIMARY KEY,             -- "<source>:<native id>"
      source TEXT NOT NULL,            -- grants_gov | assistance_listing | sbir | procurement | utah
      kind TEXT NOT NULL,              -- grant | loan | sbir_sttr | procurement | ...
      title TEXT NOT NULL,
      agency TEXT NOT NULL,
      agency_code TEXT,
      description TEXT NOT NULL,       -- plain text, HTML stripped
      aln_numbers TEXT NOT NULL DEFAULT '[]',        -- JSON array
      eligibility_codes TEXT NOT NULL DEFAULT '[]',  -- JSON array
      eligibility_text TEXT,
      open_to_small_business INTEGER,  -- 1/0/NULL
      award_floor_usd REAL,
      award_ceiling_usd REAL,
      estimated_total_usd REAL,
      expected_awards INTEGER,
      expected_applications INTEGER,
      open_date TEXT,                  -- ISO yyyy-mm-dd
      close_date TEXT,
      status TEXT NOT NULL DEFAULT 'unknown',
      url TEXT,
      contact_name TEXT,
      contact_email TEXT,
      raw TEXT
    );

    -- Full-text search over title/description/agency for retrieval.
    CREATE VIRTUAL TABLE IF NOT EXISTS opportunities_fts USING fts5(
      id UNINDEXED, title, description, agency,
      content='opportunities', content_rowid='rowid'
    );

    CREATE TRIGGER IF NOT EXISTS opp_ai AFTER INSERT ON opportunities BEGIN
      INSERT INTO opportunities_fts(rowid, id, title, description, agency)
      VALUES (new.rowid, new.id, new.title, new.description, new.agency);
    END;
    CREATE TRIGGER IF NOT EXISTS opp_ad AFTER DELETE ON opportunities BEGIN
      INSERT INTO opportunities_fts(opportunities_fts, rowid, id, title, description, agency)
      VALUES ('delete', old.rowid, old.id, old.title, old.description, old.agency);
    END;
    CREATE TRIGGER IF NOT EXISTS opp_au AFTER UPDATE ON opportunities BEGIN
      INSERT INTO opportunities_fts(opportunities_fts, rowid, id, title, description, agency)
      VALUES ('delete', old.rowid, old.id, old.title, old.description, old.agency);
      INSERT INTO opportunities_fts(rowid, id, title, description, agency)
      VALUES (new.rowid, new.id, new.title, new.description, new.agency);
    END;

    -- Cached historical-award evidence (filled lazily by the evidence module).
    CREATE TABLE IF NOT EXISTS evidence_cache (
      key TEXT PRIMARY KEY,            -- e.g. "usaspending:aln:93.310:UT"
      payload TEXT NOT NULL,           -- JSON
      fetched_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ingest_meta (
      source TEXT PRIMARY KEY,
      last_run TEXT NOT NULL,
      row_count INTEGER NOT NULL,
      notes TEXT
    );

    -- Utah intelligence is deliberately separate from live opportunities.
    -- These records supply precedent and routing context after an opportunity
    -- is ranked; they must never be mistaken for an open funding opportunity.
    CREATE TABLE IF NOT EXISTS utah_precedents (
      id TEXT PRIMARY KEY,
      path_kind TEXT NOT NULL,         -- grant | contract
      company TEXT NOT NULL,
      uei TEXT,
      city TEXT,
      website TEXT,
      profile_icon TEXT NOT NULL,
      industry_tags TEXT NOT NULL,
      agencies TEXT NOT NULL,
      summary TEXT,
      award_count INTEGER NOT NULL,
      total_amount_usd REAL,
      representative_records TEXT NOT NULL,
      public_people TEXT NOT NULL,
      source_url TEXT,
      imported_on TEXT NOT NULL
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS utah_precedents_fts USING fts5(
      id UNINDEXED, company, search_text
    );

    CREATE TABLE IF NOT EXISTS utah_navigators (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      organization TEXT NOT NULL,
      title TEXT,
      resource_kind TEXT NOT NULL,     -- person | program | market_access | research_partner
      help_topics TEXT NOT NULL,
      summary TEXT,
      public_contact TEXT NOT NULL,
      source_url TEXT,
      confidence TEXT,
      imported_on TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS utah_company_profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      website TEXT,
      sector TEXT,
      similarity_tags TEXT NOT NULL,
      profile_icon TEXT NOT NULL,
      imported_on TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS utah_company_peer_links (
      company_profile_id TEXT NOT NULL,
      path_kind TEXT NOT NULL,         -- grant | contract
      precedent_company_id TEXT NOT NULL,
      similarity_score REAL NOT NULL,
      shared_tags TEXT NOT NULL,
      explanation TEXT NOT NULL,
      representative_records TEXT NOT NULL,
      PRIMARY KEY (company_profile_id, path_kind, precedent_company_id)
    );
  `);
}

// ---------- Row mapping helpers (shared by ingest + engine) ----------

import type { Opportunity } from "./types";

export function rowToOpportunity(r: Record<string, unknown>): Opportunity {
  return {
    id: r.id as string,
    source: r.source as Opportunity["source"],
    kind: r.kind as Opportunity["kind"],
    title: r.title as string,
    agency: r.agency as string,
    agencyCode: (r.agency_code as string) ?? null,
    description: r.description as string,
    alnNumbers: JSON.parse((r.aln_numbers as string) || "[]"),
    eligibilityCodes: JSON.parse((r.eligibility_codes as string) || "[]"),
    eligibilityText: (r.eligibility_text as string) ?? null,
    openToSmallBusiness:
      r.open_to_small_business == null ? null : r.open_to_small_business === 1,
    awardFloorUsd: (r.award_floor_usd as number) ?? null,
    awardCeilingUsd: (r.award_ceiling_usd as number) ?? null,
    estimatedTotalUsd: (r.estimated_total_usd as number) ?? null,
    expectedAwards: (r.expected_awards as number) ?? null,
    expectedApplications: (r.expected_applications as number) ?? null,
    openDate: (r.open_date as string) ?? null,
    closeDate: (r.close_date as string) ?? null,
    status: (r.status as Opportunity["status"]) ?? "unknown",
    url: (r.url as string) ?? null,
    contactName: (r.contact_name as string) ?? null,
    contactEmail: (r.contact_email as string) ?? null,
    raw: (r.raw as string) ?? null,
  };
}

// UPSERT (not INSERT OR REPLACE): REPLACE deletes+reinserts the row without
// firing the AFTER UPDATE trigger, which corrupts the external-content FTS
// index. ON CONFLICT DO UPDATE keeps the rowid so opp_au fires correctly.
export const INSERT_OPPORTUNITY_SQL = `
  INSERT INTO opportunities (
    id, source, kind, title, agency, agency_code, description,
    aln_numbers, eligibility_codes, eligibility_text, open_to_small_business,
    award_floor_usd, award_ceiling_usd, estimated_total_usd,
    expected_awards, expected_applications,
    open_date, close_date, status, url, contact_name, contact_email, raw
  ) VALUES (
    @id, @source, @kind, @title, @agency, @agency_code, @description,
    @aln_numbers, @eligibility_codes, @eligibility_text, @open_to_small_business,
    @award_floor_usd, @award_ceiling_usd, @estimated_total_usd,
    @expected_awards, @expected_applications,
    @open_date, @close_date, @status, @url, @contact_name, @contact_email, @raw
  ) ON CONFLICT(id) DO UPDATE SET
    source=excluded.source, kind=excluded.kind, title=excluded.title,
    agency=excluded.agency, agency_code=excluded.agency_code,
    description=excluded.description, aln_numbers=excluded.aln_numbers,
    eligibility_codes=excluded.eligibility_codes,
    eligibility_text=excluded.eligibility_text,
    open_to_small_business=excluded.open_to_small_business,
    award_floor_usd=excluded.award_floor_usd,
    award_ceiling_usd=excluded.award_ceiling_usd,
    estimated_total_usd=excluded.estimated_total_usd,
    expected_awards=excluded.expected_awards,
    expected_applications=excluded.expected_applications,
    open_date=excluded.open_date, close_date=excluded.close_date,
    status=excluded.status, url=excluded.url,
    contact_name=excluded.contact_name, contact_email=excluded.contact_email,
    raw=excluded.raw`;

export function opportunityToRow(o: Opportunity): Record<string, unknown> {
  return {
    id: o.id,
    source: o.source,
    kind: o.kind,
    title: o.title,
    agency: o.agency,
    agency_code: o.agencyCode,
    description: o.description,
    aln_numbers: JSON.stringify(o.alnNumbers),
    eligibility_codes: JSON.stringify(o.eligibilityCodes),
    eligibility_text: o.eligibilityText,
    open_to_small_business:
      o.openToSmallBusiness == null ? null : o.openToSmallBusiness ? 1 : 0,
    award_floor_usd: o.awardFloorUsd,
    award_ceiling_usd: o.awardCeilingUsd,
    estimated_total_usd: o.estimatedTotalUsd,
    expected_awards: o.expectedAwards,
    expected_applications: o.expectedApplications,
    open_date: o.openDate,
    close_date: o.closeDate,
    status: o.status,
    url: o.url,
    contact_name: o.contactName,
    contact_email: o.contactEmail,
    raw: o.raw,
  };
}
