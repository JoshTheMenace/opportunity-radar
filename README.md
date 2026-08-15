# Opportunity Radar

AI system matching startups to US government funding (Startup State hackathon).
A founder describes their company in a sentence; the app extracts a profile,
screens ~4,600 cached opportunities through deterministic eligibility gates,
LLM-ranks the survivors with a skeptical rubric, and renders an Opportunity Map
with real historical-award evidence — then keeps watching for new money.

Two principles shape everything:

- **Honesty over hype.** If nothing genuinely fits, the report says so
  (`honestNo`) and shows near-misses with the reason they fail. One eval case
  exists purely to enforce this.
- **The LLM never invents numbers.** Dollar amounts, dates, and IDs come from
  the database; the LLM only writes judgment and prose around them.

## Capabilities

- **Analysis pipeline** — profile extraction → FTS retrieval → deterministic
  gates → eligibility meter → parallel LLM ranking → USAspending evidence.
  Matches stream into the UI live as each scoring batch lands (SSE).
- **Eligibility meter + interview** — "answer X to unlock $Y." Questions are
  ranked by *simulated unlock* (how much money an answer actually moves),
  derivable facts are never asked, and per-opportunity dollar values are capped
  at $5M (`METER_CAP_USD`) to keep totals believable.
- **Three ways to answer** — one-tap Yes/No buttons (no LLM); freeform chat
  where one message can settle several fields at once; and quick-reply chips
  suggested by a cheap/fast model (GPT 5.6 Luna) that only offers taps that can
  truly settle a question (thresholds yes, exact values no).
- **Voice mode** — Gemini Live conversation whose tool calls drive the same
  engine (run analysis, apply answers, read back matches).
- **Proactive monitoring ("the radar")** — saved company profiles are scanned
  each watch cycle against newly ingested opportunities; strong matches become
  notifications with drafted outreach emails (`data/outbox/`); dashboard at
  `/radar`.
- **Eval harness** — five judged founder scenarios (`pnpm tsx eval/run.ts`)
  scoring coverage, honesty, dead-opportunity avoidance, and explanation
  quality.

## Quickstart

```bash
pnpm install
pnpm tsx scripts/ingest/grants-gov.ts            # fill data/radar.db (also: assistance-listings, utah)
pnpm dev                                         # http://localhost:3000
```

Useful commands:

```bash
pnpm tsx scripts/smoke/gates.test.ts             # fast deterministic engine tests
pnpm tsx eval/run.ts --json                      # full judged eval
pnpm tsx scripts/watch.ts --loop 15              # radar daemon (watch cycle every 15 min)
```

Environment (`.env.local`): `LLM_BACKEND` (codex | anthropic | mock),
`CODEX_MODEL` (default gpt-5.6-sol), `SUGGEST_MODEL` (default gpt-5.6-luna),
`ANTHROPIC_API_KEY` (fallback backend), `GEMINI_API_KEY` (voice mode).

## Where things live

| Area | Path |
| --- | --- |
| Engine (profile, gates, meter, rank, evidence, suggest) | `src/lib/engine/` |
| LLM switchboard (the only door to any model) | `src/lib/llm.ts` + `llm-*.ts` |
| API routes (analyze/answer SSE, suggest, companies, voice, notifications) | `src/app/api/` |
| UI (one file per visual region; `opportunity-map.tsx` orchestrates) | `src/app/components/` |
| Voice tool bridge | `src/lib/voice/` |
| Monitoring (watch cycle, notifications, emails) | `src/lib/monitor/`, `scripts/watch.ts` |
| Ingest + data | `scripts/ingest/`, `data/radar.db` |
| Eval + smoke tests | `eval/`, `scripts/smoke/` |

Conventions and agent rules: [CLAUDE.md](CLAUDE.md). Verified external API
quirks: [docs/api-notes.md](docs/api-notes.md). Cross-module contract notes:
`NOTES-*.md` in the repo root.
