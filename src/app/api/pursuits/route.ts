// Pursuits: GET = list (with progress + opportunity summary for the
// dashboard; ?opportunityId= narrows to one). POST = start a pursuit —
// generates the submission plan (LLM + deterministic scaffold) and
// stores it as a task list.

import type { CompanyProfile, RankedMatch } from "@/lib/types";
import { getOpportunityById } from "@/lib/engine/retrieve";
import { listCompanies } from "@/lib/monitor/db";
import {
  createPursuit,
  getPursuitByOpportunity,
  listPursuits,
  listTasks,
} from "@/lib/pursuit/db";
import { generatePlan } from "@/lib/pursuit/plan";

export const runtime = "nodejs";

function withProgress(p: ReturnType<typeof listPursuits>[number]) {
  const tasks = listTasks(p.id);
  const done = tasks.filter((t) => t.done).length;
  const next = tasks.find((t) => !t.done) ?? null;
  const opp = getOpportunityById(p.opportunityId);
  return {
    ...p,
    profile: undefined, // heavy; not needed for lists
    taskCount: tasks.length,
    doneCount: done,
    nextTask: next && { id: next.id, title: next.title, dueDate: next.dueDate },
    opportunity: opp && {
      title: opp.title,
      agency: opp.agency,
      closeDate: opp.closeDate,
      awardCeilingUsd: opp.awardCeilingUsd,
    },
  };
}

export async function GET(req: Request) {
  const opportunityId = new URL(req.url).searchParams.get("opportunityId");
  if (opportunityId) {
    const p = getPursuitByOpportunity(opportunityId);
    return Response.json({ pursuits: p ? [withProgress(p)] : [] });
  }
  return Response.json({ pursuits: listPursuits().map(withProgress) });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    opportunityId?: string;
    profile?: CompanyProfile | null;
    match?: RankedMatch | null;
  } | null;
  const opportunityId = body?.opportunityId;
  if (!opportunityId) {
    return Response.json({ error: "opportunityId is required" }, { status: 400 });
  }
  const opp = getOpportunityById(opportunityId);
  if (!opp) return Response.json({ error: "unknown opportunity" }, { status: 404 });

  const existing = getPursuitByOpportunity(opportunityId);
  if (existing) {
    return Response.json({ pursuit: existing, tasks: listTasks(existing.id), existed: true });
  }

  // Profile: prefer the one the client sent; fall back to the latest saved.
  const profile =
    body?.profile ??
    listCompanies()
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
      .map((c) => c.profile)[0];
  if (!profile?.description) {
    return Response.json(
      { error: "no company profile yet — run an analysis first" },
      { status: 400 },
    );
  }

  const plan = await generatePlan(opp, profile);
  const pursuit = createPursuit(
    opportunityId,
    profile,
    body?.match ?? null,
    plan.summary,
    plan.tasks,
  );
  return Response.json({ pursuit, tasks: listTasks(pursuit.id), existed: false });
}
