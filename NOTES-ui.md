# Notes from the UI/API module

## Component structure (restructured 2026-08-15 for the styling pass)

`opportunity-map.tsx` is now only the stateful orchestrator (SSE stream,
profile state, quick-reply fetch). All visual regions moved to
`src/app/components/`, one file per region, behavior unchanged:

- `intake-panel.tsx` (#intake — description box, analyze, sample chips)
- `activity-feed.tsx` (#activity), `meter-panel.tsx` (#meter)
- `interview-panel.tsx` (#interview — questions + quick-reply chips + chat;
  owns its own input state)
- `report-view.tsx` (#report — ReportView/HonestNoPanel/ReportSkeleton/HowItWorks)
- `match-card.tsx` (match card + evidence strip)
- `shared.ts` (UiReport type, fmtUsd, daysUntil, TIERS)

Layout: `layout.tsx` owns the app shell (sticky nav with /radar link, footer).
The page is `#intake` + `#workspace` = `#results` main column + `#guidance`
sticky right rail (voice, meter, interview). `save-monitor.tsx` is now mounted
under the report (renders when a run finishes). Restyle by editing region
files; don't move state back into components.

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
- Progressive scoring (added later): pipeline.ts DOES now emit interim
  `report` events as each parallel scoring batch lands (matches-so-far,
  honestNo always false until final; no evidence). The facade enriches every
  report event with the `opportunities` lookup, so partials render fully.
  Clients must keep treating the LAST report event as authoritative.
- `/api/answer` also accepts `{profile, message}` (freeform chat text); one
  message can settle several gate fields in a single LLM parse. The legacy
  `{profile, field, answer}` form still works for one-tap buttons.
