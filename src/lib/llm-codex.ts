// ============================================================
// Codex app server backend — runs LLM calls through the locally
// installed `codex app-server` (JSON-RPC over stdio) on Josh's
// ChatGPT subscription. Default model: gpt-5.6-sol.
//
// Protocol (verified live against codex-cli 0.146.0):
//   initialize -> initialized -> thread/start (ephemeral) ->
//   turn/start {input, outputSchema?, effort} ->
//   notifications: item/completed (agentMessage.text), turn/completed
// ============================================================

import { spawn, type ChildProcessByStdio } from "child_process";
import type { Readable, Writable } from "stream";
import type { LlmBackend, CompleteOptions } from "./llm";

const CODEX_BIN = process.env.CODEX_BIN ?? "codex";
const CODEX_MODEL = process.env.CODEX_MODEL ?? "gpt-5.6-sol";
const TURN_TIMEOUT_MS = Number(process.env.CODEX_TURN_TIMEOUT_MS ?? 240_000);

type Pending = { resolve: (v: unknown) => void; reject: (e: Error) => void };
type ThreadWaiter = {
  resolve: (text: string) => void;
  reject: (e: Error) => void;
  lastAgentText: string;
  timer: NodeJS.Timeout;
};

class CodexAppServer {
  private proc: ChildProcessByStdio<Writable, Readable, Readable> | null = null;
  private buf = "";
  private nextId = 1;
  private pending = new Map<number, Pending>();
  private waiters = new Map<string, ThreadWaiter>(); // threadId -> waiter
  private ready: Promise<void> | null = null;

  private async ensureStarted(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = this.start();
    return this.ready;
  }

  private async start(): Promise<void> {
    const proc = spawn(CODEX_BIN, ["app-server"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.proc = proc;
    proc.stderr.on("data", () => {}); // codex logs OAuth/MCP noise here; ignore
    proc.stdout.on("data", (d: Buffer) => this.onData(d));
    proc.on("exit", (code) => {
      const err = new Error(`codex app-server exited (code ${code})`);
      for (const p of this.pending.values()) p.reject(err);
      this.pending.clear();
      for (const w of this.waiters.values()) w.reject(err);
      this.waiters.clear();
      this.proc = null;
      this.ready = null;
    });
    await this.request("initialize", {
      clientInfo: { name: "opportunity-radar", title: "Opportunity Radar", version: "0.1.0" },
      capabilities: null,
    });
    this.notify("initialized", {});
  }

  private send(msg: object) {
    this.proc?.stdin.write(JSON.stringify(msg) + "\n");
  }

  private notify(method: string, params: object) {
    this.send({ jsonrpc: "2.0", method, params });
  }

  private request(method: string, params: object): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  private onData(d: Buffer) {
    this.buf += d.toString();
    let nl: number;
    while ((nl = this.buf.indexOf("\n")) >= 0) {
      const line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      if (!line.trim()) continue;
      let msg: Record<string, unknown>;
      try {
        msg = JSON.parse(line);
      } catch {
        continue;
      }
      this.onMessage(msg);
    }
  }

  private onMessage(msg: Record<string, unknown>) {
    // Response to one of our requests
    if (msg.id !== undefined && !msg.method) {
      const p = this.pending.get(msg.id as number);
      if (p) {
        this.pending.delete(msg.id as number);
        if (msg.error) p.reject(new Error(`codex rpc error: ${JSON.stringify(msg.error)}`));
        else p.resolve(msg.result);
      }
      return;
    }
    // Server -> client REQUEST (approvals). We run read-only/never, so these
    // should not occur; deny defensively so the server never hangs on us.
    if (msg.id !== undefined && msg.method) {
      this.send({ jsonrpc: "2.0", id: msg.id, result: { decision: "denied" } });
      return;
    }
    // Notifications
    const method = msg.method as string;
    const params = (msg.params ?? {}) as Record<string, unknown>;
    if (method === "item/completed") {
      const item = params.item as Record<string, unknown> | undefined;
      const threadId = params.threadId as string;
      const w = this.waiters.get(threadId);
      if (w && item?.type === "agentMessage" && typeof item.text === "string") {
        w.lastAgentText = item.text;
      }
    } else if (method === "turn/completed") {
      const threadId = params.threadId as string;
      const w = this.waiters.get(threadId);
      if (w) {
        this.waiters.delete(threadId);
        clearTimeout(w.timer);
        w.resolve(w.lastAgentText);
      }
    } else if (method === "error") {
      const threadId = params.threadId as string | undefined;
      if (threadId && this.waiters.has(threadId)) {
        const w = this.waiters.get(threadId)!;
        this.waiters.delete(threadId);
        clearTimeout(w.timer);
        w.reject(new Error(`codex turn error: ${JSON.stringify(params).slice(0, 500)}`));
      }
    }
  }

  /** Run one prompt on a fresh ephemeral thread; resolves with final agent text. */
  async runTurn(
    prompt: string,
    opts: { system?: string; effort?: "low" | "medium" | "high"; outputSchema?: object },
  ): Promise<string> {
    await this.ensureStarted();
    const started = (await this.request("thread/start", {
      model: CODEX_MODEL,
      cwd: process.cwd(),
      ephemeral: true,
      sandbox: "read-only",
      approvalPolicy: "never",
      // No repo/tool context wanted — this is a pure LLM call.
      baseInstructions:
        opts.system ??
        "You are a precise analysis engine inside an application. Answer the user's request directly. Do not use tools, do not explore files, do not narrate. Output only the requested content.",
      config: { mcp_servers: {} }, // don't spin up Josh's MCP servers per thread
    })) as { thread?: { id?: string } };
    const threadId = started?.thread?.id;
    if (!threadId) throw new Error("codex thread/start returned no thread id");

    const textPromise = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(threadId);
        reject(new Error(`codex turn timed out after ${TURN_TIMEOUT_MS}ms`));
      }, TURN_TIMEOUT_MS);
      this.waiters.set(threadId, { resolve, reject, lastAgentText: "", timer });
    });

    await this.request("turn/start", {
      threadId,
      input: [{ type: "text", text: prompt, text_elements: [] }],
      effort: opts.effort ?? "medium",
      ...(opts.outputSchema ? { outputSchema: opts.outputSchema } : {}),
    });
    return textPromise;
  }
}

const server = new CodexAppServer();

function extractJson(text: string): string {
  const t = text.trim();
  if (t.startsWith("{") || t.startsWith("[")) return t;
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  const start = t.search(/[[{]/);
  if (start >= 0) return t.slice(start);
  return t;
}

export const codexBackend: LlmBackend = {
  name: `codex:${CODEX_MODEL}`,
  async complete(prompt: string, opts?: CompleteOptions): Promise<string> {
    return server.runTurn(prompt, { system: opts?.system, effort: opts?.effort });
  },
  async completeJSON<T>(prompt: string, schema: object, opts?: CompleteOptions): Promise<T> {
    const run = async (extra: string): Promise<T> => {
      const text = await server.runTurn(prompt + extra, {
        system: opts?.system,
        effort: opts?.effort,
        outputSchema: schema,
      });
      return JSON.parse(extractJson(text)) as T;
    };
    try {
      return await run("");
    } catch {
      // one retry with an explicit nudge
      return run("\n\nIMPORTANT: Respond with ONLY a valid JSON value matching the required schema. No prose, no code fences.");
    }
  },
};
