# Demo polish punch list (2026-08-15, 4-agent review)

Sources: live judge-walkthrough at :56545, engine code review, product
critique, UI code sweep. Ranked by demo impact. Owner column suggests who
touches it (app = frontend session's turf, lib = engine/monitor side).

## P0 — demo blockers

1. **Broken edit sighted live**: match-card.tsx imported `TIERS` from shared.ts
   (which exports `TIER_META`) → full-screen build error on every route for
   ~1 min mid-review before HMR healed. Freeze src/app edits well before the
   demo; run `pnpm next build` clean as the gate. (app)
2. **Nav 404s**: app-nav.tsx links "Profile"→/profile and "Utah View"→/utah —
   neither route exists (Utah content lives at /people; activeFor() already
   maps it). Bell + help IconButtons have no onClick (ui/navigation.tsx:106).
   Judges click these in the first 10 seconds. (app)
3. **Honesty contradiction**: top-ranked match "Farm of the Future" (score 58)
   is land-grant-universities-only per its own detail page — the demo startup
   categorically can't apply, under an "honest matches only" tagline. Gate
   should catch "Land Grant Universities only" prose (or hand-demote the
   listing). (lib: gates/rank)
4. **Demo state hygiene**: saved profile carried phantom "600 employees" →
   SBA small-business=No → silently blocks 6 SBIR programs and the report
   cites it as a disqualifier. App currently mixes 3 different companies
   (Logan agtech profile, Ogden aerospace pursuit, Nightingale monitor) and
   shows josh.gimenes1@gmail.com on /radar. Need a `scripts/demo-reset.ts`
   that purges to one coherent demo company + decides fresh-vs-prewarmed
   localStorage. (lib/scripts)
5. **Live streaming doesn't stream in the common case**: rank.ts:322 skips
   onProgress when the finishing batch is the last one → with ≤15 candidates
   (single batch) NO partial report is ever emitted; final report then waits
   on evidence lookups (up to 10s timeout × 5 opps, pipeline.ts:186) before
   anything renders. Meanwhile the UI shows "No strong matches yet — nothing
   scored high enough" during the entire wait (reads as failure), and the
   time estimate showed "~430s left" for a 55s run. Fix: emit onProgress on
   every batch, stream a partial report before the evidence phase, replace
   the false empty-state copy with a "still scoring" state, cap the ETA.
   (lib rank/pipeline + app report-view)
6. **Layout void / mobile breakage**: after Send/expand/CTA clicks a white
   band (110–370px) appears above the sticky header; at 375px the report has
   a ~1400px blank region after the first card + horizontal scrollbar; nav
   clipped mid-word with no hamburger. (app)

## P1 — credibility polish (judge-visible)

7. Agency names render raw/inverted: "Energy, Department of, Energy,
   Department of", dangling commas. De-invert + dedupe at render (or a
   shared formatter in lib). (app/lib)
8. "Your funding twin: City of Spanish Fork" on ALL cards — a city gov is a
   nonsensical twin for a startup; pick per-program, prefer company-type
   matches, hide when weak. (lib evidence)
9. "Comparable federal-contract paths" = noise ("Door Locks, Fdu's and
   Cables" for a solar-irrigation company). Filter by relevance or drop
   the section. (lib evidence)
10. Raw dev errors shown to founders: opportunity-map.tsx:270 renders
    e.message ("HTTP 500", "Failed to fetch"); same in match-card officer
    panel + save-monitor. Map to human copy. Also off-kit hex #F2C4BC on
    the main error banner. (app)
11. /radar polish: raw enum chips ("likely_fit"), false empty-state flash
    before first fetch (init [] → null sentinel like pursuits/page.tsx),
    "MONEY CURRENTLY HELD $0/$0/$0" panel post-answers, plain-text <pre>
    email preview while styled emailHtml sits unused in DB — render it in a
    sandboxed iframe instead. (app + /api/notifications)
12. Hardcoded "4,600 programs" vs 4,630 in DB — show the live count
    (report-view.tsx, intake). (app)
13. Officer preview caption: one line "Simulated review, grounded in the
    posted notice — scores snap to 5s, tier by rule" turns skeptics into
    believers. (app)
14. Opportunity detail: hide empty stat tiles ("unlisted"/"—" ×3 on the top
    match); breadcrumb says "Pursuit Workspace /" before any pursuit exists.
    (app)
15. Copy nits: stray leading "·" in footer sources; "1 awards"; mangled
    title casing ("…OF NEW Innovators TO…"); "Company name: Unknown" at
    "100% complete"; Action Plan steps all "rolling — start when ready" ×3;
    "Logan You" run-together in Utah city list. (app)
16. Assistant drawer: Enter doesn't send (only the arrow button). Submit on
    Enter, newline on Shift+Enter. (app)
17. Naming unification: monitor has 5 names (Screening/Radar/brief/
    Proactive monitoring/Monitor) — pick "Radar". Apply flow: nav "Apply
    Now" lands on empty "No pursuits yet"; pick "Pursuits" as the noun.
    One tier vocabulary (TIER labels everywhere, not raw enums). (app)

## P2 — memorability builds

18. **Application Studio v0 (biggest lever)**: one button in pursuit-panel —
    "Draft my Project Pitch" → generates the 4 NSF Project Pitch fields
    (3500/3500/1750/1750 chars) from profile + interview answers via
    completeJSON, live char counters, copy buttons. Own module under
    src/lib/pursuit/, facts only from profile/DB. Closing demo line: "the
    document that gates $305K was just drafted from the interview you
    already did." See NOTES-application-studio.md. (lib + app panel)
19. **Honest-no one tap away**: 4th intake sample chip ("Consumer app",
    eval youth-marketplace text) so the refusal — the product's soul — is
    demoable on stage. (app intake-panel)
20. **Email as scripted beat**: scripts/demo-inject.ts + watcher + Resend to
    the account-owner inbox on the projector; fallback = outbox
    preview.html. Rehearse. (ops)
21. /dream: orphaned (no nav link) and currently shows only failures
    ("Identity uncertain — no changes", 0 fields updated, raw
    vertexaisearch redirect URLs). Seed one successful finding, fix link
    labels, link it from nav or fold a "While you slept" card into /radar.
    (app + lib dream)
22. Voice mode: highest variance on stage (mic + live API + venue wifi;
    NOTES-voice records WS auth breakage). Rehearse twice or cut to cameo;
    agent-dock narration carries "it's alive" cheaply. (ops)

## P3 — hygiene

23. Delete dead files: side-nav.tsx (unused TopNav), meter-panel.tsx +
    interview-panel.tsx (superseded by unlock-panel), tierRail()/rail in
    shared.ts. Note ui/* has ~11 unconsumed scaffolding exports (intentional
    per "convert on touch" — leave). (app)
24. API robustness: /api/companies parses body without .catch(()=>null)
    (500s on malformed JSON); pursuits/[id]* routes bind NaN ids into
    SQLite (TypeError instead of 404). (app api)
25. Voice tool-call race: voice-panel.tsx:530 fire-and-forget handleToolCalls
    → stale report can overwrite newer one; serialize or version the
    updates. (app voice-panel)
26. field-widgets UsStateMap: role="listbox" but mouse-only — add tabIndex +
    Enter/Space handling. (app)
27. Pre-demo ops: restart dev server fresh (stale-HMR gotcha), rotate
    GEMINI_API_KEY + RESEND_API_KEY (both were pasted in chats), DESIGN-
    SPEC.md still decrees the old #1D4F91/Inter law — mark superseded by
    catalyst-kit or agents will style against the wrong spec. (ops/docs)

## Already great — lean on these in the demo
Freeform answer parsing ($750K + SAM in one sentence), progressive radar
plot + analyst log, pre-flight plan generator (it independently caught the
land-grant conflict), page-aware Assistant, Utah same-city winners +
navigator directory, profile provenance UI, meter attribution math (chips
can't sum past the locked pool), officer determinism (snap-5 scores, tier
by rule), watcher dedupe + styled emails. The engineering honesty is the
differentiator — say the rules out loud on stage.
