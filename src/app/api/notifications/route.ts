import { NextResponse } from "next/server";
import { listNotifications } from "@/lib/monitor/db";
import { getOpportunityById } from "@/lib/engine/retrieve";

export const runtime = "nodejs";

// GET /api/notifications[?companyId=N] — the Radar feed, newest first,
// with the matched opportunity attached for display.
export async function GET(req: Request) {
  const url = new URL(req.url);
  const companyId = url.searchParams.get("companyId");
  const notifications = listNotifications(companyId ? Number(companyId) : undefined).map((n) => ({
    ...n,
    opportunity: getOpportunityById(n.opportunityId) ?? null,
  }));
  return NextResponse.json({ notifications });
}
