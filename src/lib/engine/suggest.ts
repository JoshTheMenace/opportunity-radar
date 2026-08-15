// ============================================================
// Quick-reply suggestions for the interview. One cheap/fast LLM
// call (gpt-5.6-luna) turns the open questions into a few one-tap
// replies; each reply is a plain-English founder message routed
// through the freeform answer parser (/api/answer {message}).
//
// Suggestions are garnish: any failure returns [] and the
// interview works fine without them. Boolean/choice questions
// already have deterministic buttons — this exists for threshold
// answers ("fewer than 500 employees") and compound answers that
// settle several questions in one tap.
// ============================================================

import { completeJSON } from "@/lib/llm";
import type { InterviewQuestion } from "@/lib/types";

/** Cheap/fast model for low-stakes suggestion calls. */
const SUGGEST_MODEL = process.env.SUGGEST_MODEL ?? "gpt-5.6-luna";

export interface QuickReply {
  label: string; // chip text shown to the founder
  message: string; // first-person message sent through the freeform parser
}

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["replies"],
  properties: {
    replies: {
      type: "array",
      maxItems: 4,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["label", "message"],
        properties: {
          label: { type: "string", maxLength: 40 },
          message: { type: "string", maxLength: 200 },
        },
      },
    },
  },
} as const;

const SYSTEM =
  "You write one-tap quick replies for a founder answering eligibility " +
  "questions about their company. A reply is only useful if tapping it " +
  "states a true-or-not fact the founder merely confirms — never a specific " +
  "only they could type.";

function questionBlock(q: InterviewQuestion, i: number): string {
  return [
    `--- Question ${i + 1} ---`,
    `field: ${q.field} | answerType: ${q.answerType}`,
    `question: ${q.question}`,
    `context: ${q.whyAsking}`,
    q.choices ? `choices: ${q.choices.join(", ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Up to 4 tappable replies for the open questions. Best-effort: returns []
 * on any model/parse failure so the interview never blocks on suggestions.
 */
export async function suggestQuickReplies(
  questions: InterviewQuestion[],
): Promise<QuickReply[]> {
  if (questions.length === 0) return [];
  try {
    const { replies } = await completeJSON<{ replies: QuickReply[] }>(
      `A founder sees these open eligibility questions:

${questions.map(questionBlock).join("\n")}

Write 0-4 one-tap quick replies. Rules:
- Each reply must FULLY settle at least one question by itself. A reply the
  founder taps is an assertion of fact — so only offer facts a founder can
  confirm at a glance (yes/no facts, threshold facts).
- NEVER invent specifics only the founder could type: exact headcounts, exact
  revenue figures, city or state names. Questions needing those get NO reply.
- A "number" question gets a reply ONLY if its context implies a threshold
  (e.g. "cap headcount at 500" -> "We have fewer than 500 employees").
  Never suggest an exact number.
- If 2+ yes/no questions are open, include ONE compound reply that answers
  them all affirmatively in a single sentence (founders tap it only if true).
- Do not duplicate a plain single yes/no that an existing Yes/No button
  already covers, unless it is part of a compound reply.
- label: at most 32 characters, plain sentence case, no emoji.
- message: ONE short first-person sentence stating the fact(s), explicit
  enough that a parser can extract each answer.

Return {"replies": []} if no question qualifies.`,
      SCHEMA,
      { system: SYSTEM, effort: "low", maxTokens: 400, model: SUGGEST_MODEL },
    );
    return (Array.isArray(replies) ? replies : [])
      .filter((r) => r.label?.trim() && r.message?.trim())
      .slice(0, 4);
  } catch (err) {
    console.error("suggest: quick replies unavailable:", err);
    return [];
  }
}
