// ============================================================
// The 5 standard eval cases from the hackathon brief — LOCKED.
// These mirror the brief's published test set verbatim (employee
// counts, revenue, raise, need ranges verified against the brief
// 2026-08-14). Judges score against exactly these five: DO NOT
// edit facts or thresholds to make scores look better. Add new
// cases in a separate file if you need extra coverage.
// ============================================================

import type { EvalCase } from "../src/lib/types";

export const EVAL_CASES: readonly EvalCase[] = Object.freeze([
  {
    id: "ai-healthcare",
    founderInput:
      "We're a 15-person software company based in Lehi, Utah. Our SaaS platform " +
      "uses AI to reduce the administrative burden on nurses — automating charting, " +
      "shift handoffs, and compliance documentation so nurses spend more time with " +
      "patients. We're at $1M ARR and we've raised $2.5M in venture funding. We're " +
      "looking for $500K to $2M in non-dilutive funding to accelerate product " +
      "development and run pilot programs with hospital systems.",
    mustSee: ["NIH", "NSF", "HHS", "SBIR", "workforce"],
    expectHonestNo: false,
  },
  {
    id: "aerospace",
    founderInput:
      "We're a 35-person hardware company in Ogden, Utah. We do advanced " +
      "manufacturing of lightweight components for the aerospace industry — " +
      "composite structures and precision-machined parts. We're at $3M in revenue " +
      "and have raised $8M. We're looking for $2M to $5M to scale up our " +
      "manufacturing capacity and fund continued R&D.",
    mustSee: ["DoD", "NASA", "DOE", "procurement"],
    expectHonestNo: false,
  },
  {
    id: "water",
    founderInput:
      "We're a 10-person company in Salt Lake City, Utah. We combine in-pipe " +
      "sensors with AI analytics to help municipalities detect and reduce water " +
      "loss in their distribution systems. We're at $500K in revenue and have " +
      "raised $1.5M. We're seeking $500K to $3M for product development and pilot " +
      "deployments with municipal water districts.",
    mustSee: ["EPA", "DOE", "infrastructure"],
    expectHonestNo: false,
  },
  {
    id: "cyber",
    founderInput:
      "We're a 22-person cybersecurity company in Provo, Utah. We build AI-powered " +
      "threat detection for small and mid-sized businesses that can't afford a " +
      "full security operations center. We're at $2M ARR and have raised $5M. " +
      "We're looking for $1M to $3M to fund R&D and expand into the federal market.",
    mustSee: ["DoD", "DHS", "SBIR", "procurement"],
    expectHonestNo: false,
  },
  {
    id: "youth-marketplace",
    founderInput:
      "We're an 8-person company in Salt Lake City, Utah. We run a consumer " +
      "marketplace app that connects parents with local youth activities — sports " +
      "leagues, camps, tutoring, and music lessons. We're at $750K in revenue and " +
      "have raised $1M. We're looking for $250K to $1M to expand into new metro areas.",
    // Trap case: no real federal fit — the honest answer is "no", possibly
    // pointing at adjacent workforce/education/small-business/community programs.
    mustSee: ["workforce", "education", "small business", "community"],
    expectHonestNo: true,
  },
]);

export function getCase(id: string): EvalCase | undefined {
  return EVAL_CASES.find((c) => c.id === id);
}
