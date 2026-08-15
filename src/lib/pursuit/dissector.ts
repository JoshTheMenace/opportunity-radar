// Public-source opportunity dissection for an active pursuit.
//
// This module intentionally does not access applicant portals. It records the
// official notice and public documents it can discover, then extracts only
// explicit requirement language from the retrieved notice. Missing linked
// documents keep the dossier in an incomplete state rather than pretending a
// generic checklist is exhaustive.

import { getDb } from "../db";
import type { Opportunity } from "../types";

export type DossierStatus =
  | "not_started"
  | "complete_public_dossier"
  | "incomplete_source_packet"
  | "unsupported_source";

export interface DossierSource {
  id: number;
  title: string;
  url: string;
  kind: "official_notice" | "linked_document" | "agency_guidance";
  retrieved: boolean;
  contentType: string | null;
  discoveredFrom: string | null;
}

export interface DossierRequirement {
  id: number;
  category: "registration" | "document" | "format" | "deadline" | "submission" | "other";
  statement: string;
  sourceUrl: string;
  sourceTitle: string;
}

export interface Dossier {
  pursuitId: number;
  status: DossierStatus;
  generatedAt: string | null;
  summary: string | null;
  missingItems: string[];
  sources: DossierSource[];
  requirements: DossierRequirement[];
}

interface DiscoveredSource {
  title: string;
  url: string;
  kind: DossierSource["kind"];
  retrieved: boolean;
  contentType: string | null;
  discoveredFrom: string | null;
}

interface ExtractedRequirement {
  category: DossierRequirement["category"];
  statement: string;
}

let ready = false;

function db() {
  const database = getDb();
  if (!ready) {
    database.exec(`
      CREATE TABLE IF NOT EXISTS pursuit_dossiers (
        pursuit_id INTEGER PRIMARY KEY REFERENCES pursuits(id),
        status TEXT NOT NULL,
        generated_at TEXT NOT NULL,
        summary TEXT,
        missing_items_json TEXT NOT NULL DEFAULT '[]'
      );
      CREATE TABLE IF NOT EXISTS pursuit_dossier_sources (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pursuit_id INTEGER NOT NULL REFERENCES pursuits(id),
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        kind TEXT NOT NULL,
        retrieved INTEGER NOT NULL DEFAULT 0,
        content_type TEXT,
        discovered_from TEXT
      );
      CREATE TABLE IF NOT EXISTS pursuit_dossier_requirements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pursuit_id INTEGER NOT NULL REFERENCES pursuits(id),
        category TEXT NOT NULL,
        statement TEXT NOT NULL,
        source_url TEXT NOT NULL,
        source_title TEXT NOT NULL
      );
    `);
    ready = true;
  }
  return database;
}

function cleanText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#(?:x[0-9a-f]+|\d+);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function titleForLink(label: string, url: string): string {
  const clean = cleanText(label).slice(0, 140);
  if (clean) return clean;
  try {
    return decodeURIComponent(new URL(url).pathname.split("/").pop() || "Linked document");
  } catch {
    return "Linked document";
  }
}

function findLinkedDocuments(html: string, baseUrl: string): DiscoveredSource[] {
  const links = new Map<string, DiscoveredSource>();
  const anchor = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  for (const match of html.matchAll(anchor)) {
    let url: string;
    try {
      url = new URL(match[1], baseUrl).toString();
    } catch {
      continue;
    }
    const label = titleForLink(match[2], url);
    if (
      !isHttpUrl(url) ||
      !/\.(pdf|docx?|xlsx?|pptx?)($|[?#])|attachment|download|document|appendix|template|faq|notice/i.test(
        `${label} ${url}`,
      )
    ) {
      continue;
    }
    links.set(url, {
      title: label,
      url,
      kind: "linked_document",
      retrieved: false,
      contentType: null,
      discoveredFrom: baseUrl,
    });
    if (links.size >= 25) break;
  }
  return [...links.values()];
}

function classify(statement: string): DossierRequirement["category"] {
  if (/deadline|due date|no later than|submit by/i.test(statement)) return "deadline";
  if (/register|registration|uei|sam\.gov|login\.gov|account/i.test(statement)) return "registration";
  if (/page limit|font|margin|format|pdf|file name/i.test(statement)) return "format";
  if (/upload|attachment|letter|budget|biographical|certif|form|volume/i.test(statement)) return "document";
  if (/submit|submission|portal|workspace/i.test(statement)) return "submission";
  return "other";
}

function explicitRequirements(text: string): ExtractedRequirement[] {
  const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [];
  const unique = new Set<string>();
  const requirements: ExtractedRequirement[] = [];
  for (const raw of sentences) {
    const statement = raw.replace(/\s+/g, " ").trim();
    if (
      statement.length < 35 ||
      statement.length > 700 ||
      !/\b(must|required|shall|submit|upload|register|application|proposal|attachment|deadline|due)\b/i.test(
        statement,
      )
    ) {
      continue;
    }
    const key = statement.toLowerCase();
    if (unique.has(key)) continue;
    unique.add(key);
    requirements.push({ category: classify(statement), statement });
    if (requirements.length >= 30) break;
  }
  return requirements;
}

async function fetchNotice(url: string): Promise<{ html: string; contentType: string | null } | null> {
  if (!isHttpUrl(url)) return null;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": "Opportunity-Radar/1.0 (public-source grant research)" },
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) return null;
    const contentType = response.headers.get("content-type");
    if (!contentType?.includes("text/html")) return { html: "", contentType };
    return { html: (await response.text()).slice(0, 1_500_000), contentType };
  } catch {
    return null;
  }
}

function agencyGuidance(opp: Opportunity): DiscoveredSource | null {
  const agency = `${opp.agency} ${opp.title}`.toLowerCase();
  if (/national science foundation|\bnsf\b/.test(agency)) {
    return { title: "NSF proposal policies and procedures", url: "https://www.nsf.gov/policies/pappg", kind: "agency_guidance", retrieved: false, contentType: null, discoveredFrom: null };
  }
  if (/national institutes of health|\bnih\b|health and human services|\bhhs\b/.test(agency)) {
    return { title: "NIH application guide", url: "https://grants.nih.gov/grants-process/write-application/how-to-apply-application-guide", kind: "agency_guidance", retrieved: false, contentType: null, discoveredFrom: null };
  }
  if (/department of defense|\bdod\b|\bdarpa\b|\barmy\b|\bnavy\b|air force/.test(agency)) {
    return { title: "DoD SBIR/STTR program guidance", url: "https://www.defensesbirsttr.mil/SBIR-STTR/Program/", kind: "agency_guidance", retrieved: false, contentType: null, discoveredFrom: null };
  }
  if (/department of energy|\bdoe\b|energy/.test(agency)) {
    return { title: "DOE funding opportunity exchange", url: "https://eere-exchange.energy.gov/", kind: "agency_guidance", retrieved: false, contentType: null, discoveredFrom: null };
  }
  return null;
}

function saveDossier(
  pursuitId: number,
  status: DossierStatus,
  summary: string,
  missingItems: string[],
  sources: DiscoveredSource[],
  requirements: ExtractedRequirement[],
): Dossier {
  const database = db();
  const run = database.transaction(() => {
    database.prepare("DELETE FROM pursuit_dossier_sources WHERE pursuit_id = ?").run(pursuitId);
    database.prepare("DELETE FROM pursuit_dossier_requirements WHERE pursuit_id = ?").run(pursuitId);
    database
      .prepare(
        `INSERT INTO pursuit_dossiers (pursuit_id, status, generated_at, summary, missing_items_json)
         VALUES (?, ?, datetime('now'), ?, ?)
         ON CONFLICT(pursuit_id) DO UPDATE SET status = excluded.status, generated_at = excluded.generated_at,
           summary = excluded.summary, missing_items_json = excluded.missing_items_json`,
      )
      .run(pursuitId, status, summary, JSON.stringify(missingItems));
    const sourceInsert = database.prepare(
      `INSERT INTO pursuit_dossier_sources (pursuit_id, title, url, kind, retrieved, content_type, discovered_from)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const source of sources) {
      sourceInsert.run(
        pursuitId,
        source.title,
        source.url,
        source.kind,
        source.retrieved ? 1 : 0,
        source.contentType,
        source.discoveredFrom,
      );
    }
    const requirementInsert = database.prepare(
      `INSERT INTO pursuit_dossier_requirements (pursuit_id, category, statement, source_url, source_title)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const notice = sources.find((source) => source.kind === "official_notice");
    if (notice) {
      for (const requirement of requirements) {
        requirementInsert.run(pursuitId, requirement.category, requirement.statement, notice.url, notice.title);
      }
    }
  });
  run();
  return getDossier(pursuitId)!;
}

export async function dissectOpportunity(pursuitId: number, opportunity: Opportunity): Promise<Dossier> {
  if (!opportunity.url || !isHttpUrl(opportunity.url)) {
    return saveDossier(
      pursuitId,
      "unsupported_source",
      "This opportunity has no usable official notice URL in Opportunity Radar.",
      ["Add the official solicitation or funding-opportunity URL before requirements can be researched."],
      [],
      [],
    );
  }

  const fetched = await fetchNotice(opportunity.url);
  const notice: DiscoveredSource = {
    title: "Official opportunity notice",
    url: opportunity.url,
    kind: "official_notice",
    retrieved: fetched != null,
    contentType: fetched?.contentType ?? null,
    discoveredFrom: null,
  };
  const guidance = agencyGuidance(opportunity);
  const linked = fetched?.html ? findLinkedDocuments(fetched.html, opportunity.url) : [];
  const requirements = fetched?.html ? explicitRequirements(cleanText(fetched.html)) : [];
  const sources = [notice, ...linked, ...(guidance ? [guidance] : [])];
  const missingItems = [
    ...(fetched ? [] : ["The official notice page could not be retrieved; open the official notice and upload or provide the solicitation."]),
    ...(linked.length > 0
      ? ["Review the linked public documents below. They are discovered but not yet parsed, so this is not an exhaustive requirements list."]
      : ["Confirm the application package, attachments, amendments, and portal-required forms in the official system."]),
  ];
  const status: DossierStatus = fetched && linked.length === 0 ? "incomplete_source_packet" : "incomplete_source_packet";
  const summary = fetched
    ? `Reviewed the public notice and found ${requirements.length} explicit requirement statements. This dossier remains incomplete until linked solicitation documents and the official application package are checked.`
    : "The official notice could not be retrieved. Requirements cannot be verified from a public source packet yet.";
  return saveDossier(pursuitId, status, summary, missingItems, sources, requirements);
}

export function getDossier(pursuitId: number): Dossier | null {
  const database = db();
  const row = database.prepare("SELECT * FROM pursuit_dossiers WHERE pursuit_id = ?").get(pursuitId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  const sources = database
    .prepare("SELECT * FROM pursuit_dossier_sources WHERE pursuit_id = ? ORDER BY id")
    .all(pursuitId) as Record<string, unknown>[];
  const requirements = database
    .prepare("SELECT * FROM pursuit_dossier_requirements WHERE pursuit_id = ? ORDER BY id")
    .all(pursuitId) as Record<string, unknown>[];
  return {
    pursuitId,
    status: row.status as DossierStatus,
    generatedAt: row.generated_at as string,
    summary: (row.summary as string) ?? null,
    missingItems: JSON.parse((row.missing_items_json as string) || "[]") as string[],
    sources: sources.map((source) => ({
      id: source.id as number,
      title: source.title as string,
      url: source.url as string,
      kind: source.kind as DossierSource["kind"],
      retrieved: !!source.retrieved,
      contentType: (source.content_type as string) ?? null,
      discoveredFrom: (source.discovered_from as string) ?? null,
    })),
    requirements: requirements.map((requirement) => ({
      id: requirement.id as number,
      category: requirement.category as DossierRequirement["category"],
      statement: requirement.statement as string,
      sourceUrl: requirement.source_url as string,
      sourceTitle: requirement.source_title as string,
    })),
  };
}
