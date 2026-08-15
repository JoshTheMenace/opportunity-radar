// Executes one Gemini Live function call server-side. Stateless — the
// browser sends its current profile so answer_question can build on it.
// Errors return 200 with {result:{error}} so the voice model can hear
// and relay the failure instead of going silent.

import type { CompanyProfile, MatchReport } from "@/lib/types";
import { executeVoiceTool } from "@/lib/voice/execute";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    name?: string;
    args?: Record<string, unknown>;
    profile?: CompanyProfile | null;
    /** Last report the client holds — enables the instant refine path. */
    priorReport?: MatchReport | null;
  } | null;
  if (!body?.name) return Response.json({ error: "name is required" }, { status: 400 });
  try {
    return Response.json(
      await executeVoiceTool(body.name, body.args ?? {}, body.profile ?? null, body.priorReport ?? null),
    );
  } catch (err) {
    console.error(`voice tool ${body.name} failed:`, err);
    return Response.json({
      result: { error: err instanceof Error ? err.message : String(err) },
    });
  }
}
