import type { LlmBackend, CompleteOptions } from "./llm";

// Deterministic mock backend so the pipeline, eval harness, and UI can run
// end-to-end with no LLM provider. completeJSON fabricates a minimal object
// that satisfies common schema shapes used by the engine.

function skeletonFromSchema(schema: unknown): unknown {
  if (typeof schema !== "object" || schema === null) return null;
  const s = schema as Record<string, unknown>;
  const type = s.type as string | undefined;
  if (type === "object") {
    const out: Record<string, unknown> = {};
    const props = (s.properties ?? {}) as Record<string, unknown>;
    for (const [k, v] of Object.entries(props)) out[k] = skeletonFromSchema(v);
    return out;
  }
  if (type === "array") return [];
  if (type === "string") {
    const en = s.enum as string[] | undefined;
    return en?.[0] ?? "mock";
  }
  if (type === "number" || type === "integer") return 0;
  if (type === "boolean") return false;
  if (Array.isArray(s.anyOf)) return skeletonFromSchema(s.anyOf[0]);
  return null;
}

export const mockBackend: LlmBackend = {
  name: "mock",
  async complete(prompt: string, _opts?: CompleteOptions): Promise<string> {
    return `[mock completion for: ${prompt.slice(0, 80)}...]`;
  },
  async completeJSON<T>(_prompt: string, schema: object): Promise<T> {
    return skeletonFromSchema(schema) as T;
  },
};
