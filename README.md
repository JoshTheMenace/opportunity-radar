# Opportunity Radar

**A personal government-funding analyst for every startup.**
Built for the Startup State hackathon.

A founder describes their company in a sentence (typed or spoken). Radar
extracts a profile, screens **4,630 cached federal and Utah programs** through
deterministic eligibility gates, LLM-ranks the survivors with a skeptical
rubric, and renders an Opportunity Map with real historical-award evidence —
then keeps watching for new money every week.

Two principles shape everything:

- **Honesty over hype.** If nothing genuinely fits, the report says so
  (`honestNo`) and shows near-misses with the reason each one fails.
  Institution-restricted programs (land-grant universities, state agencies)
  are hard-failed or demoted by prose-level gates so a startup is never shown
  money it categorically cannot win. Eval cases exist purely to enforce this.
- **The LLM never invents numbers.** Dollar amounts, dates, and IDs come from
  the database; the LLM only writes judgment and prose around them — in plain
  founder language, with every acronym explained on first use.

## The product

| Screen | What it does |
| --- | --- |
| **Opportunity Map** (`/`) | Conversational onboarding for a first visit; after the scan, a live dashboard — tiered match cards with four-part explanations (why it fits · what could disqualify · what to verify · next steps), award evidence, deadlines, and a Rescan button. |
| **Profile** (`/profile`) | The persistent, editable company dossier. Manual edits are sticky and always win over extraction. |
| **Screening** (`/radar`) | The eligibility control room: every rule checked, what each answer unlocks, notifications from the weekly watch. |
| **Utah Connections** (`/utah`) | 1,425 documented Utah federal-award winners, the navigators who help founders apply, and Utah-only programs. |
| **Pursuits** (`/pursuits`) | Application workspace per opportunity: checklist, requirements, deadlines, and "Help me" buttons wired to the assistant. |

Everywhere in the app, an **assistant drawer** answers questions with the
context of the page you're on — including a live **voice mode** (Gemini Live)
whose mic and transcription live inside the same chat, and whose tool calls
drive the same engine.

## How a scan works

```
founder's words ──► profile extraction ──► FTS retrieval (4,630 programs)
                                                 │
                              deterministic eligibility gates
                              (SBA size, ownership, R&D, geography,
                               institution-restriction prose checks)
                                                 │
                    eligibility meter — "answer X to unlock +$Y"
                                                 │
                   parallel LLM ranking (streams live via SSE)
                   SBIR/STTR prioritized as the primary small-
                   business vehicle; UTIF microgrant rides along
                                                 │
                  historical evidence (USAspending, SBIR.gov):
                  who else got this money, median award, Utah winners
```

Data sources: Grants.gov (search2), SAM.gov Assistance Listings, SBIR.gov,
USAspending, plus a curated Utah state layer.

## Quickstart

```bash
pnpm install
pnpm tsx scripts/ingest/grants-gov.ts     # also: assistance-listings.ts, dsip.ts, utah.ts, utah-intelligence.ts
pnpm dev                                  # http://localhost:3000
```

Useful commands:

```bash
pnpm tsx scripts/smoke/gates.test.ts      # fast deterministic engine tests
pnpm tsx eval/run.ts --json               # judged eval: the 5 brief cases + 4 held-out honesty cases
pnpm tsx scripts/watch.ts --loop 15       # the radar daemon (watch cycle every 15 min)
pnpm tsx scripts/demo-reset.ts            # wipe founder state, keep the corpus (demo prep)
pnpm tsx scripts/bench/journey.ts <url>   # SSE latency waterfall of the full user journey
```

Environment (`.env.local`): `LLM_BACKEND` (codex | anthropic | mock),
`CODEX_MODEL` (default gpt-5.6-sol), `SUGGEST_MODEL` (default gpt-5.6-luna),
`ANTHROPIC_API_KEY` (fallback backend), `GEMINI_API_KEY` (voice mode),
`RESEND_API_KEY` (monitoring emails).

## Where things live

| Area | Path |
| --- | --- |
| Engine (profile, gates, meter, rank, evidence, utif, pipeline) | `src/lib/engine/` |
| LLM switchboard (the only door to any model) | `src/lib/llm.ts` + `llm-*.ts` |
| API routes (analyze/answer SSE, assistant, companies, voice, notifications) | `src/app/api/` |
| UI (one file per visual region; `opportunity-map.tsx` orchestrates) | `src/app/components/` |
| Assistant drawer + page context | `src/app/components/assistant/` |
| Design system (vendored kit — keep byte-identical) + extras | `src/app/styles/` |
| Voice tool bridge | `src/lib/voice/` |
| Monitoring (watch cycle, notifications, Resend emails) | `src/lib/monitor/`, `scripts/watch.ts` |
| Ingest + data | `scripts/ingest/`, `data/radar.db` |
| Eval + smoke tests | `eval/`, `scripts/smoke/` |

Conventions and agent rules: [CLAUDE.md](CLAUDE.md). Verified external API
quirks: [docs/api-notes.md](docs/api-notes.md). Cross-module contract notes:
`NOTES-*.md` in the repo root.
