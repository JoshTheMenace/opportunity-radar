// Ingest active DoD SBIR/STTR topics from DSIP's public JSON APIs.
// Each topic is stored separately: an umbrella BAA is too broad to rank honestly.
// Run: pnpm tsx scripts/ingest/dsip.ts

import { getDb, INSERT_OPPORTUNITY_SQL, opportunityToRow } from "../../src/lib/db";
import type { Opportunity } from "../../src/lib/types";

const base = "https://www.dodsbirsttr.mil";
const headers = { "User-Agent": "Opportunity-Radar/1.0 (public solicitation research)", Accept: "application/json" };
const download = (id: number | string) => `${base}/submissions/api/public/download?uploadId=${id}`;

type Solicitation = { solicitationCycleId: number; cycleName: string; title: string; program: string };
type Topic = { topicId: string; topicCode: string; topicTitle: string; topicStatus: string; program: string; component: string; cycleName: string; releaseNumber: number; topicStartDate: number | null; topicEndDate: number | null; baaInstructions: Array<{ uploadId: number; fileName: string }> | null };
type Detail = { objective: string | null; description: string | null; keywords: string | null; focusAreas: string[] | null; technologyAreas: string[] | null; itar: boolean | null; cmmcLevel: string | null };
type Release = { release: number; latestFinalDocument: Array<{ uploadId: number; uploadTypeCode: string; fileName: string }> };

async function json<T>(url: string): Promise<T> {
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${url} returned HTTP ${response.status}`);
  return response.json() as Promise<T>;
}
function text(value: string | null): string {
  return (value ?? "").replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();
}
function date(value: number | null): string | null { return value ? new Date(value).toISOString().slice(0, 10) : null; }
async function concurrent<T, R>(items: T[], fn: (item: T) => Promise<R>, limit = 8): Promise<R[]> {
  const results: R[] = new Array(items.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; results[i] = await fn(items[i]); }
  }));
  return results;
}
async function topics(cycleName: string): Promise<Topic[]> {
  const all: Topic[] = [];
  for (let page = 0; ; page++) {
    const params = encodeURIComponent(JSON.stringify({ solicitationCycleNames: [cycleName], topicReleaseStatus: [591, 592], sortBy: "finalTopicCode,asc" }));
    const result = await json<{ total: number; data: Topic[] }>(`${base}/topics/api/public/topics/search?searchParam=${params}&size=100&page=${page}`);
    all.push(...result.data);
    if (all.length >= result.total || result.data.length === 0) return all;
  }
}
async function main() {
  const search = await json<{ active: Solicitation[] }>(`${base}/submissions/api/public/solicitations/baa-search?searchParam=${encodeURIComponent(JSON.stringify({ sortBy: "programYear,desc" }))}&isActive=true`);
  const output: Opportunity[] = [];
  for (const solicitation of search.active) {
    const releaseResult = await json<{ data: Release[] }>(`${base}/topics/api/public/baa/${solicitation.solicitationCycleId}/details`).catch(() => ({ data: [] }));
    const releases = new Map(releaseResult.data.map((release) => [release.release, release.latestFinalDocument.map((doc) => ({ title: `${doc.uploadTypeCode.replace(/_UPLOAD$/, "").replaceAll("_", " ")} (${doc.fileName})`, url: download(doc.uploadId) }))]));
    const active = await topics(solicitation.cycleName);
    const details = await concurrent(active, (topic) => json<Detail>(`${base}/topics/api/public/topics/${encodeURIComponent(topic.topicId)}/details`).catch(() => null));
    for (let i = 0; i < active.length; i++) {
      const topic = active[i], detail = details[i];
      const documents = [...(releases.get(topic.releaseNumber) ?? []), ...(topic.baaInstructions ?? []).map((doc) => ({ title: `Component instructions (${doc.fileName})`, url: download(doc.uploadId) }))];
      if (!documents.length) continue;
      const description = [text(detail?.objective ?? null), text(detail?.description ?? null), detail?.focusAreas?.length ? `Focus areas: ${detail.focusAreas.join(", ")}.` : "", text(detail?.keywords ?? null) ? `Keywords: ${text(detail?.keywords ?? null)}.` : ""].filter(Boolean).join(" ").slice(0, 2500) || `${solicitation.title}; ${topic.component}.`;
      output.push({ id: `sbir:dsip:topic:${topic.topicCode}`, source: "sbir", kind: "sbir_sttr", title: `${topic.topicTitle} (${topic.topicCode})`, agency: `Department of Defense (${topic.component})`, agencyCode: topic.component, description, alnNumbers: [], eligibilityCodes: ["23"], eligibilityText: ["See official DSIP BAA release instructions for eligibility.", detail?.itar ? "ITAR-restricted" : "", detail?.cmmcLevel ? `Requires CMMC ${detail.cmmcLevel}` : ""].filter(Boolean).join(" "), openToSmallBusiness: true, awardFloorUsd: null, awardCeilingUsd: null, estimatedTotalUsd: null, expectedAwards: null, expectedApplications: null, openDate: date(topic.topicStartDate), closeDate: date(topic.topicEndDate), status: topic.topicStatus === "Open" ? "open" : "forecasted", url: `${base}/topics-app/?baa=${encodeURIComponent(topic.cycleName)}&release=${topic.releaseNumber}`, contactName: null, contactEmail: "DoDSBIRSupport@reisystems.com", raw: JSON.stringify({ dsip: { solicitation: topic.cycleName, topicCode: topic.topicCode, documents } }) });
    }
  }
  if (!output.length) throw new Error("DSIP returned no active topics with public document links.");
  const database = getDb(); const insert = database.prepare(INSERT_OPPORTUNITY_SQL);
  database.transaction(() => { database.prepare("DELETE FROM opportunities WHERE id LIKE 'sbir:dsip:%'").run(); output.forEach((opportunity) => insert.run(opportunityToRow(opportunity))); })();
  console.log(`Ingested ${output.length} active DSIP SBIR/STTR topics.`);
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
