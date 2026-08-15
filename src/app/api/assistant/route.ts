import { NextResponse } from "next/server";
import { complete } from "@/lib/llm";
import { PLAIN_LANGUAGE_RULE } from "@/lib/engine/plain-language";

// The sidebar assistant: grounded Q&A over (a) the founder's last analysis
// and (b) whatever page they are looking at right now. All facts come from
// the provided context — the model writes judgment and prose around them.

export const runtime = "nodejs";

const SYSTEM = `You are Opportunity Radar's assistant, a sidebar helper for a startup founder navigating US government funding. Be honest, warm, and brief.

${PLAIN_LANGUAGE_RULE}

Rules:
- Ground every number (award amounts, deadlines, scores, counts) in the provided context. If the context doesn't contain the answer, say so plainly and point to the best next step (e.g. the official notice link, or answering an eligibility question).
- Never invent award amounts, deadlines, statistics, or eligibility rules.
- The founder can see the page — don't recite it back; answer the question.
- 2–6 sentences, or a tight list. No headers, no markdown tables.`;

interface AskBody {
  question?: string;
  thread?: { role: "user" | "assistant"; text: string }[];
  pageContext?: { page?: string; title?: string; data?: unknown } | null;
  report?: unknown;
}

export async function POST(req: Request) {
  try {
    const { question, thread = [], pageContext = null, report = null } =
      (await req.json()) as AskBody;
    if (!question || typeof question !== "string") {
      return NextResponse.json({ error: "question required" }, { status: 400 });
    }

    const parts: string[] = [];
    if (report != null) {
      parts.push(`FOUNDER PROFILE + LAST ANALYSIS:\n${JSON.stringify(report, null, 1)}`);
    }
    if (pageContext != null) {
      parts.push(
        `ON THE FOUNDER'S SCREEN RIGHT NOW — ${pageContext.title ?? pageContext.page}:\n` +
          JSON.stringify(pageContext.data ?? pageContext, null, 1),
      );
    }
    const history = thread
      .slice(-8)
      .map((m) => `${m.role === "user" ? "Founder" : "You"}: ${m.text}`)
      .join("\n");

    const prompt = [
      parts.join("\n\n") || "(no analysis yet — the founder hasn't run a scan)",
      history ? `CONVERSATION SO FAR:\n${history}` : "",
      `Founder: ${question}`,
      "Reply to the founder.",
    ]
      .filter(Boolean)
      .join("\n\n");

    const answer = await complete(prompt, { system: SYSTEM, effort: "low", maxTokens: 400 });
    return NextResponse.json({ answer: answer.trim() });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
