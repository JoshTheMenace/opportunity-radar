# Application Studio — research + feature proposal (2026-08-15)

Goal: collapse the 120–180-hour grant application into something a founder can
do in days. Research below is from primary sources (NSF PAPPG/seedfund, NIH
guides, OMB burden statements on the forms themselves, Utah GOEO docs).

## Where the hours actually go (NSF SBIR Phase I as anchor)

NSF's own OMB estimate: **120 hours per proposal** (PAPPG 3145-0058). The R&R
form family averages **58 hours**; NIH quotes 22 hours *excluding the science
writing*. Consultant-assisted founders still spend 30–50 hours over 3–4 months.
Repeat applicants report ~2 months (first) → ~half a week (second) — the
reuse speedup is ~10x and OUR PRODUCT'S JOB is to give first-timers that.

| Bucket | Hours | Agent-compressible? |
|---|---|---|
| Narrative writing (pitch, summary, 10–15pg project description, letters) | ~60–80 | YES — draft from profile+opportunity, founder edits |
| Budget + justification (rule-bound: $305k cap, 2/3 to SB, $1k/day consultants, 50%/15% safe rates, fee ≤7%) | ~10–20 | YES — deterministic calculator + drafted justification |
| Mechanical forms (SF-424 items 1–13+16 are company data; UEI/EIN/addresses/congressional district) | ~5–15 | YES — prefill sheets from a company data vault |
| Compliance assembly (page limits, mandated headers, SciENcv-only biosketches, PDF-only, filename rules, no URLs in project description, 1–3 support letters) | ~10–20 | YES — machine-checkable preflight |
| Registrations (SAM.gov ~3wks, Research.gov 48h, SBA registry 1–2d, eRA 2wks) | ~5–10 active, **6+ weeks calendar** | PARTLY — lead-time-aware runway + status checks; late registration = unappealable rejection |

Killer compliance fact: NIH/Grants.gov reject for illegal attachment
FILENAMES, expired SAM, missing eRA IDs, page-limit overruns — all machine
checkable, all currently discovered after weeks of work.

## Key structural facts to exploit

- **NSF Project Pitch is the gate and it's tiny**: 4 fields, ≤10,500 chars
  total (3,500/3,500/1,750/1,750). Zero registrations needed. Response 1–2mo,
  invitation good for 2 deadlines. An agent can draft the ENTIRE gate document
  from our profile + interview answers in one shot.
- Pitch sections map 1:1 onto Project Summary + Project Description's four
  mandated headers (Intellectual Merit / Company & Team / Broader Impacts /
  Commercialization Potential) — write once, cascade.
- SF-424: fields 1–13 + 16 + 21 are mechanical/pre-populated; the rest of the
  federal family reuses the same entity data. State (Utah GOEO) apps are a
  1–2hr Salesforce questionnaire wanting the SAME company facts.
- Boilerplate docs are genuinely reusable: Facilities & Resources, DMS plan
  (NSF: "all data is proprietary" + checkbox), letters-of-commitment
  templates, budget justification skeleton.
- Deadlines: NSF now 3x/yr (1st Wed Jul, 1st Wed Nov, 1st Thu Mar);
  NIH SBIR Sep 5 / Jan 5 / Apr 5. Registration critical path ≈ 6 weeks.
- Market price of the pain: consultants at $1,000/day (NSF's own cap), NSF
  budgets $6,500 TABA + $10k accounting help; ~120hr × $40–100/hr ≈ $5k–15k
  labor equivalent per application.

## Proposed feature set (ranked by hours-saved × feasibility)

1. **Draft Studio** (biggest pool, ~60–80 hrs → editing hours): per-pursuit
   agent-drafted documents with a section editor. Start with the bounded ones:
   NSF Project Pitch (4 fields w/ char counters), Project Summary (3 mandated
   headers, required opening sentence), Specific Aims (NIH, 1pg), letters of
   support/commitment drafts, facilities boilerplate. Long docs (project
   description) = outline → per-section drafts w/ founder Q&A to fill gaps.
   Infra: new `pursuit_documents` table (own module, pursuit-db pattern);
   completeJSON section generation; grounding rule — facts only from
   profile/DB, agent never invents numbers (repo rule already).
2. **Company Data Vault + prefill sheets** (~5–15 hrs + rejection prevention):
   one canonical entity record (legal name, EIN, UEI, CAGE, SBC Control ID,
   addresses, congressional district, AOR, key personnel + SciENcv status).
   Profile lacks ALL of these today — new table, new interview widgets.
   Output: per-application "copy into the form" sheet mapped field-by-field
   (SF-424 items enumerated in research; values from vault).
3. **Compliance preflight** (kills the 100%-waste case): per-grant checklist
   compiled from the component tables in this file (deterministic) + LLM
   extraction from NOFO text for others. Check page limits, headers,
   filenames, attachment presence, SAM active, letters count.
4. **Registration runway** (calendar compression): lead-time-aware critical
   path already half-exists in plan.ts scaffold — add explicit lead times,
   "start SAM today" urgency when close date < 8 weeks, and (stretch) live
   SAM.gov entity-status check via the public API.
5. **Budget builder** (~10–20 hrs): encoded NSF/NIH rules + drafted
   justification per line.
6. **Application memory** (the 10x repeat effect): vault + documents persist
   per company; second application pre-seeds from the first.

## Constraints / repo notes

- No new deps allowed (package.json frozen) → no docx/pdf libs. Export =
  copy buttons, markdown, print stylesheet (window.print), or .eml precedent.
- types.ts frozen → vault + documents get their own types in their module.
- llm.ts: codex backend ignores maxTokens; anthropic caps at 8k output —
  chunk long docs by section anyway (quality + retry granularity).
- We store only synopses, not solicitation attachments; grants.gov ingest
  has no attachments endpoint wired. NSF/NIH component lists above are
  static-encodable per program family (SBIR NSF / SBIR NIH / generic 424 /
  Utah GOEO) — don't block on document fetching.
