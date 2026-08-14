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
  technology","healthcare workforce","hospital operations","clinical decision
  support","labor productivity","digital health"].
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
  return merged;
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
  return p;
}
