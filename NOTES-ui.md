# Notes from the UI/API module

## Component structure (mission-control restructure, 2026-08-15 evening)

`opportunity-map.tsx` stays the only stateful orchestrator (SSE stream,
profile state, quick-reply fetch, spotlight). Visual regions live in
`src/app/components/`, one file per region:

- `intake-panel.tsx` (#intake — description box, analyze, sample chips)
- `agent-dock.tsx` (#agent — ONE agent presence: RadarScope face, status
  line, StatusStrip progress, narration log with pointing power; meter/
  interview/voice render inside it as children). Replaces the old
  `activity-feed.tsx`, which is DELETED — its scope+log behavior lives here.
- `meter-panel.tsx` (#meter), `interview-panel.tsx` (#interview),
  `status-strip.tsx`, `radar-scope.tsx` — unchanged internals, now composed
  inside the dock.
- `report-view.tsx` (#report — ReportView/HonestNoPanel/ReportSkeleton/HowItWorks)
- `match-card.tsx` (match card + evidence strip + spotlight + `card-in`
  materialize animation, staggered by `index`)
- `side-nav.tsx` (desktop sidebar nav links with active state)
- `shared.ts` (UiReport, QuickReply, `Spotlight {id, nonce}`, fmtUsd, …)

Layout: `layout.tsx` is the mission-control shell — desktop gets a fixed left
rail (brand, SideNav, live program count via `countBySource()`, sources);
mobile keeps the slim top bar + footer. Pages render in the remaining column.
The analyze page is `#intake` + `#workspace` = `#canvas` (report) +
`#agent-rail` (sticky AgentDock; always mounted so voice is reachable
pre-run). Restyle by editing region files; don't move state back into
components.

## Spotlight contract (the agent's pointing power)

- `opportunity-map` owns `Spotlight {id, nonce}` state. Set by (a) clicking an
  "Evidence: … for <title>" narration line in the dock (matched by title
  suffix against `report.opportunities`), and (b) automatically on run
  completion → top visible match.
- `ReportView`/`HonestNoPanel` accept `spotlight` and forward
  `spotlight={nonce}` to the one matching MatchCard; MatchCard scrolls itself
  into view and (re)fires the `card-spotlight` ring, clearing it when the
  agent points elsewhere. Nonce changes let the same card be pointed at twice.

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

## 2026-08 full redesign — "Catalyst" (paper-ledger RETIRED)

The dark paper-ledger theme is gone. New system: light institutional gov-tech
(reference screenshot: "Federal Catalyst"; approved synthesis mockup:
`public/design-mocks/final.html`). Read `DESIGN-SPEC.md` (repo root) before
styling ANYTHING — tokens, Tailwind recipes, and rules live there.

- globals.css defines the new tokens (bg/card/hairline/ink/muted/faint/
  brand/brand-strong/accent/soft/good/warn/risk + -soft tints, .shadow-card).
  Legacy names (paper, panel, panel-2, brass, treasury, signal) are ALIASED to
  light equivalents so old classes don't break — but migrate them on touch.
- Fonts: Inter (all UI; --font-display also = Inter, Fraunces removed) +
  IBM Plex Mono (labels/data/buttons only). Public Sans removed.
- Shell: layout.tsx is now a white sticky TOP navbar (wordmark + Radar/
  Pursuits/Monitor links from components/side-nav.tsx, which exports TopNav).
  The left sidebar is gone; pages render full-width below the nav.
- One blue (brand #1D4F91). Red = deadlines/alerts ONLY. Mono = chrome only.
- Design-system previews are synced to the claude.ai/design project
  "Opportunity Radar" (foundations/components/pages cards).

## Federal Catalyst adoption (2026-08-15 late) — the teammate's UI, not just its skin

Canonical references: design/claude-design/*.html (PR #1 screens) + the
"Federal Catalyst UI Kit" (Josh's file; multi-tab React bundle). globals.css
tokens are now the kit's EXACT hexes; fonts Hanken Grotesk / Inter /
JetBrains Mono.

Opportunity Map page = kit 12-col anatomy:
- col 1-3: profile-card.tsx (kit founder dossier: completeness bar, initials
  avatar, confidence chip, red pulsing Unknown rows) + action-plan.tsx (dated
  timeline from the TOP match's buildTimeline).
- col 4-9: intake + report-view.tsx = "Top Matches" header w/ live counts,
  ONE score-ordered list (tier groups removed; chips carry tier), the
  "Held — Missing Data" dashed card for the readiness hold (Resolve →
  #unlock), match-card.tsx in full kit anatomy (header band w/ chip+ID+$+
  deadline, why/disqualify bullet columns, "Who else got this money" +
  YOUR FUNDING TWIN from evidence.similarAwards[0], footer w/ Start
  Pre-flight →). Stat band deleted — counts live in the header line.
- col 10-12: unlock-panel.tsx (NEW — absorbs meter-panel + interview-panel
  on this page: "reveal $X across N programs" copy, ONE active question with
  its FieldWidget, queued questions w/ +$ unlock chips, quick replies,
  freeform input) + agent-dock.tsx (unchanged) with VoicePanel inside.
- meter-panel.tsx / interview-panel.tsx are no longer mounted on the map
  page (interview-panel still referenced by voice stage docs; files kept).

Pursuit Workspace (= kit tab 2): pursuits/page.tsx is the shell (Active
Grants rail + inline PursuitPanel w/ ?id= deep link); pursuit-panel.tsx has
the kit anatomy (header, % ready, phase stepper, stat tiles, per-phase task
cards, HOW TO FINISH THIS document panel, SAM.gov warning banner, Deadline
Timeline rail).
