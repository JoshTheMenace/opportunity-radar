# Notes from the readiness module

Ranking readiness: the interactive flow (facade/voice, `gatherFirst: true`)
holds the expensive LLM ranking until required basics are known, because
early numbers are inflated and collapse as answers arrive. One-shot pipeline
callers (eval) always rank.

- `src/lib/engine/readiness.ts` — REQUIRED set, DATA-DERIVED via
  `scripts/investigate-readiness.ts` (2026-08-15, 4,594 open opps):
  capitalNeed (326 opps / $104M flip to fail at a $1M ask — the amount gate
  passes softly while need is unknown, the #1 inflation source), the SBIR
  trio hasActiveRnD/majorityUsOwned/employees ($86M unknown-gated), location
  (Utah's 24), isSmallBusiness-or-employees ($8M + SBIR size). ~57% of
  unknown-gated dollars are "not machine-readable" — unresolvable, honest as
  verify_eligibility.
- Flow: sparse intake → 13.7s hold (screening + required-first questions) →
  answers refine instantly → the answer that completes readiness triggers
  the ONE full ranking run (/api/answer `shouldRefine`; voice persona
  re-calls analyze_company).
- capitalNeed is askable: freeform parses capitalNeedMin/MaxUsd; voice
  answer_question accepts pseudo-field "capitalNeed" ("500k").
- Eval: `eval/interview-answers.ts` models each brief founder answering the
  interview (cases.ts stays locked); live driver sends the follow-up message
  and only settles on a ranked/ready report.
- UI: ReportView "A few basics first" panel, MeterPanel `preliminary` flag,
  "needed for ranking" badges (isRequiredField).
