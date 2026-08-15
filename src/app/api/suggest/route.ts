import type { InterviewQuestion } from "@/lib/types";
import { suggestQuickReplies } from "@/lib/engine/suggest";

export const runtime = "nodejs";

/** POST {questions} -> {replies}: one-tap quick replies for the interview. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    questions?: InterviewQuestion[];
  } | null;
  const questions = Array.isArray(body?.questions) ? body.questions : [];
  return Response.json({ replies: await suggestQuickReplies(questions) });
}
