// Fallback backend: Claude API (needs ANTHROPIC_API_KEY in .env.local).
import Anthropic from "@anthropic-ai/sdk";
import type { LlmBackend, CompleteOptions } from "./llm";

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

function textOf(msg: Anthropic.Message): string {
  return msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}

const effortMap = { low: "low", medium: "medium", high: "high" } as const;

export const anthropicBackend: LlmBackend = {
  name: `anthropic:${MODEL}`,
  async complete(prompt: string, opts?: CompleteOptions): Promise<string> {
    const msg = await getClient().messages.create({
      model: MODEL,
      max_tokens: opts?.maxTokens ?? 8000,
      system: opts?.system,
      output_config: { effort: effortMap[opts?.effort ?? "medium"] },
      messages: [{ role: "user", content: prompt }],
    });
    return textOf(msg);
  },
  async completeJSON<T>(prompt: string, schema: object, opts?: CompleteOptions): Promise<T> {
    const msg = await getClient().messages.create({
      model: MODEL,
      max_tokens: opts?.maxTokens ?? 8000,
      system: opts?.system,
      output_config: {
        effort: effortMap[opts?.effort ?? "medium"],
        format: { type: "json_schema", schema: schema as Record<string, unknown> },
      },
      messages: [{ role: "user", content: prompt }],
    });
    return JSON.parse(textOf(msg)) as T;
  },
};
