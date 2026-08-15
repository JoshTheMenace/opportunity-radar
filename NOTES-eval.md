# Notes from the eval module

## Contract needed from src/lib/engine/pipeline.ts

`eval/run.ts` lazy-imports the pipeline and expects exactly this export:

```ts
export async function runAnalysis(founderInput: string): Promise<MatchReport>;
```

**And it must RANK** — a one-shot call has no interview loop, so a report
held for "readiness" is just an empty report (coverage 0, explain 0). The
readiness hold (readiness.ts) is therefore opt-in via
`runAnalysis(..., {gatherFirst: true})`; only the interactive facade passes
it. Keep the bare call ranking, whatever else changes.

(Extra optional params — e.g. an activity/event callback — are fine; the eval
runner passes only the founder paragraph.)

## Other notes

- `eval/judge.ts` looks up match opportunities in the DB (title/agency for
  coverage, closeDate for the dead-opportunity check). If an opportunityId in
  `MatchReport.matches` is not present in `data/radar.db`, that match scores as
  "no title/agency signal" and "not dead" — so keep opportunityIds consistent
  with the `opportunities` table.
- With `LLM_BACKEND=mock`, explanationQuality is reported as n/a (scored 0 in
  the weighted total) — overnight loops comparing runs should use the same
  backend across runs.
- Machine-readable output: `pnpm tsx eval/run.ts --json` prints one JSON object
  to stdout: `{timestamp, backend, averageTotal, scores: EvalScore[]}`.
- `--provider codex|live` (default codex) picks who answers the founder:
  the pipeline directly, or the Gemini Live voice agent (text in/out; needs
  `GEMINI_API_KEY`). Live runs add `provider` and per-case `transcripts` to the
  results JSON and judge explanationQuality on the transcript. `backend` still
  records the engine LLM — the pipeline runs underneath both providers, so
  cross-run comparisons should hold both `backend` and `provider` constant.
- Spoken-transcript judging (live provider) sees the same data the voice agent
  sees — meter, totalMatches, questions, and each top match's title/agency/
  amounts/closeDate — so quoting real figures isn't scored as invention.
- Engine addition `src/lib/engine/refine.ts`: refineReport(prior, profile)
  folds an interview answer in WITHOUT re-ranking (gates re-run, prior LLM
  scores reused, subtraction-only, tier upgrades via tierFor). /api/answer
  and voice answer_question use it when the client sends priorReport.
  Measured: 0.1s vs 90s full pipeline. Eligibility is monotone because
  interview answers only fill unknown fields — never rely on refine after
  editing KNOWN profile fields; that needs a full re-run.
- NEGATIVE RESULT (2026-08-15, tried + reverted): two-stage ranking (score-only
  triage -> prose for top-30 in batches of 8) COMPRESSES prose scores — the
  model grades on a curve when every batch-mate is pre-filtered plausible.
  Water's top match dropped from ~65-80 to ~50-58, parking honestNo on the
  knife edge (flipped to a false honest-no in one run; honesty 1.0 -> 0.0),
  and eval wall-clock didn't improve. Scoring calibration is batch-context-
  sensitive: don't change batch composition/size without re-benchmarking
  honesty on water + youth-marketplace. Ranking latency is instead handled
  by UX (progressive results, status strip, voice backgrounding).
- KEPT (same session): fast extraction for the readiness hold
  (extractProfileFast, slim schema, effort low) — hold 14-27s -> ~5s; the
  gov-language enrichment runs inside the ranking phase ("Translating your
  profile..."). Eval path untouched (always full extraction); water 0.98 -> 0.99.
