// POST /api/officer-preview — Program Officer Preview for one
// company profile against one opportunity (by id).

import type { CompanyProfile } from "@/lib/types";
import { getOpportunityById } from "@/lib/engine/retrieve";
import { officerPreview } from "@/lib/engine/officer";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    profile?: CompanyProfile;
    opportunityId?: string;
  } | null;
  const { profile, opportunityId } = body ?? {};
  if (!profile?.description || !opportunityId) {
    return Response.json(
      { error: "profile (with description) and opportunityId are required" },
      { status: 400 },
    );
  }
  const opp = getOpportunityById(opportunityId);
  if (!opp) {
    return Response.json({ error: `opportunity not found: ${opportunityId}` }, { status: 404 });
  }
  try {
    return Response.json(await officerPreview(profile, opp));
  } catch (err) {
    return Response.json(
      { error: `officer preview failed: ${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    );
  }
}
