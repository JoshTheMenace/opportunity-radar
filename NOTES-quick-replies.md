# Notes from the quick-replies module

- **Contract change (Josh-approved, additive): `CompleteOptions.model?: string`
  in `src/lib/llm.ts`.** Per-call model override for low-stakes calls. The
  codex adapter passes it to `thread/start` (falls back to `CODEX_MODEL`);
  anthropic/mock backends ignore it. Optional field — no existing call sites
  affected.
- Verified live: `gpt-5.6-luna` works on Josh's ChatGPT account (`gpt-luna`
  does NOT — 400 invalid_request). Override with `SUGGEST_MODEL` env.
- New module `src/lib/engine/suggest.ts` + route `POST /api/suggest`
  `{questions}` -> `{replies: [{label, message}]}`. Each reply's `message` is
  a first-person founder sentence sent through the existing freeform path
  (`POST /api/answer {profile, message}`), so tapping a chip reuses the
  multi-field parser — no new answer machinery.
- Suggestion rules enforced in the prompt: replies must fully settle a
  question; threshold-style replies only when the gate implies a threshold
  ("fewer than 500 employees"); never exact numbers, cities, or other
  founder-specific values; one compound reply may cover several yes/no
  questions. Failures return `[]` — chips are garnish, never load-bearing.
- Also in this change: `meterValueUsd` is capped at `METER_CAP_USD` ($5M,
  `gates.ts`) because source award ceilings include program totals up to
  $108T, which made the meter claim billions.
