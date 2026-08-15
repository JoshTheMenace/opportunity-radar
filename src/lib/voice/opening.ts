// The [SESSION STARTED] turn for voice mode. A fresh visitor gets the
// standard greeting prompt; a RETURNING founder's turn carries their
// CURRENT STATE so the agent resumes instead of restarting the interview
// (stop/start used to wipe the conversation back to "what are you
// building?"). Client-safe: types + pure helpers only.

import { formatUsdCompact } from "../engine/meter";
import { profileReadiness } from "../engine/readiness";
import type { CompanyProfile, MatchReport, Opportunity } from "../types";

type UiReport = MatchReport & { opportunities?: Record<string, Opportunity> };

const usd = (n: number) => formatUsdCompact(n);
const yn = (b: boolean) => (b ? "yes" : "no");

export function sessionOpening(
  profile: CompanyProfile | null,
  report: MatchReport | null,
): string {
  if (!profile) {
    return "[SESSION STARTED] The founder just joined the voice session. Greet them now.";
  }

  const loc = profile.location
    ? [profile.location.city, profile.location.state].filter(Boolean).join(", ")
    : null;
  const who = `${profile.name ?? "an unnamed company"}${loc ? ` in ${loc}` : ""}${
    profile.industry ? ` (${profile.industry})` : ""
  }`;

  const known: string[] = [];
  if (profile.employees != null) known.push(`${profile.employees} employees`);
  if (profile.annualRevenueUsd != null) known.push(`revenue ${usd(profile.annualRevenueUsd)}`);
  const need = [profile.capitalNeedUsd.min, profile.capitalNeedUsd.max].filter(
    (n): n is number => n != null,
  );
  if (need.length) known.push(`seeking ${need.map(usd).join("–")}`);
  if (profile.productMaturity != null) known.push(`product stage ${profile.productMaturity}`);
  if (profile.hasActiveRnD != null) known.push(`active R&D ${yn(profile.hasActiveRnD)}`);
  if (profile.majorityUsOwned != null) known.push(`majority US-owned ${yn(profile.majorityUsOwned)}`);
  if (profile.samRegistered != null) known.push(`SAM.gov registered ${yn(profile.samRegistered)}`);
  if (profile.isForProfit != null) known.push(`for-profit ${yn(profile.isForProfit)}`);

  const readiness = profileReadiness(profile);
  const still = readiness.ready
    ? "every required basic is answered"
    : `still needed before ranking: ${readiness.missing.map((m) => m.label).join(", ")}`;

  let scan = "no scan has run in this browser session yet";
  if (report) {
    if (report.honestNo) {
      scan = "their last scan was an honest no — no strong federal match";
    } else if (report.matches.length > 0) {
      const top = report.matches.reduce((a, b) => (a.score >= b.score ? a : b));
      const title = (report as UiReport).opportunities?.[top.opportunityId]?.title;
      scan = `their last scan found ${report.matches.length} matches${
        title ? `, top: "${title}" (score ${top.score})` : ` (top score ${top.score})`
      }`;
    } else {
      scan = "their last scan is holding for the missing basics above";
    }
  }

  return (
    `[SESSION STARTED] RETURNING founder — their profile and report are already on screen. ` +
    `CURRENT STATE: ${who}; known facts: ${known.join(", ") || "little beyond the description"}; ${still}; ${scan}. ` +
    `Their own words: "${profile.description.slice(0, 300)}". ` +
    `Greet them as returning in ONE short sentence that shows you know where things stand. ` +
    `Do NOT re-introduce the product, do NOT re-ask any known fact above, do NOT restart discovery, ` +
    `and do NOT call analyze_company unless they say their company details changed. ` +
    `Pick up where they left off: ${
      readiness.ready
        ? report && report.matches.length > 0
          ? "offer to walk through their top match or answer the open eligibility questions"
          : "offer to run the scan"
        : "gather the still-needed basics conversationally"
    }.`
  );
}
