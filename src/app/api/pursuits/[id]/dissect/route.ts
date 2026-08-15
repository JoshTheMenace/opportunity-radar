// Build or refresh the public-source requirements dossier for one pursuit.
// This route deliberately does not access authenticated applicant portals.

import { getOpportunityById } from "@/lib/engine/retrieve";
import { getDossier, dissectOpportunity } from "@/lib/pursuit/dissector";
import { getPursuit } from "@/lib/pursuit/db";

export const runtime = "nodejs";

async function pursuitId(params: Promise<{ id: string }>): Promise<number> {
  return Number((await params).id);
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = await pursuitId(ctx.params);
  if (!getPursuit(id)) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({ dossier: getDossier(id) });
}

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = await pursuitId(ctx.params);
  const pursuit = getPursuit(id);
  if (!pursuit) return Response.json({ error: "not found" }, { status: 404 });
  const opportunity = getOpportunityById(pursuit.opportunityId);
  if (!opportunity) return Response.json({ error: "opportunity not found" }, { status: 404 });
  const dossier = await dissectOpportunity(id, opportunity);
  return Response.json({ dossier });
}
