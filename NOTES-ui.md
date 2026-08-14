# Notes from the UI/API module

- Contract addition (contained in `src/app/api/engine-facade.ts`, no type edits
  needed): the SSE `report` event the API emits carries
  `report.opportunities: Record<string, Opportunity>` — an id→row lookup the
  facade attaches (from `opportunities` table via `@/lib/db`) so match cards
  can render title/agency/amounts. `RankedMatch` only has `opportunityId`.
  Integration agent: nothing to do as long as routes keep calling the facade.
- The facade lazy-imports `@/lib/engine/pipeline` per request and expects
  `export async function runAnalysis(founderText, prior, emit): Promise<MatchReport>`.
  If missing or not a function, it streams stub demo data instead.
- The `/api/analyze` route emits the final `report` event itself from the
  returned MatchReport — pipeline.ts does not need to emit `type:"report"`
  (harmless if it does; client keeps the last one).
