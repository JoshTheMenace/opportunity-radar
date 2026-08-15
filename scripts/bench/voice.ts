// ============================================================
// Latency benchmark: the Gemini Live voice loop, text in, timed
// to the millisecond. Mirrors the BROWSER flow: analyze_company
// answers instantly with "analysis_started" (the real pipeline is
// backgrounded in production), answer_question executes the real
// incremental refine against a hold report built during prep.
// Per turn: send → first audio, first transcription, tool calls
// (dispatch + execution), turn complete, spoken seconds.
// Run: set -a; source .env.local; set +a; pnpm tsx scripts/bench/voice.ts
// ============================================================

import { runAnalysis, type UiMatchReport } from "../../src/app/api/engine-facade";
import { executeVoiceTool } from "../../src/lib/voice/execute";
import { SYSTEM_INSTRUCTION, TOOL_DECLARATIONS } from "../../src/lib/voice/schema";

const SPARSE_TEXT =
  "We build robotics kits that teach middle school science classes hands-on engineering. Based in Tucson, Arizona, 6 people.";

const s = (ms: number) => `${(ms / 1000).toFixed(2)}s`;

interface TurnStats {
  label: string;
  sentAt: number;
  firstAudio: number | null;
  firstTranscript: number | null;
  toolCalls: { name: string; dispatchMs: number; execMs: number }[];
  turnComplete: number | null;
  audioBytes: number;
  transcript: string;
}

async function main() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY not set (source .env.local)");
  const model = process.env.GEMINI_LIVE_MODEL ?? "gemini-3.1-flash-live-preview";

  // Prep (not a voice metric): hold report for realistic answer_question refines.
  console.log("prep: building readiness-hold report (extraction + gates)…");
  const tPrep = Date.now();
  const holdReport: UiMatchReport = await runAnalysis(SPARSE_TEXT, null, () => {});
  let report = holdReport;
  console.log(
    `prep done in ${s(Date.now() - tPrep)} (matches=${holdReport.matches.length} — held as expected)\n`,
  );

  const t0 = Date.now();
  const ws = new WebSocket(
    `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key=${encodeURIComponent(key)}`,
  );
  const turns: TurnStats[] = [];
  let current: TurnStats | null = null;
  let setupCompleteAt = 0;

  const send = (obj: unknown) => ws.send(JSON.stringify(obj));
  const sendTurn = (label: string, text: string) => {
    current = {
      label,
      sentAt: Date.now(),
      firstAudio: null,
      firstTranscript: null,
      toolCalls: [],
      turnComplete: null,
      audioBytes: 0,
      transcript: "",
    };
    turns.push(current);
    send({
      clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: true },
    });
  };

  const script: { label: string; text: string }[] = [
    {
      label: "1. greeting ([SESSION STARTED])",
      text: "[SESSION STARTED] The founder just joined the voice session. Greet them now.",
    },
    { label: "2. founder paragraph → analyze dispatch", text: SPARSE_TEXT },
    {
      label: "3. [ANALYSIS UPDATE] → weave + ask",
      text:
        "[ANALYSIS UPDATE — system data, weave in naturally, never read verbatim]\n" +
        "Screening done: 74 programs already eligible. Ranking runs ~30s more. Interview questions you can ask RIGHT NOW: " +
        "Roughly how much funding are you looking for? | Are you actively doing research and development? | Is the company majority US-owned?",
    },
    {
      label: "4. founder answers → answer_question refines",
      text: "We're looking for about four hundred thousand dollars, we do active R&D, and yes we're majority US-owned.",
    },
  ];
  let step = 0;

  await new Promise<void>((resolve, reject) => {
    const watchdog = setTimeout(() => reject(new Error("bench timed out at 180s")), 180_000);

    ws.addEventListener("open", () => {
      send({
        setup: {
          model: `models/${model}`,
          generationConfig: { responseModalities: ["AUDIO"] },
          outputAudioTranscription: {},
          systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
        },
      });
    });
    ws.addEventListener("error", () => reject(new Error("ws error")));
    ws.addEventListener("close", (e) => {
      if (step < script.length) reject(new Error(`closed early: ${e.reason || e.code}`));
    });
    ws.addEventListener("message", (e) => {
      void (async () => {
        const msg = JSON.parse(
          typeof e.data === "string" ? e.data : await (e.data as Blob).text(),
        );
        const now = Date.now();
        if (msg.setupComplete) {
          setupCompleteAt = now;
          sendTurn(script[step].label, script[step].text);
          return;
        }
        if (msg.toolCall?.functionCalls?.length && current) {
          const functionResponses = [];
          for (const c of msg.toolCall.functionCalls) {
            const dispatchMs = now - current.sentAt;
            const tExec = Date.now();
            let result: unknown;
            if (c.name === "analyze_company") {
              // Browser-mirror: background it, answer instantly.
              result = {
                status: "analysis_started",
                note: "Engine running in background. Updates arrive as [ANALYSIS UPDATE]; keep talking.",
              };
            } else {
              const out = await executeVoiceTool(c.name, c.args ?? {}, report.profile, report);
              result = out.result;
              if (out.report) report = out.report as UiMatchReport;
            }
            current.toolCalls.push({ name: c.name, dispatchMs, execMs: Date.now() - tExec });
            functionResponses.push({ id: c.id, name: c.name, response: { result } });
          }
          send({ toolResponse: { functionResponses } });
          return;
        }
        const sc = msg.serverContent;
        if (!sc || !current) return;
        for (const p of sc.modelTurn?.parts ?? []) {
          if (p.inlineData?.data) {
            if (current.firstAudio == null) current.firstAudio = now - current.sentAt;
            current.audioBytes += Math.floor((p.inlineData.data.length * 3) / 4);
          }
        }
        if (sc.outputTranscription?.text) {
          if (current.firstTranscript == null) current.firstTranscript = now - current.sentAt;
          current.transcript += sc.outputTranscription.text;
        }
        if (sc.turnComplete) {
          current.turnComplete = now - current.sentAt;
          step++;
          if (step < script.length) sendTurn(script[step].label, script[step].text);
          else {
            clearTimeout(watchdog);
            ws.close();
            resolve();
          }
        }
      })().catch(reject);
    });
  });

  // ---------- report ----------
  console.log(`connect → setupComplete: ${s(setupCompleteAt - t0)}\n`);
  for (const t of turns) {
    const spokenSec = t.audioBytes / 2 / 24000; // PCM16 @ 24kHz
    console.log(`── ${t.label}`);
    for (const tc of t.toolCalls)
      console.log(
        `    tool ${tc.name}: dispatched at +${s(tc.dispatchMs)}, executed in ${s(tc.execMs)}`,
      );
    console.log(
      `    first audio: ${t.firstAudio != null ? s(t.firstAudio) : "—"} | ` +
        `first transcript: ${t.firstTranscript != null ? s(t.firstTranscript) : "—"} | ` +
        `turn complete: ${t.turnComplete != null ? s(t.turnComplete) : "—"} ` +
        `(≈${spokenSec.toFixed(1)}s of speech)`,
    );
    console.log(`    said: "${t.transcript.trim().slice(0, 140)}"\n`);
  }
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
