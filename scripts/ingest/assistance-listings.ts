// ============================================================
// Ingest: SAM.gov Assistance Listings (full federal catalog).
// Downloads the newest weekly CSV (~2,864 standing programs:
// grants, loans, insurance, training...) and loads it into SQLite.
//
// Run:  pnpm tsx scripts/ingest/assistance-listings.ts [--fresh]
//   --fresh  re-download the CSV even if data/assistance-listings.csv exists
// ============================================================

import fs from "node:fs";
import path from "node:path";
import { getDb, INSERT_OPPORTUNITY_SQL, opportunityToRow } from "../../src/lib/db";
import type { FundingKind, Opportunity } from "../../src/lib/types";

const CSV_PATH = path.join(process.cwd(), "data", "assistance-listings.csv");
const API_BASE = "https://sam.gov/api/prod/fileextractservices/v1/api";
// sam.gov blocks default fetch UAs; use a desktop browser UA (see docs/api-notes.md)
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// ---------- Download ----------

/** Find the S3 key of the newest weekly CSV, checking this month then walking back. */
async function discoverNewestKey(): Promise<string> {
  const now = new Date();
  for (let back = 0; back < 6; back++) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const domain = `Assistance Listings/datagov/${d.getFullYear()}/${mm}-${MONTHS[d.getMonth()]}`;
    const res = await fetch(`${API_BASE}/listfiles?domain=${encodeURIComponent(domain)}`, {
      headers: { "User-Agent": UA },
    });
    if (!res.ok) continue;
    const json = (await res.json()) as {
      _embedded?: { customS3ObjectSummaryList?: { key: string }[] };
    };
    const keys = (json._embedded?.customS3ObjectSummaryList ?? [])
      .map((f) => f.key)
      .filter((k) => /WEEKLY_\d{8}\.csv$/.test(k))
      .sort(); // filenames end in YYYYMMDD, so lexicographic = chronological
    if (keys.length > 0) return keys[keys.length - 1];
  }
  throw new Error("No weekly Assistance Listings CSV found in the last 6 months");
}

async function ensureCsv(fresh: boolean): Promise<void> {
  if (!fresh && fs.existsSync(CSV_PATH) && fs.statSync(CSV_PATH).size > 0) {
    console.log(`Using cached CSV: ${CSV_PATH}`);
    return;
  }
  const key = await discoverNewestKey();
  console.log(`Downloading ${key} ...`);
  // encodeURI keeps "/" but escapes spaces; fetch follows redirects by default
  const res = await fetch(`${API_BASE}/download/${encodeURI(key)}?privacy=Public`, {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`Download failed: HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.mkdirSync(path.dirname(CSV_PATH), { recursive: true });
  fs.writeFileSync(CSV_PATH, buf);
  console.log(`Saved ${(buf.length / 1e6).toFixed(1)}MB to ${CSV_PATH}`);
}

// ---------- CSV parsing (state machine; handles quoted multiline fields) ----------

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'; // escaped quote
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === "")); // drop blank lines
}

// ---------- Field mapping ----------

/** "Types of Assistance (060)" → FundingKind. Multi-valued (";"-separated); best kind wins. */
function mapKind(typesText: string, titleAndObjectives = ""): FundingKind {
  // SBIR/STTR programs are typed as plain grants in the catalog; detect them
  // from the title/objectives so they hit the SBIR gates (takes precedence).
  if (
    /\bSBIR\b|\bSTTR\b|small business innovation research|small business technology transfer/i.test(
      titleAndObjectives,
    )
  ) {
    return "sbir_sttr";
  }
  const kinds = typesText
    .toUpperCase()
    .split(";")
    .map((t): FundingKind => {
      if (t.includes("LOAN")) return "loan";
      if (t.trim().startsWith("COOPERATIVE")) return "cooperative_agreement";
      if (t.includes("GRANT")) return "grant";
      if (t.includes("COOPERATIVE AGREEMENT")) return "cooperative_agreement";
      if (t.includes("INSURANCE")) return "other";
      if (/TRAINING|ADVISORY|COUNSELING|SERVICE|TECHNICAL INFORMATION/.test(t)) return "services";
      return "other";
    });
  const priority: FundingKind[] = ["grant", "cooperative_agreement", "loan", "services", "other"];
  for (const p of priority) if (kinds.includes(p)) return p;
  return "other";
}

/** Extract dollar amounts from free text like "$15,000 to $1.5M. Average $200,000". */
function parseDollars(text: string): number[] {
  const out: number[] = [];
  const re = /\$\s*(\d[\d,]*(?:\.\d+)?)\s*(thousand|million|billion|[kmb])?\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = parseFloat(m[1].replace(/,/g, ""));
    if (!isFinite(n) || n <= 0) continue;
    const suffix = (m[2] ?? "").toLowerCase();
    const mult =
      suffix === "k" || suffix === "thousand" ? 1e3
      : suffix === "m" || suffix === "million" ? 1e6
      : suffix === "b" || suffix === "billion" ? 1e9
      : 1;
    out.push(n * mult);
  }
  return out;
}

function parseRange(rangeText: string): { floor: number | null; ceiling: number | null } {
  const amounts = parseDollars(rangeText);
  if (amounts.length === 0) return { floor: null, ceiling: null };
  if (amounts.length === 1) return { floor: null, ceiling: amounts[0] };
  return { floor: Math.min(...amounts), ceiling: Math.max(...amounts) };
}

function deriveOpenToSmallBusiness(elig: string | null): boolean | null {
  if (!elig) return null;
  const t = elig.toLowerCase();
  // Nonprofit trap: "profit organization" is a substring of "Nonprofit
  // organization", so strip nonprofit phrases BEFORE testing for positives —
  // otherwise nonprofit-only programs read as open to for-profits.
  // Also strip "public or private" modifiers so "private nonprofit org"
  // doesn't leave a dangling "private" that reads as a positive signal.
  const cleaned = t
    .replace(/(?:\b(?:public|private|or|and)[, ]+)*non-?profit[a-z ]*organizations?/g, " ")
    .replace(/(?:\b(?:public|private|or|and)[, ]+)*non-?profit/g, " ");
  const positive =
    /\bsmall business|for-profit|for profit|\bprofit organization|\bprivate\b|\banyone\b|individuals and organizations/.test(
      cleaned,
    );
  if (positive) return true;
  // Original text clearly restricts to govt/tribes/nonprofits/states only.
  if (/non-?profit|state governments|federally recognized|interstate|intrastate/.test(t)) return false;
  return null;
}

function clean(s: string | undefined): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

// ---------- Main ----------

async function main() {
  const fresh = process.argv.includes("--fresh");
  await ensureCsv(fresh);

  // File is windows-1252 encoded (verified: 0x92/0x96/0x97 smart-quote/dash bytes)
  const text = new TextDecoder("windows-1252").decode(fs.readFileSync(CSV_PATH)).replace(/^﻿/, "");
  const rows = parseCsv(text);
  const header = rows[0];
  if (!header) throw new Error("Empty CSV");
  const col = (name: string): number => {
    // match by prefix: numbered suffixes have shifted between extracts (e.g. Website Address (110) vs (153))
    const i = header.findIndex((h) => h === name || h.startsWith(name.replace(/\s*\(\d+\)$/, "")));
    if (i < 0) throw new Error(`Missing CSV column: ${name}`);
    return i;
  };
  const iTitle = col("Program Title");
  const iNumber = col("Program Number");
  const iAgency = col("Federal Agency (030)");
  const iObjectives = col("Objectives (050)");
  const iTypes = col("Types of Assistance (060)");
  const iEligibility = col("Applicant Eligibility (081)");
  const iRange = col("Range and Average of Financial Assistance (123)");
  const iWebsite = col("Website Address (153)");
  const iUrl = header.indexOf("URL"); // sam.gov/fal/{programId} link, present in current extracts

  const byId = new Map<string, Opportunity>();
  for (const r of rows.slice(1)) {
    const programNumber = clean(r[iNumber]);
    const title = clean(r[iTitle]);
    if (!programNumber || !title) continue;
    const eligibilityText = (r[iEligibility] ?? "").trim() || null;
    const { floor, ceiling } = parseRange(r[iRange] ?? "");
    const website = clean(r[iWebsite]);
    const falUrl = iUrl >= 0 ? clean(r[iUrl]) : "";
    byId.set(`assistance_listing:${programNumber}`, {
      id: `assistance_listing:${programNumber}`,
      source: "assistance_listing",
      kind: mapKind(r[iTypes] ?? "", `${title} ${clean(r[iObjectives])}`),
      title,
      agency: clean(r[iAgency]) || "Unknown",
      agencyCode: null,
      description: clean(r[iObjectives]),
      alnNumbers: [programNumber],
      eligibilityCodes: [],
      eligibilityText,
      openToSmallBusiness: deriveOpenToSmallBusiness(eligibilityText),
      awardFloorUsd: floor,
      awardCeilingUsd: ceiling,
      estimatedTotalUsd: null,
      expectedAwards: null,
      expectedApplications: null,
      openDate: null,
      closeDate: null, // standing programs: no deadline
      status: "open",
      url: /^https?:\/\//i.test(website) ? website : falUrl || null,
      contactName: null,
      contactEmail: null,
      raw: JSON.stringify({
        programNumber,
        typesOfAssistance: clean(r[iTypes]),
        rangeAndAverage: clean(r[iRange]),
      }),
    });
  }

  const opportunities = [...byId.values()];
  const db = getDb();
  const insert = db.prepare(INSERT_OPPORTUNITY_SQL);
  db.transaction(() => {
    db.prepare("DELETE FROM opportunities WHERE source = 'assistance_listing'").run();
    for (const o of opportunities) insert.run(opportunityToRow(o));
    db.prepare(
      "INSERT OR REPLACE INTO ingest_meta (source, last_run, row_count, notes) VALUES (?, ?, ?, ?)",
    ).run(
      "assistance_listing",
      new Date().toISOString(),
      opportunities.length,
      `csv rows: ${rows.length - 1}`,
    );
  })();

  const breakdown = new Map<string, number>();
  for (const o of opportunities) breakdown.set(o.kind, (breakdown.get(o.kind) ?? 0) + 1);
  console.log(`\nInserted ${opportunities.length} opportunities (from ${rows.length - 1} CSV rows)`);
  console.log("Breakdown by kind:");
  for (const [kind, n] of [...breakdown.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${kind.padEnd(22)} ${n}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
