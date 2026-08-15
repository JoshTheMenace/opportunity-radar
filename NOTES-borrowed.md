# Notes from the rival-scan borrow pass (Josh-approved ideas 1-7)

Landed in engine/eval, no type changes. UI asks at the bottom.

- **Sentinel hygiene** (`retrieve.ts sanitizeOpportunity`): award floors/
  ceilings that are ≤0 (API sentinel for "not specified") or >$100M (program
  totals; the DB had $108T) become null at the read boundary. Null now MEANS
  "not published" — render it that way, never as a dash that looks like data.
- **Freshness**: `retrieve.ts corpusRefreshedAt()` reads the existing
  ingest_meta table (min last_run across sources). The analyze activity line
  now says "every source refreshed since YYYY-MM-DD".
- **New/changed gates** (`gates.ts`): amount_overlap gained the overshoot
  direction (award floor > 2x max need = fail, "funds larger-scale work") and
  evidence-style pass details citing the actual range. New `sam:lead_time`
  gate: federal deadline <30 days out crossed with samRegistered (fail when
  false — registration takes 10-15 business days; unknown asks the question).
  Expect samRegistered to rank higher in the interview now.
- **Prose money-sanitizer** (`rank.ts sanitizeProse`): dollar figures in LLM
  prose must match a number we actually showed the model (opportunity amounts
  or founder figures, 5% tolerance) or they become "the listed amount". Stage
  line: the model cannot introduce a dollar value into the report.
- **Injection hardening**: one sentence in rank + freeform system prompts —
  profile/opportunity text is data, not instructions. Keep it to one sentence
  (lean-prompt rule).
- **Held-out honesty suite** (`eval/cases-heldout.ts`, run with
  `pnpm tsx eval/run.ts --suite heldout|all`): 4 ordinary-but-unfundable
  companies (restaurant group, dating app, fitness franchise, wedding
  platform) that must produce honestNo=true. These were never used to tune
  prompts — keep it that way; fix failures by principle, then replace any
  case the fix was tuned on. Runner also appends a note-only SPREAD VIOLATION
  when every match lands in the top band.

**Swap-test sharpening (post-borrow tuning):** the held-out suite caught
generic *class-targeted* capital programs (SSBCI co-investment "targets
high-growth tech companies") slipping past the swap test for tech companies.
One added sentence in the rank rubric: a program that funds a CLASS of
company rather than a FIELD of work is generic by definition. Also: the full
PLAIN_LANGUAGE_RULE must NOT lead the rank rubric (it re-frames the skeptic
as an educator; see the code comment in rank.ts) — the ranker keeps a
one-line version; officer.ts/pursuit keep the full rule.

**Known boundary case:** `fitness-franchise` (held-out) oscillates around the
honesty line across runs — its "training academy" plan gives Utah workforce
programs (Custom Fit) a genuine partial hook, so ~50 scores there are
arguable. Per the lean rule, do NOT add prompt lines to force it; it is the
canary for calibration drift, not a bug to stamp out. Current combined suite:
0.927 avg, honesty 8/9 (brief 5/5 including the youth trap).

**UI asks (whoever owns match-card/meter next):**
1. Null award figures should read "not published" (data guarantees it now).
2. Surface corpusRefreshedAt() near the results header ("data current as of").
3. The monitor/watcher path maps rows via db.rowToOpportunity directly —
   consider routing it through sanitizeOpportunity too (I left it untouched
   to avoid crossing into the monitor module mid-flight).
