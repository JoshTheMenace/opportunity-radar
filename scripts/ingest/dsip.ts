// Ingest open DoD SBIR/STTR topics from DSIP (DoD SBIR/STTR Innovation
// Portal, dodsbirsttr.mil) — fills the SBIR gap left by api.www.sbir.gov
// being down. Public JSON API, no auth (verified live 2026-08-15; see
// docs/api-notes.md "DSIP").
// Run: pnpm tsx scripts/ingest/dsip.ts

import { getDb, INSERT_OPPORTUNITY_SQL, opportunityToRow } from "../../src/lib/db";
import type { Opportunity } from "../../src/lib/types";

const UA = { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)" };
const BASE = "https://www.dodsbirsttr.mil/topics/api/public/topics";
const OPEN_STATUS = 591; // "Open" — accepting submissions now
const DELAY_MS = 120;

interface DsipTopic {
  topicId: string;
  topicCode: string;
  topicTitle: string;
  component: string | null; // ARMY / NAVY / AF / DARPA / ...
  program: string | null; // SBIR | STTR
  solicitationNumber: string | null;
  topicEndDate: number | null; // epoch ms
  topicPreReleaseStartDate: number | null;
}

interface DsipDetails {
  objective: string | null;
  description: string | null;
  phase1Description: string | null;
  keywords: string | string[] | null;
}

function stripHtml(html: string | null | undefined): string {
  return (html ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function isoFromEpoch(ms: number | null): string | null {
  if (!ms) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

/** First dollar amount in the Phase I text = the topic's cost ceiling. */
function phase1Ceiling(text: string): number | null {
  const m = text.match(/\$\s?([\d,]{4,})/);
  if (!m) return null;
  const n = parseInt(m[1].replace(/,/g, ""), 10);
  return Number.isFinite(n) && n >= 10_000 ? n : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: UA });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return (await res.json()) as T;
}

async function main() {
  const searchParam = encodeURIComponent(
    JSON.stringify({
      searchText: null,
      component: null,
      programYear: null,
      topicReleaseStatus: [OPEN_STATUS],
      sortBy: "finalTopicCode,asc",
    }),
  );
  const { total, data } = await fetchJson<{ total: number; data: DsipTopic[] }>(
    `${BASE}/search?searchParam=${searchParam}&size=200&page=0`,
  );
  console.log(`DSIP: ${total} open topics`);

  const opps: Opportunity[] = [];
  for (const t of data) {
    let det: DsipDetails | null = null;
    try {
      det = await fetchJson<DsipDetails>(`${BASE}/${t.topicId}/details`);
    } catch {
      // details are additive — the search payload alone is still a valid row
    }
    await sleep(DELAY_MS);
    const phase1 = stripHtml(det?.phase1Description);
    const description = [
      stripHtml(det?.objective),
      stripHtml(det?.description),
      phase1,
    ]
      .filter(Boolean)
      .join(" ")
      .slice(0, 6000);
    opps.push({
      id: `sbir:${t.topicCode}`,
      source: "sbir",
      kind: "sbir_sttr",
      title: `${t.topicCode} — ${t.topicTitle}`,
      agency: `Department of Defense — ${t.component ?? "DoD"} (${t.program ?? "SBIR/STTR"})`,
      agencyCode: t.component ?? null,
      description:
        description ||
        `DoD ${t.program ?? "SBIR/STTR"} topic ${t.topicCode} (solicitation ${t.solicitationNumber ?? "n/a"}).`,
      alnNumbers: [],
      eligibilityCodes: [],
      eligibilityText:
        "Standard SBIR/STTR eligibility: US for-profit small business (<500 employees), majority-owned by US citizens or permanent residents, with the principal investigator primarily employed by the firm. STTR topics additionally require a partnering US research institution.",
      openToSmallBusiness: true,
      awardFloorUsd: null,
      awardCeilingUsd: phase1 ? phase1Ceiling(phase1) : null,
      estimatedTotalUsd: null,
      expectedAwards: null,
      expectedApplications: null,
      openDate: isoFromEpoch(t.topicPreReleaseStartDate),
      closeDate: isoFromEpoch(t.topicEndDate),
      status: "posted",
      url: "https://www.dodsbirsttr.mil/topics-app/",
      contactName: null,
      contactEmail: null,
      raw: JSON.stringify({ topicId: t.topicId, solicitationNumber: t.solicitationNumber }),
    });
  }

  const db = getDb();
  const insert = db.prepare(INSERT_OPPORTUNITY_SQL);
  db.transaction(() => {
    for (const o of opps) insert.run(opportunityToRow(o));
    db.prepare(
      `INSERT INTO ingest_meta (source, last_run, row_count, notes)
       VALUES ('sbir', @last_run, @row_count, @notes)
       ON CONFLICT(source) DO UPDATE SET
         last_run = excluded.last_run, row_count = excluded.row_count, notes = excluded.notes`,
    ).run({
      last_run: new Date().toISOString(),
      row_count: opps.length,
      notes: "Open DoD SBIR/STTR topics from DSIP (dodsbirsttr.mil public API)",
    });
  })();
  console.log(`Ingested ${opps.length} DSIP topics into data/radar.db`);
}

void main();
