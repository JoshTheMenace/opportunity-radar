# Notes from the future-fit module

## Contract addition (types.ts — additive + optional, no consumer breaks)

Per Josh's request ("show opportunities that could fit down the line, and
follow up over time"), `MatchReport` gained an OPTIONAL `futureFits?:
FutureFit[]` plus the `FutureFit` / `FutureFitReason` types. Older reports
without the field remain valid; no existing consumer needs changes.

- Producer: `src/lib/engine/future.ts` (`classifyFutureFits`) — deterministic,
  no LLM. A hard-failed opportunity is a future fit iff EVERY failing gate is
  time-solvable: `deadline` (recurring programs reopen), `sbir:rnd` (company
  could start R&D), `amount_overlap` (capital need changes as they grow).
  Structural fails (geo, for-profit exclusion, small-business size,
  US ownership) are never surfaced as "future" — that would be false hope.
- Pipeline attaches it after ranking; capped at 6, sorted by meter value.
- UI: "Worth watching" section in report-view.tsx.
- Monitoring: companies save their future-fit snapshot (monitor/db.ts
  `future_fits` column, added via guarded ALTER TABLE); each watch cycle
  re-gates the snapshot against the company's current profile and notifies
  (+ drafts email) when one now passes — "you grew into it."
