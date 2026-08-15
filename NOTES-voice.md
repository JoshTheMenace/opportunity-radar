# Notes from the voice module (Gemini Live)

Voice mode is a fully separate provider — nothing in `src/lib/llm*.ts`,
`types.ts`, `db.ts`, or `package.json` was touched, and no new dependency was
added (raw browser WebSocket + server `fetch`). With no `GEMINI_API_KEY` in
`.env.local`, `/api/voice/token` GET reports `enabled:false` and the voice
panel renders nothing — the text app is unaffected.

## Files

- `src/lib/voice/schema.ts` — client-safe tool declarations + system prompt.
- `src/lib/voice/execute.ts` — server-side tool executor; reuses
  `engine-facade.runAnalysis`, `applyAnswer`, FTS search, `getOpportunityById`.
- `src/app/api/voice/token/route.ts` — GET feature-detect; POST mints an
  ephemeral token (v1alpha `auth_tokens`) so the key never reaches the browser.
  Dev-only fallback: raw `?key=` WS URL when minting fails.
- `src/app/api/voice/tools/route.ts` — executes one function call; stateless
  (browser sends its current profile each call). Tool errors return 200 with
  `{result:{error}}` so the model can relay them.
- `src/app/voice-panel.tsx` — mic capture (16kHz PCM16 via ScriptProcessor),
  playback (24kHz scheduled buffers, cleared on `interrupted`), transcripts,
  tool bridging. Reports from voice-run analyses feed the same
  `handle({type:"report"})` path as the text UI, so the screen stays in sync.

## Tools exposed to the voice model

`analyze_company(description)`, `answer_question(field, answer)`,
`search_opportunities(query, limit?)`, `get_opportunity(id)` — i.e. everything
the text agent can do (analyze, interview loop, DB lookup).

## Eval integration

`pnpm tsx eval/run.ts --provider live` drives the SAME eval cases through the
voice agent instead of calling the pipeline directly:

- `src/lib/voice/live-text.ts` — headless Live session over TEXT (Node >= 22
  global WebSocket, raw key server-side, no ephemeral token needed). Sends the
  founder paragraph as a typed user turn, executes tool calls in-process via
  `executeVoiceTool`, nudges up to 4 turns if the agent stalls, and returns
  `{report, agentText}` once a turn completes with a report.
- Scoring: coverage/honesty/noDead run on the report its tool calls produced
  (same as codex provider); explanationQuality judges the agent's TRANSCRIPT
  (what a voice user would hear), hallucination-checked against the report
  data. The judge LLM stays on `LLM_BACKEND` — independent of Gemini.
- Results JSON gains `provider` and (live only) `transcripts` per case;
  existing fields unchanged. Fails fast with a clear message if
  `GEMINI_API_KEY` is unset.
- `scripts/smoke/voice-tools.smoke.ts` — keyless smoke for the tool executor.

## Verified live with the real key (2026-08-14)

- Model id is `gemini-3.1-flash-live-preview` (`gemini-3.1-flash-live` does NOT
  exist; discover via `GET /v1beta/models` filtering `bidiGenerateContent`).
- The model is AUDIO-out only — `responseModalities:["TEXT"]` is rejected
  (1007). Text output = `outputAudioTranscription:{}` +
  `serverContent.outputTranscription.text`; audio arrives as
  `inlineData audio/pcm;rate=24000` (matches the panel's playback rate).
- Ephemeral tokens: mint works (POST v1alpha `auth_tokens`, token = `name`),
  but they ONLY authenticate against the
  `BidiGenerateContentConstrained` WS method with `?access_token=`; the plain
  `BidiGenerateContent` method rejects them (1008), and `?key=<token>` is
  invalid anywhere. Raw API keys use plain `BidiGenerateContent?key=`.
- Eval results with `--provider live`: ai-healthcare 0.79 (transcript judged
  0.66 — agent is brief by design), youth-marketplace honest-no 0.96.
- Still assumed, works-in-eval but untested from a real mic:
  `realtimeInput.audio` upload shape (browser mic path); fallback if rejected:
  `realtimeInput.mediaChunks:[{mimeType,data}]` in `voice-panel.tsx`.

## Update delivery redesign (2026-08-15 late): silent context vs. spoken turns

The old queue sent every background update as a `turnComplete:true` user turn,
forcing a model response — screening + throttled progress + final = 5-7 chained
monologues per run ("Just to clarify, those results are still populating…").
Fixed using the Live API's own mechanism, verified empirically on
gemini-3.1-flash-live-preview (scripts/smoke/live-silent-context.smoke.ts —
PASS via the app-minted ephemeral token; note: raw `?key=` WS auth now fails
1008 with the current AQ.-format key, so the smoke goes through
/api/voice/token like the panel does):

- `clientContent turnComplete:false` appends SILENT context — no generation;
  the model uses it at its next natural turn (confirmed: it answered a later
  question from silently-appended context).
- `clientContent turnComplete:true` triggers exactly one model turn.
- EITHER kind "will interrupt any current model generation" (docs), so all
  sends wait for a quiet seam: model idle AND >1.5s since the founder's last
  inputTranscription; retried on a 700ms timer + on turnComplete events.

Policy in voice-panel.tsx: screening-done + interview questions → silent
[BACKGROUND CONTEXT]; progress-count updates REMOVED entirely (the screen
shows them); final summary / errors → ONE spoken [ANALYSIS UPDATE], and a
queued spoken item supersedes all interim items. Persona (schema.ts) updated
to match: never re-announce results, never narrate scoring progress, never
speak bracketed text. Also fixed transcript fragment glue (fragments often
omit boundary spaces — "looks likeyour strongest").

## Restructure (2026-08-15): agent-first, background analysis, instant answers

- The agent GREETS FIRST: voice-panel injects a "[SESSION STARTED]" turn on
  setupComplete; persona instructs the greeting.
- analyze_company is intercepted CLIENT-SIDE in voice-panel: tool returns
  {status:"analysis_started"} immediately; the real run streams /api/analyze
  SSE in the background, driving the on-screen UI (onEngineEvent) AND queuing
  "[ANALYSIS UPDATE]" turns (screening done + askable questions within
  seconds, throttled progress counts, final summary). Updates flush between
  model turns (modelSpeaking tracked via modelTurn/turnComplete) so the agent
  weaves them in while it keeps interviewing.
- answer_question is INSTANT via engine/refine.ts (re-gate + subtract,
  reuse LLM scores — see NOTES-eval/engine notes). Answers given while
  ranking still runs are buffered client-side and applied the moment the
  analysis lands.
- Server-side executeVoiceTool keeps synchronous analyze (eval driver +
  text mode); it now accepts priorReport for the refine path.
