// ============================================================
// Deterministic eligibility gates. NO LLM calls, NO network.
// Pure function of (CompanyProfile, Opportunity) -> GatedOpportunity.
// ============================================================

import { localIsoDate } from "./dates";
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

/** Realism cap for meter math. Source "ceilings" are sometimes program-wide
 *  totals or data errors (the DB has grant ceilings up to $108T); no single
 *  first-time award plausibly exceeds this. */
export const METER_CAP_USD = 5_000_000;

/** min(awardCeiling ?? estimatedTotal/expectedAwards ?? kind-default, cap). */
export function meterValueUsd(opp: Opportunity): number {
  if (opp.awardCeilingUsd != null && opp.awardCeilingUsd > 0) {
    return Math.min(opp.awardCeilingUsd, METER_CAP_USD);
  }
  if (
    opp.estimatedTotalUsd != null &&
    opp.estimatedTotalUsd > 0 &&
    opp.expectedAwards != null &&
    opp.expectedAwards > 0
  ) {
    return Math.min(Math.round(opp.estimatedTotalUsd / opp.expectedAwards), METER_CAP_USD);
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
      gates.push(
        gate(
          "eligibility:for_profit",
          "pass",
          `Applicant codes [${codes.filter((c) => BUSINESS_FRIENDLY.has(c)).join(", ")}] admit businesses`,
        ),
      );
    } else if (profile.isForProfit === true) {
      gates.push(
        gate(
          "eligibility:for_profit",
          "fail",
          `Applicant codes [${codes.join(", ")}] exclude for-profit companies`,
        ),
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
    } else if (profile.employees !== null) {
      gates.push(gate("sbir:employees", "pass", `${profile.employees} employees (≤500)`));
    } else if (profile.isSmallBusiness === true) {
      gates.push(gate("sbir:employees", "pass", "Small business (≤500 employees implied)"));
    } else {
      gates.push(
        gate("sbir:employees", "unknown", "SBIR caps company size at 500 employees", "employees"),
      );
    }

    if (profile.hasActiveRnD === false) {
      gates.push(gate("sbir:rnd", "fail", "SBIR/STTR funds active R&D work"));
    } else if (profile.hasActiveRnD === null) {
      gates.push(gate("sbir:rnd", "unknown", "SBIR/STTR funds active R&D work", "hasActiveRnD"));
    } else {
      gates.push(gate("sbir:rnd", "pass", "Active R&D underway"));
    }
  }

  // ---- amount_overlap (never "unknown"; missing data passes softly).
  // Asymmetric on purpose: an award far smaller than the need can still be
  // real, stackable money (soft 25% rule), but a program whose FLOOR dwarfs
  // the need funds different-scale work — the founder is not the intended
  // applicant. ----
  const needMin = profile.capitalNeedUsd.min;
  const needMax = profile.capitalNeedUsd.max;
  if (needMin != null && opp.awardCeilingUsd != null && opp.awardCeilingUsd < 0.25 * needMin) {
    gates.push(
      gate(
        "amount_overlap",
        "fail",
        `Max award $${opp.awardCeilingUsd.toLocaleString()} is under 25% of your $${needMin.toLocaleString()} minimum need`,
      ),
    );
  } else if (needMax != null && opp.awardFloorUsd != null && opp.awardFloorUsd > 2 * needMax) {
    gates.push(
      gate(
        "amount_overlap",
        "fail",
        `Minimum award $${opp.awardFloorUsd.toLocaleString()} is more than double your $${needMax.toLocaleString()} maximum need — this program funds larger-scale work`,
      ),
    );
  } else if (needMin != null && (opp.awardCeilingUsd != null || opp.awardFloorUsd != null)) {
    gates.push(
      gate(
        "amount_overlap",
        "pass",
        `Award range ${opp.awardFloorUsd != null ? `$${opp.awardFloorUsd.toLocaleString()}` : "?"}–${opp.awardCeilingUsd != null ? `$${opp.awardCeilingUsd.toLocaleString()}` : "?"} overlaps your $${needMin.toLocaleString()}${needMax != null ? `–$${needMax.toLocaleString()}` : "+"} need`,
      ),
    );
  } else {
    gates.push(gate("amount_overlap", "pass", "award size not published — not held against it"));
  }

  // ---- sam:lead_time (federal deadlines vs. registration reality).
  // SAM.gov registration takes 10-15 business days; crossing that with the
  // actual days remaining turns "are you registered?" into feasibility. ----
  const SAM_LEAD_DAYS = 30;
  if (opp.source !== "utah" && opp.closeDate && opp.closeDate >= todayIso) {
    const daysLeft = Math.round(
      (Date.parse(opp.closeDate) - Date.parse(todayIso)) / 86_400_000,
    );
    if (daysLeft < SAM_LEAD_DAYS) {
      if (profile.samRegistered === true) {
        gates.push(gate("sam:lead_time", "pass", "SAM.gov registration active"));
      } else if (profile.samRegistered === false) {
        gates.push(
          gate(
            "sam:lead_time",
            "fail",
            `Closes in ${daysLeft} days but SAM.gov registration takes 10-15 business days — unlikely to complete in time`,
          ),
        );
      } else {
        gates.push(
          gate(
            "sam:lead_time",
            "unknown",
            `Closes in ${daysLeft} days — federal applications need an active SAM.gov registration (10-15 business days to obtain)`,
            "samRegistered",
          ),
        );
      }
    }
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
