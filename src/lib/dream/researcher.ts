// ============================================================
// The dream researcher — weekly autonomous refresh of saved
// company profiles from the public web. For each company:
//   1. Grounded web research anchored to identity facts.
//   2. LLM reconcile: is this THE SAME company, and what changed?
//   3. Guarded application: identity must be confident; only
//      whitelisted fields; only high-confidence proposals are
//      auto-applied (with old values + sources kept forever in
//      dream_findings). Ambiguity = no change, ever.
// Founder text (description) and interview answers are never
// silently overwritten by web data — web fills and updates the
// drift-prone facts (headcount, revenue, raise, stage, maturity).
// ============================================================

import { completeJSON } from "../llm";
import { researchComplete } from "../llm-webresearch";
import { deriveFields } from "../engine/profile";
import { recordDreamFinding, saveCompany, type CompanyRecord } from "../monitor/db";
import type { CompanyProfile } from "../types";

/** Fields the dreamer may touch — drift-prone facts only. */
export const DREAM_FIELDS = [
  "employees",
  "annualRevenueUsd",
  "capitalRaisedUsd",
  "fundingStage",
  "productMaturity",
  "samRegistered",
] as const;
export type DreamField = (typeof DREAM_FIELDS)[number];

export interface DreamProposal {
  field: DreamField;
  newValue: string; // raw from the LLM; coerced + validated before applying
  confidence: "high" | "medium" | "low";
  sourceUrl: string;
  quote: string; // the sentence in the source that supports it
}

export interface DreamResult {
  company: string;
  identityConfident: boolean;
  identityEvidence: string;
  proposals: DreamProposal[];
  applied: { field: DreamField; oldValue: unknown; newValue: unknown }[];
  sources: { title: string; url: string }[];
}

const RECONCILE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["identityConfident", "identityEvidence", "proposals"],
  properties: {
    identityConfident: { type: "boolean" },
    identityEvidence: { type: "string" },
    proposals: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["field", "newValue", "confidence", "sourceUrl", "quote"],
        properties: {
          field: { type: "string", enum: [...DREAM_FIELDS] },
          newValue: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          sourceUrl: { type: "string" },
          quote: { type: "string" },
        },
      },
    },
  },
} as const;

const MATURITY = new Set(["concept", "prototype", "pilot", "in-market"]);

/** Coerce a proposal's string value into the field's real type; null = invalid. */
export function coerceValue(field: DreamField, raw: string): unknown | null {
  const t = raw.trim().toLowerCase();
  switch (field) {
    case "employees": {
      const n = parseInt(t.replace(/[,~+]/g, ""), 10);
      return Number.isFinite(n) && n > 0 && n < 100_000 ? n : null;
    }
    case "annualRevenueUsd":
    case "capitalRaisedUsd": {
      const m = t.replace(/[$,\s]/g, "").match(/^(\d+(?:\.\d+)?)([kmb])?$/);
      if (!m) return null;
      const mult = { k: 1e3, m: 1e6, b: 1e9 }[m[2] as "k" | "m" | "b"] ?? 1;
      const n = parseFloat(m[1]) * mult;
      return n > 0 && n < 1e11 ? n : null;
    }
    case "fundingStage":
      return t.length > 0 && t.length < 40 ? t : null;
    case "productMaturity":
      return MATURITY.has(t) ? t : null;
    case "samRegistered":
      return t === "true" || t === "yes" ? true : t === "false" || t === "no" ? false : null;
  }
}

function identityAnchor(p: CompanyProfile, name: string): string {
  const loc = p.location ? [p.location.city, p.location.state].filter(Boolean).join(", ") : "unknown";
  return [
    `Company name: ${name}`,
    `Location: ${loc}`,
    `Industry: ${p.industry ?? "unknown"}`,
    `What they do (founder's own words): ${p.description.slice(0, 400)}`,
  ].join("\n");
}

/** Research + reconcile + guarded apply for one saved company. */
export async function dreamCompany(
  company: CompanyRecord,
  opts: { dryRun?: boolean } = {},
): Promise<DreamResult> {
  const anchor = identityAnchor(company.profile, company.name);

  const research = await researchComplete(
    [
      "Research the CURRENT public state of this specific company:",
      anchor,
      "",
      "Find, with sources: current team size / employee count; total capital raised and latest funding round or stage; revenue if public; product status (concept/prototype/pilot/in market); whether they are registered as a federal contractor (SAM.gov / awarded federal contracts or grants); any major recent news (last 12 months).",
      "CRITICAL IDENTITY RULE: many companies share names. Only report facts from sources that clearly refer to THIS company — matching its location, industry, and what it does as described above. If a source could be about a different company with the same name, say so explicitly and exclude it. If you cannot confidently find this specific company at all, say exactly that.",
      "Write a concise factual summary with a source URL after each claim.",
    ].join("\n"),
  );

  const reconciled = await completeJSON<{
    identityConfident: boolean;
    identityEvidence: string;
    proposals: DreamProposal[];
  }>(
    [
      "You maintain company profiles for a government-funding matcher. Compare the STORED PROFILE with fresh WEB RESEARCH about (possibly) the same company.",
      "",
      "STORED PROFILE:",
      anchor,
      `employees=${company.profile.employees ?? "unknown"} | annualRevenueUsd=${company.profile.annualRevenueUsd ?? "unknown"} | capitalRaisedUsd=${company.profile.capitalRaisedUsd ?? "unknown"} | fundingStage=${company.profile.fundingStage ?? "unknown"} | productMaturity=${company.profile.productMaturity ?? "unknown"} | samRegistered=${company.profile.samRegistered ?? "unknown"}`,
      "",
      "WEB RESEARCH:",
      research.text || "(research returned nothing)",
      "",
      "Rules:",
      "- identityConfident: true ONLY if the research clearly describes this exact company — same location AND same line of business, at minimum. A name match alone is NEVER enough. When the research says it could not find the company or might be confusing it with another, identityConfident MUST be false.",
      "- Propose an update ONLY where the research states a concrete current fact that differs from (or fills in) the stored value. Each proposal cites the supporting source URL and the exact quote.",
      '- confidence "high" only for facts stated directly by a primary or authoritative source (company site, funding announcement, government record). Aggregator guesses are "low".',
      "- No research findings = empty proposals. Never invent.",
      'Return JSON: {"identityConfident", "identityEvidence", "proposals": [{"field","newValue","confidence","sourceUrl","quote"}]}',
    ].join("\n"),
    RECONCILE_SCHEMA,
    { system: "You are a careful data steward. A wrong update is far worse than no update.", effort: "medium", maxTokens: 1500 },
  );

  const applied: DreamResult["applied"] = [];
  if (reconciled.identityConfident && !opts.dryRun) {
    const p: CompanyProfile = { ...company.profile };
    for (const prop of reconciled.proposals) {
      if (prop.confidence !== "high") continue;
      if (!(DREAM_FIELDS as readonly string[]).includes(prop.field)) continue;
      const value = coerceValue(prop.field, prop.newValue);
      if (value === null) continue;
      const old = p[prop.field];
      if (old === value) continue;
      (p as unknown as Record<string, unknown>)[prop.field] = value;
      applied.push({ field: prop.field, oldValue: old, newValue: value });
    }
    if (applied.length > 0) {
      saveCompany(company.name, null, deriveFields(p), company.monitoring);
    }
  }

  const result: DreamResult = {
    company: company.name,
    identityConfident: reconciled.identityConfident,
    identityEvidence: reconciled.identityEvidence,
    proposals: reconciled.proposals,
    applied,
    sources: research.sources,
  };
  recordDreamFinding(company.id, result, opts.dryRun === true);
  return result;
}
