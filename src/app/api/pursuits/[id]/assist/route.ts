// "Help me do this": generates concrete, founder-specific guidance for one
// plan task (steps, links to the official portals, a draft outline when the
// task is writing work). Cached on the task row — regenerate by re-POSTing.

import { complete } from "@/lib/llm";
import { getOpportunityById } from "@/lib/engine/retrieve";
import { getPursuit, getTask, setTaskAssist } from "@/lib/pursuit/db";

export const runtime = "nodejs";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const id = Number((await ctx.params).id);
  const pursuit = getPursuit(id);
  if (!pursuit) return Response.json({ error: "not found" }, { status: 404 });
  const body = (await req.json().catch(() => null)) as { taskId?: number } | null;
  const task = body?.taskId != null ? getTask(id, body.taskId) : null;
  if (!task) return Response.json({ error: "taskId required" }, { status: 400 });

  const opp = getOpportunityById(pursuit.opportunityId);
  const prompt = [
    "You are a grants consultant helping a startup founder complete ONE task in their",
    "submission plan. Write practical, specific guidance they can act on today:",
    "- numbered steps with realistic time estimates",
    "- exact official websites/portals by name when relevant (never invent URLs beyond well-known .gov portals)",
    "- if the task is writing work, include a section-by-section outline seeded with this company's actual details",
    "- ground every fact in the data below; if something must be verified, say to verify it and where",
    "Keep it under 350 words. Plain text with simple numbered lists (no markdown headers).",
    "",
    `TASK: ${task.title}`,
    `TASK CONTEXT: ${task.detail}`,
    task.dueDate ? `DUE: ${task.dueDate}` : "",
    "",
    `OPPORTUNITY: ${JSON.stringify(
      opp && {
        title: opp.title,
        agency: opp.agency,
        kind: opp.kind,
        awardFloorUsd: opp.awardFloorUsd,
        awardCeilingUsd: opp.awardCeilingUsd,
        closeDate: opp.closeDate,
        url: opp.url,
        contactName: opp.contactName,
        contactEmail: opp.contactEmail,
        eligibilityText: opp.eligibilityText?.slice(0, 800) ?? null,
        description: opp.description.slice(0, 1500),
      },
      null,
      1,
    )}`,
    "",
    `COMPANY PROFILE: ${JSON.stringify(pursuit.profile, null, 1)}`,
  ]
    .filter(Boolean)
    .join("\n");

  const assist = (await complete(prompt, { effort: "medium", maxTokens: 900 })).trim();
  setTaskAssist(id, task.id, assist);
  return Response.json({ taskId: task.id, assist });
}
