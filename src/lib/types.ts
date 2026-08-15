// ============================================================
// Shared domain contracts — DO NOT MODIFY without updating all
// consumers. Every module builds against these types.
// ============================================================

// ---------- Company profile ----------

/** A profile field the engine tracks. `null` = unknown (not yet provided). */
export interface CompanyProfile {
  description: string; // founder's own words, verbatim
  name: string | null;
  industry: string | null;
  naicsGuesses: string[]; // best-guess NAICS codes, most likely first
  technologyKeywords: string[]; // startup-language terms
  govKeywords: string[]; // translated government-language terms (health IT, workforce, etc.)
  location: { city: string | null; state: string | null } | null;
  employees: number | null;
  annualRevenueUsd: number | null;
  capitalRaisedUsd: number | null;
  fundingStage: string | null; // e.g. "seed", "series-a", "bootstrapped"
  isForProfit: boolean | null;
  isSmallBusiness: boolean | null; // <500 employees, SBA-ish
  majorityUsOwned: boolean | null; // SBIR gate
  hasActiveRnD: boolean | null;
  productMaturity: string | null; // "concept" | "prototype" | "pilot" | "in-market"
  capitalNeedUsd: { min: number | null; max: number | null };
  useOfFunds: string | null;
  targetCustomers: string | null;
  samRegistered: boolean | null;
  milestones: string[]; // free-text upcoming milestones
}

/** Which CompanyProfile keys can gate eligibility (askable in the interview). */
export type GateField =
  | "employees"
  | "isForProfit"
  | "isSmallBusiness"
  | "majorityUsOwned"
  | "hasActiveRnD"
  | "annualRevenueUsd"
  | "location"
  | "samRegistered"
  | "productMaturity";

// ---------- Normalized opportunities (all sources) ----------

export type OpportunitySource =
  | "grants_gov"
  | "assistance_listing"
  | "sbir"
  | "procurement"
  | "utah";

export type FundingKind =
  | "grant"
  | "cooperative_agreement"
  | "loan"
  | "sbir_sttr"
  | "procurement"
  | "tax_credit"
  | "equity"
  | "services"
  | "other";

/** One row in the `opportunities` table. Normalized across every source. */
export interface Opportunity {
  id: string; // "<source>:<native id>"
  source: OpportunitySource;
  kind: FundingKind;
  title: string;
  agency: string; // display name
  agencyCode: string | null;
  description: string; // plain text (HTML stripped)
  alnNumbers: string[]; // CFDA/ALN numbers, joins to USAspending
  // Eligibility (structured where the source provides it)
  eligibilityCodes: string[]; // grants.gov applicant-type codes ("23" small biz…)
  eligibilityText: string | null;
  openToSmallBusiness: boolean | null; // derived: codes include 22/23/25/99 or unknown
  // Money
  awardFloorUsd: number | null;
  awardCeilingUsd: number | null;
  estimatedTotalUsd: number | null;
  expectedAwards: number | null; // for odds badge
  expectedApplications: number | null; // for odds badge (often null / boilerplate)
  // Dates
  openDate: string | null; // ISO yyyy-mm-dd
  closeDate: string | null; // ISO yyyy-mm-dd; null = rolling/forecast
  status: "posted" | "forecasted" | "open" | "unknown";
  url: string | null;
  contactName: string | null;
  contactEmail: string | null;
  raw: string | null; // JSON blob of source record for debugging
}

// ---------- Gate evaluation ----------

export type GateVerdict = "pass" | "fail" | "unknown";

export interface GateResult {
  gate: string; // e.g. "eligibility:small_business", "deadline", "amount_overlap", "sbir:us_ownership"
  verdict: GateVerdict;
  /** When verdict === "unknown": which profile field would resolve it. */
  missingField: GateField | null;
  detail: string; // human-readable, e.g. "Requires >50% US ownership (SBIR statute)"
}

export interface GatedOpportunity {
  opportunity: Opportunity;
  gates: GateResult[];
  verdict: GateVerdict; // fail if any fail; unknown if any unknown; else pass
  missingFields: GateField[]; // union of gates' missing fields
  /** Dollar value used for meter math: awardCeiling ?? estimatedTotal/expectedAwards ?? kind-default. */
  meterValueUsd: number;
}

// ---------- LLM ranking ----------

export type FitTier = "likely_fit" | "verify_eligibility" | "adjacent" | "not_a_fit";

export interface RankedMatch {
  opportunityId: string;
  tier: FitTier;
  score: number; // 0-100
  whyFit: string;
  whatCouldDisqualify: string;
  whatToVerify: string;
  nextSteps: string;
}

export interface MatchReport {
  profile: CompanyProfile;
  matches: RankedMatch[]; // sorted best-first, includes only pass/unknown gate verdicts
  rejected: GatedOpportunity[]; // notable near-misses that hard-failed (for honest-no display)
  honestNo: boolean; // true when no likely_fit/verify tier matches exist
  honestNoExplanation: string | null;
  meter: EligibilityMeter;
  questions: InterviewQuestion[]; // next questions worth asking (may be empty)
  /** Historical-award evidence keyed by opportunityId (top matches only). */
  evidence?: Record<string, EvidenceSummary>;
  /** Hard-fails whose ONLY blockers are time-solvable — "not yet" matches.
   *  Optional + additive (see NOTES-future.md); absent on older reports. */
  futureFits?: FutureFit[];
}

/** Why a future fit is blocked today — every value is time-solvable. */
export type FutureFitReason = "reopens" | "start_rnd" | "amount_mismatch";

/** A "not yet" match: fails gates today for a reason that can change.
 *  Denormalized (title/agency/close) so UI and emails need no extra lookup. */
export interface FutureFit {
  opportunityId: string;
  title: string;
  agency: string;
  closeDate: string | null; // the deadline that passed (reopens) or null
  reason: FutureFitReason;
  blockedBy: string; // failing gate name, e.g. "deadline", "sbir:rnd"
  detail: string; // one human sentence: what blocks it + what would change it
  meterValueUsd: number;
}

/** Serializable subset of the evidence module's bundle for the report/UI. */
export interface EvidenceSummary {
  totalAwards: number | null;
  totalUsd: number | null;
  medianUsd: number | null;
  utahCount: number | null;
  similarAwards: Array<{
    recipient: string;
    amountUsd: number;
    year: number;
    state: string | null;
    link: string | null;
  }>;
}

// ---------- Eligibility meter + interview ----------

export interface MeterUnlock {
  field: GateField;
  question: string; // the human question that resolves this field
  unlockUsd: number; // sum of meterValueUsd across opportunities gated only by this field (greedy attribution)
  opportunityCount: number;
}

export interface EligibilityMeter {
  unlockedUsd: number; // sum across fully-passing opportunities
  unlockedCount: number;
  potentialUsd: number; // unlocked + everything currently "unknown"
  unlocks: MeterUnlock[]; // sorted by unlockUsd desc — these ARE the interview candidates
}

export interface InterviewQuestion {
  field: GateField;
  question: string; // e.g. "Is your company majority US-owned? (SBIR programs require it)"
  whyAsking: string; // e.g. "Unlocks up to $1.1M across 4 SBIR programs"
  answerType: "boolean" | "number" | "text" | "choice";
  choices: string[] | null;
}

// ---------- Analyze API (SSE) ----------

/** Server-sent events emitted by POST /api/analyze while the engine works. */
export type AnalyzeEvent =
  | { type: "activity"; message: string } // live activity feed line
  | { type: "profile"; profile: CompanyProfile }
  | { type: "questions"; questions: InterviewQuestion[]; meter: EligibilityMeter }
  | { type: "report"; report: MatchReport }
  | { type: "error"; message: string };

// ---------- Eval harness ----------

export interface EvalCase {
  id: string; // "ai-healthcare" | "aerospace" | "water" | "cyber" | "youth-marketplace"
  founderInput: string; // the paragraph a founder would type
  /** From the brief's "WE WANT TO SEE" list. Judge checks coverage. */
  mustSee: string[];
  /** Expect honestNo === true (trap case #5). */
  expectHonestNo: boolean;
}

export interface EvalScore {
  caseId: string;
  coverage: number; // 0-1: fraction of mustSee themes present in matches
  honesty: number; // 0-1: honest-no handled correctly
  noDeadOpportunities: number; // 0-1: no closed/ineligible items surfaced
  explanationQuality: number; // 0-1: LLM-judge rubric score
  total: number; // weighted
  notes: string;
}
