# Notes from the pursuits module

A pursuit = one company actively applying to one opportunity. This is the
"help them actually get the money" layer: pick a match → we build a
submission plan → track it to submission with per-task AI help.

## Files

- `src/lib/pursuit/db.ts` — own tables (`pursuits`, `pursuit_tasks`) via
  CREATE IF NOT EXISTS on shared radar.db, mirroring monitor/db.ts. One
  pursuit per opportunity (UNIQUE). No changes to frozen db.ts/types.ts —
  pursuit types live in this module.
- `src/lib/pursuit/plan.ts` — plan generation. Deterministic scaffold
  (SAM.gov/Grants.gov/SBIR.gov registrations keyed off profile+source, a
  3-day submission buffer, post-submission follow-up) + LLM enrichment via
  `completeJSON` (6-12 opportunity-specific tasks; LLM proposes day offsets,
  CODE converts to dates clamped inside the window — the LLM never sets
  dates/amounts directly). Falls back to a generic middle plan on LLM failure.
- API: `POST/GET /api/pursuits` (create+plan / list with progress,
  `?opportunityId=` narrows), `GET/PATCH /api/pursuits/[id]` ({taskId,done}
  or {status}), `POST /api/pursuits/[id]/assist` {taskId} → grounded
  step-by-step guidance cached on the task row.
- UI: `/opportunity/[id]` (server detail page + client PursuitPanel tracker),
  `/pursuits` dashboard, nav link, match cards link to the detail page.

## Related report change

`components/report-view.tsx` hides matches with score < 50 (MIN_SCORE)
and shows an honest "no strong matches yet — answer more questions" empty
state; hidden count is footnoted. HonestNoPanel intentionally unfiltered
(its adjacent/state options are presented as weak by design).

## Verified live (2026-08-15, codex backend)

Plan generation ~29s/15 tasks with correct back-from-deadline timeline;
assist ~18s and grounded (cites real portals, flags unverifiable facts).
POST is idempotent per opportunity (returns existing pursuit, existed:true).
