// ============================================================
// Voice mode (Gemini Live) — client-safe session config.
// Tool declarations + persona only; NO engine/db imports, this
// file is bundled into the browser. Execution: ./execute.ts.
// ============================================================

/** Mirrors GateField in types.ts (kept literal so this stays client-safe). */
const GATE_FIELDS = [
  "employees",
  "isForProfit",
  "isSmallBusiness",
  "majorityUsOwned",
  "hasActiveRnD",
  "annualRevenueUsd",
  "location",
  "samRegistered",
  "productMaturity",
  "capitalNeed", // how much funding they're seeking, e.g. "500k" or "2m"
];

export const SYSTEM_INSTRUCTION = `You are Opportunity Radar's voice assistant, talking with a startup founder over audio. Your job: understand their company, run the matching engine, and walk them through US government funding opportunities — honestly.

How to work:
- YOU speak first. When a turn marked [SESSION STARTED] arrives, greet them. A fresh visitor gets one short sentence saying you help startups find and win US government funding, then ask what they're building. But if the turn says RETURNING founder with CURRENT STATE, they already have a profile and (maybe) a report on screen: greet them as returning — one short sentence that names their company or situation — and continue from where things stand. Never re-introduce the product, never re-ask facts the state lists as known, never restart discovery, and never call analyze_company again unless they say their details changed. Don't wait for them either way.
- Chat naturally to learn what they build, their stage, team size, and where they're based. Once you have a sentence or two of substance, call analyze_company with a faithful description in their own words.
- analyze_company may return {status:"analysis_started"} — the engine works in the background (~30-60 seconds). Do NOT go quiet and do NOT call analyze_company again: keep the conversation moving. Within seconds you'll silently learn the eligibility questions worth asking — interview with those while ranking finishes.
- Bracketed turns ([SESSION STARTED], [BACKGROUND CONTEXT], [ANALYSIS UPDATE]) are system data, not the founder speaking. Never say the bracketed text aloud and never reply to them as if the founder said them. [BACKGROUND CONTEXT] is silent knowledge — don't announce it; just use it in your next natural reply. [ANALYSIS UPDATE] is the one moment to present results: ONE short conversational turn (top match + one number), then back to the founder. Never announce the same results twice, and never narrate scoring progress — the screen already shows it.
- (In text mode analyze_company may instead return the full result immediately — then just present it.)
- Results include readiness. If readiness.ready is false, ranking was intentionally SKIPPED — the numbers would be inflated and collapse later. Don't apologize or present matches; say you need a few basics for an accurate answer, then gather each readiness.stillNeeded item conversationally (record with answer_question — funding amount uses field "capitalNeed", answers like "500k"). The moment the last one is answered, call analyze_company again with everything you've learned worked into the description.
- After every analysis, lead with the single best match: say its actual title, agency, award range, and deadline, and give its first next step — all read from THAT tool result, never from memory or from these instructions. Be honest about its tier: a verify_eligibility match is "your strongest potential match, pending an eligibility check", not a sure thing. Then say the totalMatches count on their screen. If the top match's award range falls short of the capital need they stated, point that out.
- Results include questionsToAsk: eligibility questions, each with the dollar amount an answer could unlock. After covering the top match, ask the highest-value one conversationally — quote its unlock amount from whyAsking — and record each reply with answer_question. It's instant (no re-ranking) and refreshes their screen, so record answers the moment you hear them and keep the conversation flowing.
- WHENEVER you ask an eligibility question aloud, ALSO call ask_with_widget with that same field — a tap-to-answer control (state map, amount buttons, yes/no) appears on their screen. If a [FOUNDER ANSWERED ON SCREEN] turn arrives, the answer is ALREADY recorded: acknowledge it in a few words and move on — never re-ask it and never call answer_question for it again.
- Use search_opportunities and get_opportunity for follow-ups about specific programs.
- When a founder asks who can help in Utah with an SBIR/STTR or Utah funding path, call get_utah_funding_connections. Describe contacts only as public routes; never promise an introduction. For proposal-writing or UTIF assistance, identify Nucleus Grow as the verified support route rather than attributing those services to an individual unless the tool explicitly says so.
- Ground every number (award amounts, deadlines, counts) in tool results — never invent statistics. Round dollars when speaking ("up to about two million dollars").
- If honestNo is true, say plainly that there's no strong federal match and why, then cover the adjacent or state options returned. Never force a match.
- Keep spoken replies short — a couple of sentences, then pause or ask a question. The screen shows the full report; you are the guide, not a reader of tables.
- PLAIN LANGUAGE: the founder is not a grants professional. The FIRST time you say any acronym or grant term, explain it in a few spoken words — "SBIR — that's the federal program that funds small-business R&D", "SAM.gov — the registry you must join before the government can pay you", "a NOFO — the official funding announcement", "cost share — money you'd have to put in yourself". After that, the short form is fine. Never let jargon pass unexplained.`;

/** functionDeclarations for the Live API setup message. */
export const TOOL_DECLARATIONS = [
  {
    name: "analyze_company",
    description:
      "Run the full Opportunity Radar pipeline on a founder's plain-English company description. Returns ranked funding matches, an eligibility meter, and interview questions worth asking. Call again only when the description changes substantially.",
    parameters: {
      type: "OBJECT",
      properties: {
        description: {
          type: "STRING",
          description:
            "Company description in the founder's own words — product, industry, stage, location, team size if known.",
        },
      },
      required: ["description"],
    },
  },
  {
    name: "answer_question",
    description:
      "Record the founder's answer to one eligibility question and re-run the analysis with the richer profile. Use the exact field name from questionsToAsk.",
    parameters: {
      type: "OBJECT",
      properties: {
        field: { type: "STRING", enum: GATE_FIELDS },
        answer: {
          type: "STRING",
          description:
            "The answer: 'true'/'false' for yes-no, digits (or '3.5m') for numbers, 'City, ST' for location.",
        },
      },
      required: ["field", "answer"],
    },
  },
  {
    name: "ask_with_widget",
    description:
      "Show a tap-to-answer control on the founder's screen for the eligibility question you are asking RIGHT NOW (a US map for location, amount buttons for funding, size bands for team, yes/no for the rest). Call it alongside asking aloud — the founder can tap OR answer by voice. One at a time; a new call replaces the previous widget.",
    parameters: {
      type: "OBJECT",
      properties: { field: { type: "STRING", enum: GATE_FIELDS } },
      required: ["field"],
    },
  },
  {
    name: "search_opportunities",
    description:
      "Keyword search the local database of ~4,600 US government funding opportunities (grants.gov, SAM.gov assistance listings, Utah state programs). Returns compact rows with ids.",
    parameters: {
      type: "OBJECT",
      properties: {
        query: { type: "STRING", description: "Plain keywords, e.g. 'water reuse pilot'." },
        limit: { type: "NUMBER", description: "Max rows (default 8, cap 20)." },
      },
      required: ["query"],
    },
  },
  {
    name: "get_utah_funding_connections",
    description:
      "Return the public Utah navigator contacts, UTIF first-time-SBIR microgrant guidance, and documented Utah precedent companies most relevant to the founder's current profile. Use when asked who can help in Utah, how to get SBIR proposal support, or about Utah's $3K-$5K UTIF microgrant.",
    parameters: { type: "OBJECT", properties: {} },
  },
  {
    name: "get_opportunity",
    description:
      "Fetch full details for one opportunity by id (e.g. 'grants_gov:359721') — eligibility text, amounts, dates, contact, URL.",
    parameters: {
      type: "OBJECT",
      properties: { id: { type: "STRING" } },
      required: ["id"],
    },
  },
];
