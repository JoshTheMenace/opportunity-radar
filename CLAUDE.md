# Opportunity Radar — project conventions

AI system matching startups to US government funding (Startup State hackathon).
Core flow: founder describes company → profile extraction → deterministic
eligibility gates → FTS retrieval → LLM ranking → Opportunity Map with an
eligibility meter ("answer X to unlock +$Y") and interview questions.

## Architecture

- `src/lib/types.ts` — THE shared contract. Do not modify; build against it.
- `src/lib/db.ts` — SQLite (better-sqlite3) at `data/radar.db`. Schema + row
  mapping helpers live here. Ingest writes; engine reads.
- `src/lib/llm.ts` — the ONLY way to call an LLM (`complete`/`completeJSON`).
  Backends: llm-codex.ts (primary, Codex app server / GPT 5.6 Sol),
  llm-anthropic.ts (fallback), llm-mock.ts (tests). Never import a provider
  SDK outside `src/lib/llm-*.ts`. `CompleteOptions.model` overrides the model
  per call — use `gpt-5.6-luna` for cheap/fast low-stakes calls (NOT
  `gpt-luna`; see NOTES-quick-replies.md).
- `scripts/ingest/*` — one script per source, run with `pnpm tsx scripts/ingest/<x>.ts`.
- `src/lib/engine/*` — profile (extraction + derivation + freeform answer
  parsing), gates (incl. $5M `METER_CAP_USD`), retrieve, rank (streams partial
  results via `onProgress`), meter (simulated-unlock question ranking),
  suggest (Luna quick-reply chips), evidence, pipeline.
- `src/lib/voice/*` — Gemini Live tool bridge onto the same engine (voice mode).
- `src/lib/monitor/*` + `scripts/watch.ts` — proactive watch cycle over saved
  companies: new opportunities → gates + rank → notifications + drafted emails.
- `src/app/api/*` — route handlers. /api/analyze and /api/answer stream SSE
  (interim `report` events while scoring; /api/answer also takes freeform
  `{profile, message}`); /api/suggest (quick replies); /api/companies (saved
  profiles); /api/voice/*; /api/notifications.
- `src/app/components/*` — one file per visual region; `opportunity-map.tsx`
  is the stateful orchestrator (see NOTES-ui.md before restructuring).
- `eval/*` — the 5 standard test cases + judge + runner (`pnpm tsx eval/run.ts`).
- `scripts/smoke/*` — fast engine tests (`gates.test.ts` is deterministic; the
  `*.smoke.ts` files hit the live LLM backend).

## Rules for agents working in this repo

- Only create/edit files inside the paths your task assigns. NEVER edit
  package.json, types.ts, db.ts, or llm.ts. Need a new dependency or a type
  change? Write it to `NOTES-<yourmodule>.md` in the repo root instead.
- No network calls at import time. Scripts fetch; modules read the DB.
- All LLM calls go through `src/lib/llm.ts`. Design prompts so structured
  facts (numbers, dates, IDs) come from the DB and the LLM only writes
  prose/judgment around them — never let the LLM invent statistics.
- External API quirks are documented in `docs/api-notes.md`. Read it before
  writing any fetch code — it contains verified endpoints and gotchas.
- TypeScript strict; `pnpm tsc --noEmit` must pass for your files.
- Keep the UI minimal and functional — a designer teammate restyles later.

## Test data expectations

Five standard eval cases (see eval/cases.ts): AI-healthcare, aerospace
manufacturing, water tech, cybersecurity, and a consumer youth marketplace
that must produce an HONEST NO (honestNo=true) rather than forced matches.
