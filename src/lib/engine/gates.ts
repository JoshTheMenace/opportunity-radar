// ============================================================
// Deterministic eligibility gates. NO LLM calls, NO network.
// Pure function of (CompanyProfile, Opportunity) -> GatedOpportunity.
// ============================================================

import type {
  CompanyProfile,
  FundingKind,
  GateField,
  GateResult,
  GateVerdict,
  GatedOpportunity,
  Opportunity,
} from "../types";

// Dollar value used for meter math when real award numbers are absent.
export const KIND_DEFAULT_USD: Record<FundingKind, number> = {
  grant: 250_000,
  cooperative_agreement: 250_000, // treated like a grant
  sbir_sttr: 275_000, // Phase I ~$275K typical
  loan: 500_000,
  procurement: 250_000,
  tax_credit: 100_000,
  equity: 250_000,
  services: 0,
  other: 100_000,
};

/** awardCeiling ?? estimatedTotal/expectedAwards ?? kind-default (per types.ts). */
export function meterValueUsd(opp: Opportunity): number {
  if (opp.awardCeilingUsd != null && opp.awardCeilingUsd > 0) return opp.awardCeilingUsd;
  if (
    opp.estimatedTotalUsd != null &&
    opp.estimatedTotalUsd > 0 &&
    opp.expectedAwards != null &&
    opp.expectedAwards > 0
  ) {
    return Math.round(opp.estimatedTotalUsd / opp.expectedAwards);
  }
  return KIND_DEFAULT_USD[opp.kind];
}

// grants.gov applicant-type codes that admit some flavor of business.
// 22 = for-profit (non-small), 23 = small business, 25 = other, 99 = unrestricted.
const BUSINESS_FRIENDLY = new Set(["22", "23", "25", "99"]);

function gate(
  name: string,
  verdict: GateVerdict,
  detail: string,
  missingField: GateField | null = null,
): GateResult {
  return { gate: name, verdict, missingField, detail };
}

function localIsoDate(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function evaluateGates(profile: CompanyProfile, opp: Opportunity): GatedOpportunity {
  // "today" computed once per call so every gate agrees on the date.
  const todayIso = localIsoDate(new Date());
  const gates: GateResult[] = [];

  // ---- deadline ----
  if (opp.closeDate && opp.closeDate < todayIso) {
    gates.push(gate("deadline", "fail", `Closed ${opp.closeDate} (before today)`));
  } else {
    gates.push(
      gate(
        "deadline",
        "pass",
        opp.closeDate ? `Open — closes ${opp.closeDate}` : "No fixed deadline (rolling/forecasted)",
      ),
    );
  }

  // ---- eligibility:for_profit (grants.gov machine-readable codes) ----
  if (opp.source === "grants_gov") {
    const codes = opp.eligibilityCodes;
    if (codes.length === 0) {
      gates.push(
        gate(
          "eligibility:for_profit",
          "unknown",
          "eligibility not machine-readable — verify",
          null,
        ),
      );
    } else if (codes.some((c) => BUSINESS_FRIENDLY.has(c))) {
      gates.push(gate("eligibility:for_profit", "pass", "Applicant codes admit businesses"));
    } else if (profile.isForProfit === true) {
      gates.push(
        gate("eligibility:for_profit", "fail", "Applicant codes exclude for-profit companies"),
      );
    } else if (profile.isForProfit === null) {
      gates.push(
        gate(
          "eligibility:for_profit",
          "unknown",
          "Program excludes for-profits — is your company for-profit?",
          "isForProfit",
        ),
      );
    } else {
      gates.push(gate("eligibility:for_profit", "pass", "Non-profit applicant fits listed codes"));
    }
  }

  // ---- eligibility:small_business ----
  const requiresSmallBiz =
    opp.eligibilityCodes.includes("23") &&
    !opp.eligibilityCodes.includes("22") &&
    !opp.eligibilityCodes.includes("99");
  if (opp.openToSmallBusiness === false) {
    gates.push(gate("eligibility:small_business", "fail", "Not open to small businesses"));
  } else if (requiresSmallBiz && profile.isSmallBusiness === null) {
    gates.push(
      gate(
        "eligibility:small_business",
        "unknown",
        "Restricted to small businesses — SBA size status unknown",
        "isSmallBusiness",
      ),
    );
  } else if (requiresSmallBiz && profile.isSmallBusiness === false) {
    gates.push(
      gate("eligibility:small_business", "fail", "Restricted to small businesses (SBA size rules)"),
    );
  } else {
    gates.push(gate("eligibility:small_business", "pass", "No small-business conflict"));
  }

  // ---- SBIR/STTR statutory gates ----
  if (opp.kind === "sbir_sttr") {
    if (profile.majorityUsOwned === false) {
      gates.push(gate("sbir:ownership", "fail", "Requires >50% US ownership (SBIR statute)"));
    } else if (profile.majorityUsOwned === null) {
      gates.push(
        gate(
          "sbir:ownership",
          "unknown",
          "Requires >50% US ownership (SBIR statute)",
          "majorityUsOwned",
        ),
      );
    } else {
      gates.push(gate("sbir:ownership", "pass", "Majority US-owned"));
    }

    if (profile.employees !== null && profile.employees > 500) {
      gates.push(gate("sbir:employees", "fail", "SBIR caps company size at 500 employees"));
    } else if (profile.employees === null) {
      gates.push(
        gate("sbir:employees", "unknown", "SBIR caps company size at 500 employees", "employees"),
      );
    } else {
      gates.push(gate("sbir:employees", "pass", `${profile.employees} employees (≤500)`));
    }

    if (profile.hasActiveRnD === false) {
      gates.push(gate("sbir:rnd", "fail", "SBIR/STTR funds active R&D work"));
    } else if (profile.hasActiveRnD === null) {
      gates.push(gate("sbir:rnd", "unknown", "SBIR/STTR funds active R&D work", "hasActiveRnD"));
    } else {
      gates.push(gate("sbir:rnd", "pass", "Active R&D underway"));
    }
  }

  // ---- amount_overlap (never "unknown"; missing data passes softly) ----
  const needMin = profile.capitalNeedUsd.min;
  if (needMin != null && opp.awardCeilingUsd != null) {
    if (opp.awardCeilingUsd < 0.25 * needMin) {
      gates.push(
        gate(
          "amount_overlap",
          "fail",
          `Max award $${opp.awardCeilingUsd.toLocaleString()} is under 25% of your $${needMin.toLocaleString()} minimum need`,
        ),
      );
    } else {
      gates.push(gate("amount_overlap", "pass", "Award size overlaps your capital need"));
    }
  } else {
    gates.push(gate("amount_overlap", "pass", "award size unverified"));
  }

  // ---- geo:utah ----
  if (opp.source === "utah") {
    const state = profile.location?.state ?? null;
    if (state === null) {
      gates.push(
        gate("geo:utah", "unknown", "Utah program — company location unknown", "location"),
      );
    } else if (state.toUpperCase() !== "UT") {
      gates.push(gate("geo:utah", "fail", `Utah-only program (you are in ${state})`));
    } else {
      gates.push(gate("geo:utah", "pass", "Utah company"));
    }
  }

  // ---- aggregate: fail if any fail; unknown if any unknown; else pass ----
  const verdict: GateVerdict = gates.some((g) => g.verdict === "fail")
    ? "fail"
    : gates.some((g) => g.verdict === "unknown")
      ? "unknown"
      : "pass";
  const missingFields = [
    ...new Set(
      gates.filter((g) => g.verdict === "unknown" && g.missingField).map((g) => g.missingField!),
    ),
  ];

  return { opportunity: opp, gates, verdict, missingFields, meterValueUsd: meterValueUsd(opp) };
}
