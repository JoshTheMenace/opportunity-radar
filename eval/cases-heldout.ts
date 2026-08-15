// ============================================================
// Held-out honesty cases — NOT part of the brief's locked 5, and
// deliberately never used while tuning prompts. Ordinary, credible
// businesses (revenue, staff, growth plans) with no federal-mission
// angle: exactly the profile most likely to fool a matcher that
// keys on "is this a credible company". Every one of these should
// produce honestNo=true. Run: pnpm tsx eval/run.ts --suite heldout
//
// Rule: if one of these fails, fix by principle (rubric/gates),
// never by adding a case-specific prompt line — then a NEW held-out
// case replaces any case that prompt work touched.
// ============================================================

import type { EvalCase } from "../src/lib/types";

export const HELDOUT_CASES: readonly EvalCase[] = Object.freeze([
  {
    id: "restaurant-group",
    founderInput:
      "We run a family restaurant group in Provo, Utah — three fast-casual " +
      "locations and a catering arm. 60 employees, $4.2M in annual revenue, " +
      "profitable, no outside investors. We're looking for $500K to $1M to " +
      "open two more locations and remodel our flagship.",
    mustSee: [],
    expectHonestNo: true,
  },
  {
    id: "dating-app",
    founderInput:
      "We're a 6-person startup in Salt Lake City building a dating app for " +
      "outdoor enthusiasts — hikers, skiers, climbers. 40K monthly active " +
      "users, $300K ARR from subscriptions, raised a $2M seed. Looking for " +
      "$500K to $1.5M to scale user acquisition in Denver and Boise.",
    mustSee: [],
    expectHonestNo: true,
  },
  {
    id: "fitness-franchise",
    founderInput:
      "We franchise boutique fitness studios out of Ogden, Utah — 12 open " +
      "locations across the Mountain West, 45 corporate employees, $6M " +
      "system-wide revenue. Bootstrapped and profitable. We want $1M to $2M " +
      "to accelerate franchise sales and build our training academy.",
    mustSee: [],
    expectHonestNo: true,
  },
  {
    id: "wedding-platform",
    founderInput:
      "We're an 11-person company in Lehi, Utah. Our platform helps couples " +
      "plan weddings — vendor marketplace, budgeting tools, registry. $1.1M " +
      "ARR, raised $3M. Seeking $1M to $3M to expand into the Texas and " +
      "Arizona markets and grow our vendor network.",
    mustSee: [],
    expectHonestNo: true,
  },
]);

export function getHeldoutCase(id: string): EvalCase | undefined {
  return HELDOUT_CASES.find((c) => c.id === id);
}
