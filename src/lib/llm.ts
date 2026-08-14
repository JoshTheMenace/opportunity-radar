// ============================================================
// Provider-agnostic LLM interface.
//
// The engine calls ONLY these two functions. Backends:
//   - "codex":   Josh's Codex app server (GPT 5.6 Sol) — adapter in
//                llm-codex.ts, wired once endpoint docs arrive.
//   - "anthropic": Claude API fallback (needs ANTHROPIC_API_KEY).
//   - "mock":    deterministic canned responses for tests/CI.
// Select with LLM_BACKEND env var; defaults to codex, falls back to
// anthropic if ANTHROPIC_API_KEY is set and codex is unreachable.
// ============================================================

export interface CompleteOptions {
  system?: string;
  maxTokens?: number;
  /** Rough effort knob; adapters map to their provider's equivalent. */
  effort?: "low" | "medium" | "high";
}

export interface LlmBackend {
  name: string;
  /** Free-text completion. */
  complete(prompt: string, opts?: CompleteOptions): Promise<string>;
  /**
   * JSON completion validated against a JSON Schema (draft-07-ish subset).
   * Adapters must retry once on parse/validation failure before throwing.
   */
  completeJSON<T>(prompt: string, schema: object, opts?: CompleteOptions): Promise<T>;
}

let backend: LlmBackend | null = null;

export function setBackend(b: LlmBackend) {
  backend = b;
}

export async function getBackend(): Promise<LlmBackend> {
  if (backend) return backend;
  const which = process.env.LLM_BACKEND ?? "codex";
  if (which === "mock") {
    const { mockBackend } = await import("./llm-mock");
    backend = mockBackend;
  } else if (which === "anthropic") {
    const { anthropicBackend } = await import("./llm-anthropic");
    backend = anthropicBackend;
  } else {
    const { codexBackend } = await import("./llm-codex");
    backend = codexBackend;
  }
  return backend;
}

export async function complete(prompt: string, opts?: CompleteOptions): Promise<string> {
  return (await getBackend()).complete(prompt, opts);
}

export async function completeJSON<T>(
  prompt: string,
  schema: object,
  opts?: CompleteOptions,
): Promise<T> {
  return (await getBackend()).completeJSON<T>(prompt, schema, opts);
}
