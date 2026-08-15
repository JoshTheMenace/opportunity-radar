// Screening — server wrapper. Reads the corpus size from the DB (server-only,
// better-sqlite3) and hands real counts to the client dashboard. All report-
// derived numbers come from sessionStorage on the client.

import type { Metadata } from "next";
import { countBySource } from "@/lib/engine/retrieve";
import ScreeningClient from "./screening-client";

export const metadata: Metadata = { title: "Screening" };

// The corpus grows with every ingest run — never cache a stale count.
export const dynamic = "force-dynamic";

/** Distinct deterministic gate checks in src/lib/engine/gates.ts:
 *  deadline, eligibility:for_profit, eligibility:small_business,
 *  sbir:ownership, sbir:employees, sbir:rnd, amount_overlap,
 *  sam:lead_time, geo:utah. Update this if gates.ts adds a rule. */
const GATE_RULE_COUNT = 9;

export default function ScreeningPage() {
  let screenedCount = 0;
  try {
    screenedCount = Object.values(countBySource()).reduce((a, b) => a + b, 0);
  } catch {
    // fresh checkout with no DB — the client copy degrades gracefully
  }
  return <ScreeningClient screenedCount={screenedCount} ruleCount={GATE_RULE_COUNT} />;
}
