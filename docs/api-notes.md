# Verified external API notes (probed live 2026-08-14)

Everything below was verified by direct calls. Follow exactly; don't guess.

## Grants.gov (no auth)

- `POST https://api.grants.gov/v1/api/search2` — JSON body. Always HTTP 200;
  check `data.hitCount`. Params: `keyword`, `oppStatuses` ("forecasted|posted"),
  `rows` (uncapped; 5000 works), `startRecordNum`, `agencies`, `fundingCategories`,
  `eligibilities`, `fundingInstruments`, `cfda` (works; `aln` is silently DEAD).
  Bad `sortBy` silently returns empty oppHits — omit sortBy.
  Response `data.oppHits[]`: {id, number, title, agencyCode, agency, openDate
  "MM/DD/YYYY", closeDate (may be ""), oppStatus, docType, cfdaList[]}.
- `POST https://api.grants.gov/v1/api/fetchOpportunity` — body {"opportunityId": <id>}.
  `data.synopsis`: synopsisDesc (HTML — strip it), applicantEligibilityDesc,
  applicantTypes[]{id,description}, awardCeiling/awardFloor (STRING; may be
  literal "none" — do not parseInt blindly), estimatedFunding, numberOfAwards,
  agencyContactName/Email, responseDate, postingDate, machine dates in *Str
  fields ("2026-10-19-00-00-00"). `data.opportunityPkgs[].expectedApplicationCount`
  (often null; NIH boilerplate 100). `data.cfdas[]{cfdaNumber, programTitle}`.
  Detect bad id by missing `data.id`.
- Eligibility codes: 00,01,02,04,05,06,07,08,11,12,13,20,21 = govt/nonprofit/edu;
  22 = for-profit (non-small); 23 = small business; 25 = other; 99 = unrestricted.
  Small-business friendly = codes ∩ {22,23,25,99} ≠ ∅ (or empty list = unknown).
- Be polite: sequential fetchOpportunity calls with ~100ms delay; cache in DB.

## SAM.gov Assistance Listings (no auth needed via these paths)

- Weekly CSV (verified, 23MB, 2864 rows, 38 cols):
  `https://sam.gov/api/prod/fileextractservices/v1/api/download/Assistance%20Listings/datagov/{YYYY}/{MM-Mon}/AssistanceListings_DataGov_PUBLIC_WEEKLY_{YYYYMMDD}.csv?privacy=Public`
  Discover newest: `https://sam.gov/api/prod/fileextractservices/v1/api/listfiles?domain=Assistance%20Listings/datagov/2026/08-Aug`
  Key columns: "Program Title", "Program Number" (ALN), "Federal Agency (030)",
  "Objectives (050)", "Types of Assistance (060)", "Applicant Eligibility (081)",
  "Beneficiary Eligibility (082)", "Range and Average of Financial Assistance (123)",
  "Website Address (110)". CSV has quoted multiline fields — use a real CSV parser.
- Keyless search: `https://sam.gov/api/prod/sgs/v1/search/?index=cfda&q=<kw>&qMode=ALL&is_active=true&page=0&size=25&mode=search`
- Detail: `https://sam.gov/api/prod/fac/v1/programs/{programId}` (path form is public).
- NOTE: `api.sam.gov` (official API) is blocked from datacenter IPs; the
  sam.gov/api/prod/* endpoints above work. Use curl-style fetch with a
  desktop User-Agent header.

## SBIR.gov — API IS DOWN (403 "maintenance")

- Do NOT rely on api.www.sbir.gov. Fallback: CSV award data downloads from
  sbir.gov Data Resources; if unreachable, skip — USAspending covers evidence.
- Open solicitations fallback: search grants.gov keyword "SBIR" and flag
  kind="sbir_sttr" when title/number matches /SBIR|STTR/i.

## USAspending v2 (no auth)

- `POST https://api.usaspending.gov/api/v2/search/spending_by_award/`
  body: {"filters": {...}, "fields": [...], "limit": <=100, "page": n,
  "sort": "Award Amount", "order": "desc"}.
  filters: award_type_codes REQUIRED (grants ["02","03","04","05"], contracts
  ["A","B","C","D"]); keywords (each term >=3 chars); time_period
  [{start_date, end_date}] (floor 2007-10-01); recipient_locations
  [{"country":"USA","state":"UT"}]; program_numbers ["93.310"] = ALN filter;
  naics_codes (contracts only); award_amounts [{lower_bound, upper_bound}].
  Grant fields: ["Award ID","Recipient Name","Recipient UEI","Award Amount",
  "Start Date","End Date","Description","CFDA Number","Awarding Agency",
  "recipient_id","generated_internal_id"]. Do NOT mix NAICS/PSC fields with
  CFDA fields in one request.
- Counts: `POST /api/v2/search/spending_by_award_count/` (same filters).
- Award detail: `GET /api/v2/awards/{generated_internal_id}/` → includes
  funding_opportunity.number (joins to grants.gov opportunity number).
- Recipient profile: `POST /api/v2/recipient/` {"keyword": name} then
  `GET /api/v2/recipient/{id}/`.
- Award link for citations: https://www.usaspending.gov/award/{generated_internal_id}
- Max limit 100/page; compute medians client-side; cache in evidence_cache.

## NIH RePORTER (no auth)

- `POST https://api.reporter.nih.gov/v2/projects/search`
  {"criteria":{"org_states":["UT"],"fiscal_years":[2025],"activity_codes":["R43","R44"]},
   "limit": 50} → org name/city, award amount, PI, full abstract.

## NSF Awards (no auth)

- `GET https://api.nsf.gov/services/v1/awards.json?awardeeStateCode=UT&keyword=SBIR&printFields=id,title,awardeeName,awardeeCity,fundsObligatedAmt,date,abstractText,piEmail`

## Codex app server — WIRED (verified live, codex-cli 0.146.0)

- Adapter: src/lib/llm-codex.ts. Spawns `codex app-server` (stdio JSON-RPC,
  newline-delimited, jsonrpc 2.0 envelope). Flow: initialize -> initialized
  notification -> thread/start {model:"gpt-5.6-sol", ephemeral:true,
  sandbox:"read-only", approvalPolicy:"never", config:{mcp_servers:{}}} ->
  turn/start {threadId, input:[{type:"text",text,text_elements:[]}],
  effort, outputSchema?} -> notifications item/completed
  (item.type==="agentMessage" -> .text) and turn/completed terminate the call.
- outputSchema constrains the final message to a JSON Schema (verified).
- ~4-5s/call at effort "low". Concurrent calls OK (one thread per call).
- Auth: Josh's ChatGPT subscription via ~/.codex/auth.json — no API key needed.

## DSIP — DoD SBIR/STTR Innovation Portal (no auth; verified live 2026-08-15)

- What Josh called "DCIP" — the actual DoD SBIR portal is DSIP at dodsbirsttr.mil.
  (The real DCIP — Defense Community Infrastructure Program, OLDCC — funds local
  governments near bases, not businesses: not relevant to founder matching.)
- `GET https://www.dodsbirsttr.mil/topics/api/public/topics/search?searchParam=<urlencoded JSON>&size=200&page=0`
  searchParam: {"searchText":null,"component":null,"programYear":null,
  "topicReleaseStatus":[591],"sortBy":"finalTopicCode,asc"}. Status 591 = Open
  (accepting submissions). Response {total, data[]}: topicId, topicCode,
  topicTitle, component (ARMY/DAF/DON/DARPA…), program (SBIR|STTR),
  solicitationNumber, topicEndDate (EPOCH MS, not ISO), topicPreReleaseStartDate.
- `GET .../topics/{topicId}/details` → objective, description,
  phase1Description (HTML — strip), keywords, technologyAreas. Phase I cost
  limit is stated in phase1Description prose ("cost limit of $300,000") — first
  $ amount ≥ $10K is a safe ceiling parse.
- `.../topics/{topicId}` WITHOUT /details 500s; the bare /topics-app/api path
  403s — only /topics/api/public/* works. Desktop User-Agent header required.
- Ingest: scripts/ingest/dsip.ts → source "sbir", ids "sbir:<topicCode>".
  ~35 open topics at any time; sequential detail fetches at ~120ms are polite.

## Dedupe / join strategy across sources

- Primary key namespace prevents cross-source collisions: grants_gov:<id>,
  assistance_listing:<ALN>, utah:<slug>, sbir:<topicCode>. Re-ingest is safe:
  INSERT_OPPORTUNITY_SQL is ON CONFLICT(id) DO UPDATE (keeps rowid, FTS stays
  consistent).
- DSIP topics vs grants.gov: DoD SBIR umbrella BAAs occasionally appear on
  grants.gov as one broad notice; DSIP rows are per-topic. Both levels are
  legitimate matches — no dedupe needed; join key if ever needed is
  solicitationNumber (kept in raw JSON) against the grants.gov opportunity
  number.
- Assistance listings vs grants.gov: joined by ALN/CFDA (alnNumbers) — the
  evidence module already uses this for USAspending program_numbers.
- DSIP/SBIR evidence: USAspending covers SBIR awards as contracts
  (award_type_codes A-D) — keyword joins (company name + "SBIR") work; no ALN.

## Utah state sources — probed 2026-08-15, no stable public APIs

- Utah procurement (U3P) moved to Bonfire: utah.bonfirehub.com. Portal is an
  SPA; every guessed JSON path (api/portal/*, *.json) 404s to an HTML error
  page. No public feed — hand-curate any headline bid or revisit with a real
  session capture post-hackathon.
- grants.utah.gov → Salesforce Experience site (/s/): state-administered
  (mostly federal pass-through) grants aimed at governments/nonprofits; SPA,
  no public JSON. Low founder relevance; skip.
- Conclusion: the hand-curated data/utah-opportunities.json layer (25 programs
  incl. UTIF, SSBCI, STEP, Manufacturing Modernization, APEX, Custom Fit) IS
  the Utah integration — richer than anything scrapable, and the ingest
  validates every row against the Opportunity contract.

## Resend (email delivery — RESEND_API_KEY in .env.local)

- `POST https://api.resend.com/emails` — headers `Authorization: Bearer <key>`,
  JSON body `{from, to: [..], subject, text}`. Success = 200 + `{id}` (verified
  live 2026-08-15). Errors return `{statusCode, message}` — surface `message`.
- Sandbox rule: until a domain is verified in the Resend dashboard, `from`
  MUST be `onboarding@resend.dev` and delivery only works to the account
  owner's address. Override sender with `RESEND_FROM` once a domain exists.
- Integration lives in `src/lib/monitor/deliver.ts` (plain fetch, no SDK);
  watcher sends real email per notification when the key is set, and always
  writes the .eml to data/outbox/ regardless.
- Smoke test: `set -a; source .env.local; set +a; pnpm tsx scripts/smoke/resend.smoke.ts`
