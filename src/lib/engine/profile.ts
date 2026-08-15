// ============================================================
// Profile extraction — founder free text -> CompanyProfile.
// One completeJSON call; prior interview answers override nulls.
// ============================================================

import { completeJSON } from "@/lib/llm";
import type { CompanyProfile, GateField } from "@/lib/types";

const nullable = (t: string) => ({ type: [t, "null"] });
const strArray = (min: number, max: number) => ({
  type: "array",
  items: { type: "string" },
  minItems: min,
  maxItems: max,
});

/** JSON Schema for the full CompanyProfile object (draft-07-ish). */
export const PROFILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "description", "name", "industry", "naicsGuesses", "technologyKeywords",
    "govKeywords", "location", "employees", "annualRevenueUsd",
    "capitalRaisedUsd", "fundingStage", "isForProfit", "isSmallBusiness",
    "majorityUsOwned", "hasActiveRnD", "productMaturity", "capitalNeedUsd",
    "useOfFunds", "targetCustomers", "samRegistered", "milestones",
  ],
  properties: {
    description: { type: "string" },
    name: nullable("string"),
    industry: nullable("string"),
    naicsGuesses: strArray(0, 3),
    technologyKeywords: strArray(5, 10),
    govKeywords: strArray(8, 15),
    location: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["city", "state"],
      properties: { city: nullable("string"), state: nullable("string") },
    },
    employees: nullable("number"),
    annualRevenueUsd: nullable("number"),
    capitalRaisedUsd: nullable("number"),
    fundingStage: nullable("string"),
    isForProfit: nullable("boolean"),
    isSmallBusiness: nullable("boolean"),
    majorityUsOwned: nullable("boolean"),
    hasActiveRnD: nullable("boolean"),
    productMaturity: nullable("string"),
    capitalNeedUsd: {
      type: "object",
      additionalProperties: false,
      required: ["min", "max"],
      properties: { min: nullable("number"), max: nullable("number") },
    },
    useOfFunds: nullable("string"),
    targetCustomers: nullable("string"),
    samRegistered: nullable("boolean"),
    milestones: strArray(0, 10),
  },
} as const;

const SYSTEM =
  "You extract structured company profiles from founder descriptions for US " +
  "government-funding matching. Extract only what is stated or safely " +
  "inferable. Never fabricate numbers. Unknown means null.";

function buildPrompt(founderText: string, prior?: Partial<CompanyProfile>): string {
  return `Extract a CompanyProfile JSON object from the founder text below.

Field rules:
- Every field is required; use null when the text does not support a value.
- description: the founder text VERBATIM, unchanged.
- naicsGuesses: up to 3 six-digit NAICS codes, most likely first. Reason about
  the industry internally but output only the codes.
- technologyKeywords: 5-10 startup-language terms for the product/technology.
- govKeywords: 8-15 terms that TRANSLATE the startup's language into US
  government / federal-grant vocabulary (agency program language, not startup
  jargon). Example: "reduces nurse admin burden" -> ["health information
  technology","healthcare workforce","clinical decision support","digital
  health"]. Ask which agencies could plausibly fund this work and include each
  one's program vocabulary — adjacent agencies too (NSF, DOE, DoD, DHS, EPA
  and peers fund far beyond their obvious domains) — plus the funding
  mechanisms the company qualifies for ("SBIR", "STTR" whenever it does R&D).
- location: state as its 2-letter USPS code (e.g. "Utah" -> "UT").
- productMaturity: one of "concept" | "prototype" | "pilot" | "in-market", else null.

Inference rules:
- employees < 500 AND annual revenue < $50M => isSmallBusiness = true.
- Described as a company/startup selling a product or service => isForProfit = true.
- Do NOT infer majorityUsOwned or samRegistered — leave null unless explicitly stated.

Founder text:
"""
${founderText}
"""
${prior && Object.keys(prior).length
    ? `\nKnown facts from prior interview answers (authoritative — keep the output consistent with them):\n${JSON.stringify(prior)}\n`
    : ""}`;
}

/**
 * Extract a CompanyProfile from founder text via one completeJSON call.
 * Guarantees: `description` is the founder text verbatim (overrides whatever
 * the LLM returned), and non-null `prior` fields (interview answers) override
 * the extraction.
 */
export async function extractProfile(
  founderText: string,
  prior?: Partial<CompanyProfile>,
): Promise<CompanyProfile> {
  const extracted = await completeJSON<CompanyProfile>(
    buildPrompt(founderText, prior),
    PROFILE_SCHEMA,
    { system: SYSTEM, effort: "medium", maxTokens: 2000 },
  );
  const merged: CompanyProfile = { ...extracted };
  if (prior) {
    for (const [k, v] of Object.entries(prior) as [keyof CompanyProfile, unknown][]) {
      if (v !== undefined && v !== null)
        (merged as unknown as Record<string, unknown>)[k] = v;
    }
  }
  merged.description = founderText; // verbatim, always
  return deriveFields(merged);
}

// ---------- Fast extraction (readiness-hold phase only) ----------
//
// The hold phase needs gate fields + retrieval keywords, nothing more.
// Extraction latency is output-token-bound, and govKeywords (8-15 strings),
// NAICS reasoning, and the misc prose fields are most of the output — so the
// hold uses this slim schema and the full extraction is folded into the
// ranking pass (pipeline enriches when govKeywords is empty). The eval path
// and any direct ranking run always use the FULL extractProfile.

const FAST_PROFILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "name", "industry", "technologyKeywords", "location", "employees",
    "annualRevenueUsd", "isForProfit", "isSmallBusiness", "majorityUsOwned",
    "hasActiveRnD", "productMaturity", "capitalNeedUsd", "samRegistered",
    "fundingStage", "capitalRaisedUsd",
  ],
  properties: {
    name: nullable("string"),
    industry: nullable("string"),
    technologyKeywords: strArray(5, 10),
    location: {
      type: ["object", "null"],
      additionalProperties: false,
      required: ["city", "state"],
      properties: { city: nullable("string"), state: nullable("string") },
    },
    employees: nullable("number"),
    annualRevenueUsd: nullable("number"),
    isForProfit: nullable("boolean"),
    isSmallBusiness: nullable("boolean"),
    majorityUsOwned: nullable("boolean"),
    hasActiveRnD: nullable("boolean"),
    productMaturity: nullable("string"),
    capitalNeedUsd: {
      type: "object",
      additionalProperties: false,
      required: ["min", "max"],
      properties: { min: nullable("number"), max: nullable("number") },
    },
    samRegistered: nullable("boolean"),
    fundingStage: nullable("string"),
    capitalRaisedUsd: nullable("number"),
  },
} as const;

type FastProfile = Pick<
  CompanyProfile,
  | "name" | "industry" | "technologyKeywords" | "location" | "employees"
  | "annualRevenueUsd" | "isForProfit" | "isSmallBusiness" | "majorityUsOwned"
  | "hasActiveRnD" | "productMaturity" | "capitalNeedUsd" | "samRegistered"
  | "fundingStage" | "capitalRaisedUsd"
>;

/** Slim, fast profile extraction for the readiness hold. Same guarantees as
 *  extractProfile (verbatim description, prior answers override), but the
 *  gov-language fields come back empty — the pipeline enriches before ranking. */
export async function extractProfileFast(
  founderText: string,
  prior?: Partial<CompanyProfile>,
): Promise<CompanyProfile> {
  const extracted = await completeJSON<FastProfile>(
    `Extract the company facts below from the founder text. Every field is required; null when the text does not support a value.
- location: state as its 2-letter USPS code (e.g. "Utah" -> "UT").
- technologyKeywords: 5-10 startup-language terms for the product/technology.
- productMaturity: one of "concept" | "prototype" | "pilot" | "in-market", else null.
- capitalNeedUsd: how much funding they're seeking (a single figure fills min).
Inference: employees < 500 and revenue < $50M => isSmallBusiness true; a company selling a product/service => isForProfit true. Do NOT infer majorityUsOwned or samRegistered.

Founder text:
"""
${founderText}
"""
${prior && Object.keys(prior).length ? `\nKnown facts from prior interview answers (authoritative):\n${JSON.stringify(prior)}\n` : ""}`,
    FAST_PROFILE_SCHEMA,
    { system: SYSTEM, effort: "low", maxTokens: 700 },
  );
  const merged: CompanyProfile = {
    description: founderText,
    naicsGuesses: [],
    govKeywords: [], // signals "not yet enriched" to the pipeline
    useOfFunds: null,
    targetCustomers: null,
    milestones: [],
    ...extracted,
  };
  if (prior) {
    for (const [k, v] of Object.entries(prior) as [keyof CompanyProfile, unknown][]) {
      if (v !== undefined && v !== null)
        (merged as unknown as Record<string, unknown>)[k] = v;
    }
  }
  merged.description = founderText; // verbatim, always
  return deriveFields(merged);
}

// ---------- Deterministic derivation (never ask what we can infer) ----------

/**
 * Pure: fill in gate fields implied by others so they never get asked.
 * - employees settles isSmallBusiness (SBA-ish: <500 heads, <$50M revenue).
 * - raised capital / a funding stage implies a for-profit company.
 */
export function deriveFields(p: CompanyProfile): CompanyProfile {
  const d = { ...p };
  if (d.isSmallBusiness === null && d.employees !== null) {
    if (d.employees >= 500) d.isSmallBusiness = false;
    else if (d.annualRevenueUsd === null || d.annualRevenueUsd < 50_000_000)
      d.isSmallBusiness = true;
  }
  if (d.isForProfit === null && (d.fundingStage !== null || (d.capitalRaisedUsd ?? 0) > 0))
    d.isForProfit = true;
  return d;
}

// ---------- Interview answer application ----------

const STATE_CODES: Record<string, string> = {
  alabama: "AL", alaska: "AK", arizona: "AZ", arkansas: "AR", california: "CA",
  colorado: "CO", connecticut: "CT", delaware: "DE", florida: "FL", georgia: "GA",
  hawaii: "HI", idaho: "ID", illinois: "IL", indiana: "IN", iowa: "IA",
  kansas: "KS", kentucky: "KY", louisiana: "LA", maine: "ME", maryland: "MD",
  massachusetts: "MA", michigan: "MI", minnesota: "MN", mississippi: "MS",
  missouri: "MO", montana: "MT", nebraska: "NE", nevada: "NV",
  "new hampshire": "NH", "new jersey": "NJ", "new mexico": "NM",
  "new york": "NY", "north carolina": "NC", "north dakota": "ND", ohio: "OH",
  oklahoma: "OK", oregon: "OR", pennsylvania: "PA", "rhode island": "RI",
  "south carolina": "SC", "south dakota": "SD", tennessee: "TN", texas: "TX",
  utah: "UT", vermont: "VT", virginia: "VA", washington: "WA",
  "west virginia": "WV", wisconsin: "WI", wyoming: "WY",
  "district of columbia": "DC", "puerto rico": "PR",
};

function toStateCode(s: string): string | null {
  const t = s.trim();
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return STATE_CODES[t.toLowerCase()] ?? null;
}

function parseLocation(answer: string): CompanyProfile["location"] {
  const parts = answer.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    return { city: parts[0] || null, state: toStateCode(parts[parts.length - 1]) };
  }
  const state = parts[0] ? toStateCode(parts[0]) : null;
  return state ? { city: null, state } : { city: parts[0] ?? null, state: null };
}

function toBool(answer: string | number | boolean): boolean {
  if (typeof answer === "boolean") return answer;
  if (typeof answer === "number") return answer !== 0;
  return /^(y|yes|true|1)$/i.test(answer.trim());
}

function toNum(answer: string | number | boolean): number | null {
  if (typeof answer === "number") return answer;
  if (typeof answer === "boolean") return answer ? 1 : 0;
  const m = answer.trim().replace(/[$,\s]/g, "").match(/^(\d+(?:\.\d+)?)([kmb])?$/i);
  if (!m) return null;
  const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2]?.toLowerCase() as "k" | "m" | "b"] ?? 1;
  return parseFloat(m[1]) * mult;
}

/** Pure: returns a new profile with one gate field updated from an answer. */
export function applyAnswer(
  profile: CompanyProfile,
  field: GateField,
  answer: string | number | boolean,
): CompanyProfile {
  const p: CompanyProfile = { ...profile };
  switch (field) {
    case "employees":
      p.employees = toNum(answer);
      // A corrected headcount >=500 invalidates a previously derived
      // small-business flag (SBA rule) — re-derive instead of going stale.
      if (p.employees !== null && p.employees >= 500) p.isSmallBusiness = false;
      break;
    case "annualRevenueUsd":
      p.annualRevenueUsd = toNum(answer);
      break;
    case "isForProfit":
      p.isForProfit = toBool(answer);
      break;
    case "isSmallBusiness":
      p.isSmallBusiness = toBool(answer);
      break;
    case "majorityUsOwned":
      p.majorityUsOwned = toBool(answer);
      break;
    case "hasActiveRnD":
      p.hasActiveRnD = toBool(answer);
      break;
    case "samRegistered":
      p.samRegistered = toBool(answer);
      break;
    case "productMaturity":
      p.productMaturity = String(answer);
      break;
    case "location":
      p.location = parseLocation(String(answer));
      break;
  }
  return deriveFields(p);
}

// ---------- Freeform (chat) answer application ----------

const MATURITY = ["concept", "prototype", "pilot", "in-market"] as const;

/** What one chat message may settle. null = the message doesn't address it. */
const FREEFORM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "employees", "annualRevenueUsd", "isForProfit", "isSmallBusiness",
    "majorityUsOwned", "hasActiveRnD", "samRegistered", "productMaturity",
    "locationCity", "locationState", "capitalNeedMinUsd", "capitalNeedMaxUsd",
  ],
  properties: {
    employees: nullable("number"),
    annualRevenueUsd: nullable("number"),
    isForProfit: nullable("boolean"),
    isSmallBusiness: nullable("boolean"),
    majorityUsOwned: nullable("boolean"),
    hasActiveRnD: nullable("boolean"),
    samRegistered: nullable("boolean"),
    productMaturity: nullable("string"),
    locationCity: nullable("string"),
    locationState: nullable("string"),
    capitalNeedMinUsd: nullable("number"),
    capitalNeedMaxUsd: nullable("number"),
  },
} as const;

interface FreeformAnswers {
  employees: number | null;
  annualRevenueUsd: number | null;
  isForProfit: boolean | null;
  isSmallBusiness: boolean | null;
  majorityUsOwned: boolean | null;
  hasActiveRnD: boolean | null;
  samRegistered: boolean | null;
  productMaturity: string | null;
  locationCity: string | null;
  locationState: string | null;
  capitalNeedMinUsd: number | null;
  capitalNeedMaxUsd: number | null;
}

const FREEFORM_SYSTEM =
  "You read a founder's chat message and extract eligibility answers for US " +
  "government-funding matching. Only extract what the message states or " +
  "clearly implies. Never guess. Unaddressed means null.";

const yesNo = (b: boolean) => (b ? "yes" : "no");

/**
 * Parse one chat message into any number of gate-field answers (one fast LLM
 * call), merge them into the profile, and derive implied fields. Returns the
 * human-readable list of what was recorded, for the activity feed.
 */
export async function applyFreeformAnswer(
  profile: CompanyProfile,
  message: string,
): Promise<{ profile: CompanyProfile; answered: string[] }> {
  const a = await completeJSON<FreeformAnswers>(
    `A founder answering eligibility questions wrote:
"""
${message}
"""

Extract any of these facts the message settles (null when not addressed):
- employees: headcount (full-time equivalents)
- annualRevenueUsd: last year's revenue in USD
- isForProfit: is the company for-profit?
- isSmallBusiness: small business under SBA size rules (<500 employees)?
- majorityUsOwned: majority-owned by US citizens/permanent residents?
- hasActiveRnD: actively doing research & development?
- samRegistered: registered in SAM.gov?
- productMaturity: exactly one of "concept" | "prototype" | "pilot" | "in-market"
- locationCity / locationState: HQ city and 2-letter USPS state code
- capitalNeedMinUsd / capitalNeedMaxUsd: how much funding they're seeking in USD (a single figure fills min only)`,
    FREEFORM_SCHEMA,
    { system: FREEFORM_SYSTEM, effort: "low", maxTokens: 500 },
  );

  const p: CompanyProfile = { ...profile };
  const answered: string[] = [];
  if (a.employees !== null) {
    p.employees = a.employees;
    answered.push(`team size (${a.employees})`);
  }
  if (a.annualRevenueUsd !== null) {
    p.annualRevenueUsd = a.annualRevenueUsd;
    answered.push(`revenue ($${a.annualRevenueUsd.toLocaleString("en-US")})`);
  }
  if (a.isForProfit !== null) {
    p.isForProfit = a.isForProfit;
    answered.push(`for-profit (${yesNo(a.isForProfit)})`);
  }
  if (a.isSmallBusiness !== null) {
    p.isSmallBusiness = a.isSmallBusiness;
    answered.push(`small business (${yesNo(a.isSmallBusiness)})`);
  }
  if (a.majorityUsOwned !== null) {
    p.majorityUsOwned = a.majorityUsOwned;
    answered.push(`US ownership (${yesNo(a.majorityUsOwned)})`);
  }
  if (a.hasActiveRnD !== null) {
    p.hasActiveRnD = a.hasActiveRnD;
    answered.push(`active R&D (${yesNo(a.hasActiveRnD)})`);
  }
  if (a.samRegistered !== null) {
    p.samRegistered = a.samRegistered;
    answered.push(`SAM.gov (${yesNo(a.samRegistered)})`);
  }
  if (a.productMaturity !== null && (MATURITY as readonly string[]).includes(a.productMaturity)) {
    p.productMaturity = a.productMaturity;
    answered.push(`product stage (${a.productMaturity})`);
  }
  if (a.capitalNeedMinUsd !== null || a.capitalNeedMaxUsd !== null) {
    p.capitalNeedUsd = {
      min: a.capitalNeedMinUsd ?? p.capitalNeedUsd.min,
      max: a.capitalNeedMaxUsd ?? p.capitalNeedUsd.max,
    };
    answered.push(
      `funding sought ($${(a.capitalNeedMinUsd ?? a.capitalNeedMaxUsd)!.toLocaleString("en-US")})`,
    );
  }
  if (a.locationState !== null || a.locationCity !== null) {
    const state = a.locationState !== null ? toStateCode(a.locationState) : null;
    p.location = { city: a.locationCity, state: state ?? p.location?.state ?? null };
    answered.push(`location (${[a.locationCity, state].filter(Boolean).join(", ")})`);
  }
  return { profile: deriveFields(p), answered };
}
