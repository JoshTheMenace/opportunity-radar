// One pursuit: GET = pursuit + tasks + opportunity row.
// PATCH = {taskId, done} toggles a task, {status} updates the pursuit.

import { getOpportunityById } from "@/lib/engine/retrieve";
import { getDossier } from "@/lib/pursuit/dissector";
import {
  getPursuit,
  listTasks,
  setPursuitStatus,
  setTaskDone,
  type PursuitStatus,
} from "@/lib/pursuit/db";

export const runtime = "nodejs";

const STATUSES: PursuitStatus[] = ["active", "submitted", "won", "lost", "abandoned"];

async function pursuitId(params: Promise<{ id: string }>): Promise<number> {
  return Number((await params).id);
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = await pursuitId(ctx.params);
  const pursuit = getPursuit(id);
  if (!pursuit) return Response.json({ error: "not found" }, { status: 404 });
  return Response.json({
    pursuit,
    tasks: listTasks(id),
    opportunity: getOpportunityById(pursuit.opportunityId),
    dossier: getDossier(id),
  });
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = await pursuitId(ctx.params);
  if (!getPursuit(id)) return Response.json({ error: "not found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as {
    taskId?: number;
    done?: boolean;
    status?: string;
  } | null;

  if (body?.taskId != null && typeof body.done === "boolean") {
    setTaskDone(id, body.taskId, body.done);
  } else if (body?.status && STATUSES.includes(body.status as PursuitStatus)) {
    setPursuitStatus(id, body.status as PursuitStatus);
  } else {
    return Response.json(
      { error: "expected {taskId, done} or {status: active|submitted|won|lost|abandoned}" },
      { status: 400 },
    );
  }
  return Response.json({ pursuit: getPursuit(id), tasks: listTasks(id) });
}
