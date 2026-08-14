// Ingest the hand-curated Utah opportunity layer.
// Run: pnpm tsx scripts/ingest/utah.ts
// Reads data/utah-opportunities.json, validates every record against the
// Opportunity contract, and upserts into data/radar.db.

import fs from "fs";
import path from "path";
import { z } from "zod";
import { getDb, INSERT_OPPORTUNITY_SQL, opportunityToRow } from "../../src/lib/db";
import type { Opportunity } from "../../src/lib/types";

const FUNDING_KINDS = [
  "grant",
  "cooperative_agreement",
  "loan",
  "sbir_sttr",
  "procurement",
  "tax_credit",
  "equity",
  "services",
  "other",
] as const;

const UtahOpportunity = z.object({
  id: z.string().startsWith("utah:"),
  source: z.literal("utah"),
  kind: z.enum(FUNDING_KINDS),
  title: z.string().min(1),
  agency: z.string().min(1),
  agencyCode: z.string().nullable(),
  description: z.string().min(40),
  alnNumbers: z.array(z.string()),
  eligibilityCodes: z.array(z.string()),
  eligibilityText: z.string().nullable(),
  openToSmallBusiness: z.boolean().nullable(),
  awardFloorUsd: z.number().positive().nullable(),
  awardCeilingUsd: z.number().positive().nullable(),
  estimatedTotalUsd: z.number().positive().nullable(),
  expectedAwards: z.number().int().positive().nullable(),
  expectedApplications: z.number().int().positive().nullable(),
  openDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  closeDate: z.null(), // hand-curated layer is rolling — no deadlines
  status: z.literal("open"),
  url: z.string().startsWith("https://").nullable(),
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  raw: z.string().nullable(),
});

function main() {
  const file = path.join(process.cwd(), "data", "utah-opportunities.json");
  const parsed = z.array(UtahOpportunity).parse(JSON.parse(fs.readFileSync(file, "utf8")));
  const opps: Opportunity[] = parsed;

  const ids = new Set(opps.map((o) => o.id));
  if (ids.size !== opps.length) throw new Error("Duplicate opportunity ids in utah-opportunities.json");

  const db = getDb();
  const insert = db.prepare(INSERT_OPPORTUNITY_SQL);
  db.transaction(() => {
    for (const o of opps) insert.run(opportunityToRow(o));
    db.prepare(
      `INSERT INTO ingest_meta (source, last_run, row_count, notes)
       VALUES ('utah', @last_run, @row_count, @notes)
       ON CONFLICT(source) DO UPDATE SET
         last_run = excluded.last_run, row_count = excluded.row_count, notes = excluded.notes`,
    ).run({
      last_run: new Date().toISOString(),
      row_count: opps.length,
      notes: "Hand-curated Utah state/local programs from data/utah-opportunities.json",
    });
  })();

  console.log(`Ingested ${opps.length} Utah opportunities into data/radar.db`);
}

main();
