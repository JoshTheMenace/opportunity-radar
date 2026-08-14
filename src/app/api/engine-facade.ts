// ============================================================
// UI-facing facade over the engine pipeline.
// The real pipeline (src/lib/engine/pipeline.ts) is written by
// another agent; we import it lazily at request time and fall
// back to canned demo data when it's missing, so the UI is
// demoable standalone.
// ============================================================
import type {
  AnalyzeEvent,
  CompanyProfile,
  EligibilityMeter,
  GateField,
  GatedOpportunity,
  InterviewQuestion,
  MatchReport,
  Opportunity,
  RankedMatch,
} from "@/lib/types";

export type Emit = (e: AnalyzeEvent) => void;

/** MatchReport plus an id→Opportunity lookup so match cards can render details. */
export type UiMatchReport = MatchReport & {
  opportunities: Record<string, Opportunity>;
};

type PipelineModule = {
  runAnalysis(
    founderText: string,
    prior: Partial<CompanyProfile> | null,
    emit: Emit,
  ): Promise<MatchReport>;
};

async function loadPipeline(): Promise<PipelineModule | null> {
  try {
    // Split specifier keeps the bundler from hard-failing the build while
    // pipeline.ts doesn't exist yet; it becomes a lazy context import.
    const name = "pipeline";
    const mod = (await import(`@/lib/engine/${name}`)) as Partial<PipelineModule>;
    return typeof mod.runAnalysis === "function" ? (mod as PipelineModule) : null;
  } catch {
    return null;
  }
}

export async function runAnalysis(
  founderText: string,
  prior: Partial<CompanyProfile> | null,
  emit: Emit,
): Promise<UiMatchReport> {
  const pipeline = await loadPipeline();
  if (pipeline) {
    const report = await pipeline.runAnalysis(founderText, prior, emit);
    return { ...report, opportunities: await lookupOpportunities(report) };
  }
  emit({
    type: "activity",
    message: "engine pipeline not wired yet — streaming stub demo data",
  });
  return stubAnalysis(founderText, prior, emit);
}

/** Resolve match opportunityIds to full rows so the UI can render cards. */
async function lookupOpportunities(
  report: MatchReport,
): Promise<Record<string, Opportunity>> {
  const map: Record<string, Opportunity> = {};
  try {
    const { getDb, rowToOpportunity } = await import("@/lib/db");
    const stmt = getDb().prepare("SELECT * FROM opportunities WHERE id = ?");
    for (const m of report.matches) {
      const row = stmt.get(m.opportunityId) as Record<string, unknown> | undefined;
      if (row) map[m.opportunityId] = rowToOpportunity(row);
    }
  } catch {
    // DB missing/empty — cards degrade gracefully client-side.
  }
  return map;
}

/** Wrap a pipeline run in an SSE Response; emits the final report event. */
export function sseResponse(run: (emit: Emit) => Promise<UiMatchReport>): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: Emit = (e) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        const report = await run(emit);
        emit({ type: "report", report });
      } catch (err) {
        emit({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

// ------------------------------------------------------------
// Stub demo pipeline (used until engine/pipeline.ts lands)
// ------------------------------------------------------------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isoIn = (days: number) =>
  new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

function emptyProfile(description: string): CompanyProfile {
  return {
    description,
    name: null,
    industry: null,
    naicsGuesses: [],
    technologyKeywords: [],
    govKeywords: [],
    location: null,
    employees: null,
    annualRevenueUsd: null,
    capitalRaisedUsd: null,
    fundingStage: null,
    isForProfit: null,
    isSmallBusiness: null,
    majorityUsOwned: null,
    hasActiveRnD: null,
    productMaturity: null,
    capitalNeedUsd: { min: null, max: null },
    useOfFunds: null,
    targetCustomers: null,
    samRegistered: null,
    milestones: [],
  };
}

function makeOpp(o: Partial<Opportunity> & Pick<Opportunity, "id" | "title" | "agency">): Opportunity {
  return {
    source: "grants_gov",
    kind: "grant",
    agencyCode: null,
    description: "",
    alnNumbers: [],
    eligibilityCodes: [],
    eligibilityText: null,
    openToSmallBusiness: true,
    awardFloorUsd: null,
    awardCeilingUsd: null,
    estimatedTotalUsd: null,
    expectedAwards: null,
    expectedApplications: null,
    openDate: null,
    closeDate: null,
    status: "posted",
    url: null,
    contactName: null,
    contactEmail: null,
    raw: null,
    ...o,
  };
}

const STUB_OPPS: Opportunity[] = [
  makeOpp({
    id: "grants_gov:stub-nsf-sbir",
    kind: "sbir_sttr",
    title: "NSF SBIR Phase I (America's Seed Fund)",
    agency: "National Science Foundation",
    description: "R&D funding for deep-tech startups; non-dilutive.",
    awardCeilingUsd: 305000,
    expectedAwards: 400,
    expectedApplications: 2200,
    closeDate: isoIn(21),
    url: "https://seedfund.nsf.gov/",
  }),
  makeOpp({
    id: "grants_gov:stub-nih-sbir",
    kind: "sbir_sttr",
    title: "NIH SBIR Phase I (Omnibus Solicitation)",
    agency: "National Institutes of Health",
    description: "Health-focused small business R&D grants.",
    awardFloorUsd: 150000,
    awardCeilingUsd: 314363,
    expectedAwards: 900,
    closeDate: isoIn(52),
    url: "https://sbir.nih.gov/",
  }),
  makeOpp({
    id: "grants_gov:stub-eda-b2s",
    title: "EDA Build to Scale — Venture Challenge",
    agency: "Economic Development Administration",
    description: "Scaling technology entrepreneurship ecosystems.",
    awardCeilingUsd: 750000,
    expectedAwards: 50,
    closeDate: isoIn(60),
    url: "https://www.eda.gov/funding/programs/build-to-scale",
  }),
  makeOpp({
    id: "utah:stub-innovation-fund",
    source: "utah",
    kind: "equity",
    title: "Utah Innovation Fund",
    agency: "Utah Innovation Fund (state)",
    description: "State seed capital for Utah-based startups.",
    awardCeilingUsd: 250000,
    status: "open",
    url: "https://innovationutah.com/",
  }),
];

const STUB_UNLOCKS: EligibilityMeter["unlocks"] = [
  {
    field: "majorityUsOwned",
    question: "Is your company majority (>50%) US-owned and controlled?",
    unlockUsd: 619363,
    opportunityCount: 2,
  },
  {
    field: "samRegistered",
    question: "Are you registered in SAM.gov?",
    unlockUsd: 750000,
    opportunityCount: 1,
  },
  {
    field: "employees",
    question: "How many employees do you have?",
    unlockUsd: 305000,
    opportunityCount: 1,
  },
];

async function stubAnalysis(
  founderText: string,
  prior: Partial<CompanyProfile> | null,
  emit: Emit,
): Promise<UiMatchReport> {
  const profile: CompanyProfile = {
    ...emptyProfile(founderText),
    ...prior,
    description: founderText,
  };
  const say = async (message: string) => {
    emit({ type: "activity", message });
    await sleep(250);
  };

  await say("extracting company profile from founder description…");
  emit({ type: "profile", profile });
  await say("running deterministic eligibility gates over cached opportunities…");
  await say("retrieving candidates via full-text search…");

  const honestNo = /\b(consumer|marketplace|social|youth|teen)\b/i.test(founderText);
  const answered = (f: GateField) =>
    f === "location" ? profile.location?.state != null : profile[f] != null;
  const unlocks = STUB_UNLOCKS.filter((u) => !answered(u.field));
  const answeredUsd = STUB_UNLOCKS.filter((u) => answered(u.field)).reduce(
    (s, u) => s + u.unlockUsd,
    0,
  );
  const baseUnlocked = honestNo ? 0 : 250000;
  const meter: EligibilityMeter = {
    unlockedUsd: baseUnlocked + answeredUsd,
    unlockedCount: (honestNo ? 0 : 1) + STUB_UNLOCKS.length - unlocks.length,
    potentialUsd: baseUnlocked + answeredUsd + unlocks.reduce((s, u) => s + u.unlockUsd, 0),
    unlocks,
  };
  const questions: InterviewQuestion[] = unlocks.map((u) => ({
    field: u.field,
    question: u.question,
    whyAsking: `Unlocks up to $${Math.round(u.unlockUsd / 1000)}K across ${u.opportunityCount} program(s)`,
    answerType: u.field === "employees" ? "number" : "boolean",
    choices: null,
  }));
  emit({ type: "questions", questions, meter });

  await say("ranking matches with LLM…");
  await say("attaching historical award evidence…");

  const opportunities = Object.fromEntries(STUB_OPPS.map((o) => [o.id, o]));
  const rank = (
    opportunityId: string,
    tier: RankedMatch["tier"],
    score: number,
    whyFit: string,
  ): RankedMatch => ({
    opportunityId,
    tier,
    score,
    whyFit,
    whatCouldDisqualify:
      "Ownership/size rules apply; foreign majority ownership or >500 employees disqualifies.",
    whatToVerify: "Confirm SAM.gov registration and topic-area fit with the program officer.",
    nextSteps: "Read the current solicitation, then email the listed program contact a 1-page summary.",
  });

  let matches: RankedMatch[];
  let rejected: GatedOpportunity[] = [];
  if (honestNo) {
    matches = [
      rank(
        "utah:stub-innovation-fund",
        "adjacent",
        48,
        "State seed capital has no R&D requirement — a plausible non-federal path.",
      ),
    ];
    rejected = [
      {
        opportunity: opportunities["grants_gov:stub-nsf-sbir"],
        gates: [
          {
            gate: "sbir:active_rnd",
            verdict: "fail",
            missingField: null,
            detail: "SBIR requires technical R&D risk; a consumer marketplace app does not qualify.",
          },
        ],
        verdict: "fail",
        missingFields: [],
        meterValueUsd: 305000,
      },
    ];
  } else {
    matches = [
      rank(
        "grants_gov:stub-nsf-sbir",
        "likely_fit",
        88,
        "Deep-tech R&D focus matches your product; non-dilutive Phase I fits pre-seed stage.",
      ),
      rank(
        "grants_gov:stub-nih-sbir",
        "likely_fit",
        81,
        "Health-adjacent keywords in your description map to NIH omnibus topics.",
      ),
      rank(
        "grants_gov:stub-eda-b2s",
        "verify_eligibility",
        66,
        "Fits if you partner with an accelerator or university applicant.",
      ),
      rank(
        "utah:stub-innovation-fund",
        "adjacent",
        55,
        "Utah-based startups can stack state seed capital with federal awards.",
      ),
    ];
  }

  await say("assembling opportunity map…");
  return {
    profile,
    matches,
    rejected,
    honestNo,
    honestNoExplanation: honestNo
      ? "Federal grant programs fund technical R&D or public-benefit outcomes; a consumer marketplace has no strong federal fit right now. The honest answer is to look at state and private capital instead."
      : null,
    meter,
    questions,
    opportunities,
  };
}
