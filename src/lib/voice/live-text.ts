// ============================================================
// Headless Gemini Live session — lets the eval harness drive the
// voice agent with a typed founder input and capture what it says
// back. The live model only speaks AUDIO, so we request the output
// transcription and discard the audio bytes; input is plain text.
// Same persona + tools as the browser voice panel; tool calls
// execute in-process. Node-only (global WebSocket, Node >= 22).
// Not imported by the web app.
// ============================================================

import type { CompanyProfile } from "../types";
import type { UiMatchReport } from "@/app/api/engine-facade";
import { SYSTEM_INSTRUCTION, TOOL_DECLARATIONS } from "./schema";
import { executeVoiceTool } from "./execute";

export interface LiveTextRun {
  report: UiMatchReport;
  /** Concatenation of everything the agent said across its turns. */
  agentText: string;
  turns: number;
}

interface LiveServerMsg {
  setupComplete?: object;
  serverContent?: {
    turnComplete?: boolean;
    modelTurn?: { parts?: { text?: string }[] };
    outputTranscription?: { text?: string };
  };
  toolCall?: { functionCalls?: { id?: string; name: string; args?: Record<string, unknown> }[] };
  goAway?: object;
}

const HOST = "generativelanguage.googleapis.com";
const NUDGE = "Please run the analysis now with the information you already have.";

async function msgToText(data: unknown): Promise<string> {
  if (typeof data === "string") return data;
  if (data instanceof Blob) return data.text();
  return Buffer.from(data as ArrayBuffer).toString("utf8");
}

/**
 * One scripted conversation: founder paragraph in, agent expected to call
 * analyze_company (nudged up to maxTurns if it stalls), resolves once a
 * turn completes with a report in hand.
 */
export function runLiveText(
  founderInput: string,
  opts?: { timeoutMs?: number; maxTurns?: number },
): Promise<LiveTextRun> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set — required for the live provider");
  if (typeof WebSocket === "undefined")
    throw new Error("global WebSocket missing — run with Node >= 22");
  const model = process.env.GEMINI_LIVE_MODEL ?? "gemini-3.1-flash-live-preview";
  const timeoutMs = opts?.timeoutMs ?? 180_000;
  const maxTurns = opts?.maxTurns ?? 4;

  const ws = new WebSocket(
    `wss://${HOST}/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(key)}`,
  );

  let profile: CompanyProfile | null = null;
  let report: UiMatchReport | null = null;
  let agentText = "";
  let turns = 0;
  let toolBusy = false;
  let settled = false;

  return new Promise<LiveTextRun>((resolve, reject) => {
    const settle = (err: Error | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        ws.close();
      } catch {}
      if (err) reject(err);
      else resolve({ report: report!, agentText, turns });
    };
    const timer = setTimeout(
      () => settle(new Error(`live session timed out after ${timeoutMs}ms`)),
      timeoutMs,
    );

    const sendUser = (text: string) => {
      turns++;
      ws.send(
        JSON.stringify({
          clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: true },
        }),
      );
    };

    const handleToolCalls = async (
      calls: NonNullable<NonNullable<LiveServerMsg["toolCall"]>["functionCalls"]>,
    ) => {
      toolBusy = true;
      const functionResponses = [];
      for (const c of calls) {
        let result: unknown;
        try {
          const out = await executeVoiceTool(c.name, c.args ?? {}, profile);
          result = out.result;
          if (out.report) {
            report = out.report;
            profile = out.report.profile;
          }
        } catch (err) {
          result = { error: err instanceof Error ? err.message : String(err) };
        }
        functionResponses.push({ id: c.id, name: c.name, response: { result } });
      }
      toolBusy = false;
      if (!settled) ws.send(JSON.stringify({ toolResponse: { functionResponses } }));
    };

    ws.addEventListener("open", () => {
      ws.send(
        JSON.stringify({
          setup: {
            model: `models/${model}`,
            // The live model rejects TEXT responses — AUDIO + transcription
            // is how we get its words back (verified live 2026-08-14).
            generationConfig: { responseModalities: ["AUDIO"] },
            outputAudioTranscription: {},
            systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
            tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
          },
        }),
      );
    });
    ws.addEventListener("error", () => settle(new Error("live websocket error")));
    ws.addEventListener("close", (e) =>
      settle(new Error(`live session closed early${e.reason ? `: ${e.reason}` : ""}`)),
    );
    ws.addEventListener("message", (e) => {
      void (async () => {
        const msg = JSON.parse(await msgToText(e.data)) as LiveServerMsg;
        if (msg.setupComplete) sendUser(founderInput);
        if (msg.toolCall?.functionCalls?.length) await handleToolCalls(msg.toolCall.functionCalls);
        const sc = msg.serverContent;
        if (sc) {
          for (const p of sc.modelTurn?.parts ?? []) if (p.text) agentText += p.text;
          if (sc.outputTranscription?.text) agentText += sc.outputTranscription.text;
          if (sc.turnComplete && !toolBusy) {
            if (report) settle(null);
            else if (turns < maxTurns) sendUser(NUDGE);
            else settle(new Error("live agent never produced a report (no analyze_company call)"));
          }
        }
      })().catch((err) => settle(err as Error));
    });
  });
}
