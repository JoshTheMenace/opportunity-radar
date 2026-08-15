"use client";

// Voice mode — Gemini Live over a raw browser WebSocket (no SDK).
// Fully additive: renders nothing when /api/voice/token says disabled.
//
// Conversation shape (see schema.ts persona):
// - The AGENT speaks first: a [SESSION STARTED] turn is injected on connect.
// - analyze_company is intercepted CLIENT-SIDE: the tool returns
//   "analysis_started" immediately and the real engine run streams in the
//   background (driving the on-screen UI via onEngineEvent). Progress and
//   results are queued as [ANALYSIS UPDATE] turns, flushed between model
//   turns so the agent weaves them in naturally while it keeps interviewing.
// - answer_question is instant (incremental refine, no re-ranking). Answers
//   given while ranking is still running are buffered and applied the
//   moment the analysis lands.

import { useEffect, useRef, useState } from "react";
import type { AnalyzeEvent, CompanyProfile, MatchReport } from "@/lib/types";
import { formatUsdCompact } from "@/lib/engine/meter";
import { profileReadiness } from "@/lib/engine/readiness";
import { SYSTEM_INSTRUCTION, TOOL_DECLARATIONS } from "@/lib/voice/schema";

type Status = "off" | "idle" | "connecting" | "live";
type LogLine = { who: "you" | "radar" | "sys"; text: string };

interface FunctionCall {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
}

/** The subset of Live API server messages we react to. */
interface ServerMsg {
  setupComplete?: object;
  serverContent?: {
    interrupted?: boolean;
    turnComplete?: boolean;
    modelTurn?: { parts?: { inlineData?: { data?: string } }[] };
    inputTranscription?: { text?: string };
    outputTranscription?: { text?: string };
  };
  toolCall?: { functionCalls?: FunctionCall[] };
}

type UiReport = MatchReport & { opportunities?: Record<string, { title: string }> };

const usd = (n: number) => formatUsdCompact(n);

export default function VoicePanel({
  getProfile,
  getReport,
  onEngineEvent,
}: {
  getProfile: () => CompanyProfile | null;
  getReport: () => MatchReport | null;
  onEngineEvent: (ev: AnalyzeEvent) => void;
}) {
  const [status, setStatus] = useState<Status>("off");
  const [err, setErr] = useState<string | null>(null);
  const [log, setLog] = useState<LogLine[]>([]);

  const wsRef = useRef<WebSocket | null>(null);
  const readyRef = useRef(false); // setupComplete received
  const micRef = useRef<MediaStream | null>(null);
  const inCtxRef = useRef<AudioContext | null>(null);
  const outCtxRef = useRef<AudioContext | null>(null);
  const playheadRef = useRef(0);
  const sourcesRef = useRef<AudioBufferSourceNode[]>([]);
  const openLineRef = useRef<{ you: boolean; radar: boolean }>({ you: false, radar: false });
  // Background-analysis machinery
  const modelSpeakingRef = useRef(false);
  const updatesRef = useRef<string[]>([]);
  const analysisBusyRef = useRef(false);
  const lastProgressAtRef = useRef(0);
  const pendingAnswersRef = useRef<{ field: string; answer: string }[]>([]);

  useEffect(() => {
    void fetch("/api/voice/token")
      .then((r) => r.json())
      .then((d: { enabled?: boolean }) => setStatus(d.enabled ? "idle" : "off"))
      .catch(() => setStatus("off"));
    return stop; // teardown on unmount
  }, []);

  // ---------- transcript ----------

  function pushSys(text: string) {
    setLog((l) => [...l, { who: "sys", text }]);
  }

  /** Transcription arrives in fragments; extend the open line for that speaker. */
  function appendLine(who: "you" | "radar", text: string) {
    setLog((l) => {
      const i = l.length - 1;
      if (openLineRef.current[who] && i >= 0 && l[i].who === who)
        return [...l.slice(0, i), { who, text: l[i].text + text }];
      openLineRef.current[who] = true;
      return [...l, { who, text }];
    });
  }

  // ---------- audio out (24kHz PCM16 -> scheduled buffers) ----------

  function playChunk(b64: string) {
    const out = outCtxRef.current;
    if (!out) return;
    const bin = atob(b64);
    const n = Math.floor(bin.length / 2);
    const buf = out.createBuffer(1, n, 24000);
    const ch = buf.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
      ch[i] = (v >= 0x8000 ? v - 0x10000 : v) / 0x8000;
    }
    const src = out.createBufferSource();
    src.buffer = buf;
    src.connect(out.destination);
    const t = Math.max(out.currentTime, playheadRef.current);
    src.start(t);
    playheadRef.current = t + buf.duration;
    sourcesRef.current.push(src);
    src.onended = () => {
      sourcesRef.current = sourcesRef.current.filter((s) => s !== src);
    };
  }

  function stopPlayback() {
    for (const s of sourcesRef.current) {
      try {
        s.stop();
      } catch {}
    }
    sourcesRef.current = [];
    playheadRef.current = 0;
  }

  // ---------- audio in (mic -> 16kHz PCM16 base64) ----------

  function startCapture(stream: MediaStream) {
    const ctx = new AudioContext({ sampleRate: 16000 });
    inCtxRef.current = ctx;
    const proc = ctx.createScriptProcessor(4096, 1, 1);
    proc.onaudioprocess = (e) => {
      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN || !readyRef.current) return;
      const f32 = e.inputBuffer.getChannelData(0);
      const bytes = new Uint8Array(f32.length * 2);
      for (let i = 0; i < f32.length; i++) {
        const s = Math.max(-1, Math.min(1, f32[i])) * 0x7fff;
        bytes[2 * i] = s & 0xff;
        bytes[2 * i + 1] = (s >> 8) & 0xff;
      }
      let bin = "";
      for (let i = 0; i < bytes.length; i += 0x8000)
        bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      ws.send(
        JSON.stringify({
          realtimeInput: { audio: { data: btoa(bin), mimeType: "audio/pcm;rate=16000" } },
        }),
      );
    };
    ctx.createMediaStreamSource(stream).connect(proc);
    proc.connect(ctx.destination); // required for onaudioprocess to fire in Chrome
  }

  // ---------- update queue (flushed between model turns) ----------

  function sendText(text: string) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !readyRef.current) return false;
    ws.send(
      JSON.stringify({
        clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: true },
      }),
    );
    return true;
  }

  function queueUpdate(text: string) {
    updatesRef.current.push(text);
    flushUpdates();
  }

  function flushUpdates() {
    if (modelSpeakingRef.current || updatesRef.current.length === 0) return;
    const items = updatesRef.current.splice(0);
    const ok = sendText(
      `[ANALYSIS UPDATE — system data, weave in naturally, never read verbatim]\n${items.join("\n")}`,
    );
    if (!ok) updatesRef.current.unshift(...items); // connection not ready — requeue
  }

  // ---------- background analysis ----------

  function finalSummary(r: UiReport): string {
    const title = (id: string) => r.opportunities?.[id]?.title ?? id;
    const readiness = profileReadiness(r.profile);
    if (!readiness.ready) {
      return (
        `SCREENING DONE but ranking was SKIPPED — profile not ready (numbers would be inflated). ` +
        `Gather these, then call analyze_company again: ` +
        readiness.missing.map((m) => m.question).join(" | ")
      );
    }
    if (r.honestNo) {
      const alt = r.matches.slice(0, 3).map((m) => title(m.opportunityId));
      return (
        `ANALYSIS COMPLETE — honest answer: no strong federal match. ${r.honestNoExplanation ?? ""}` +
        (alt.length ? ` Adjacent/state options worth mentioning: ${alt.join("; ")}.` : "")
      );
    }
    const top = r.matches[0];
    const strong = r.matches.filter((m) => m.score >= 50).length;
    const remaining = r.questions
      .map((q) => `${q.question} (${q.whyAsking})`)
      .join(" | ");
    return (
      `ANALYSIS COMPLETE: ${strong} matches on screen, ${usd(r.meter.unlockedUsd)} already eligible. ` +
      (top ? `Top match: ${title(top.opportunityId)} — score ${top.score}, why: ${top.whyFit} ` : "") +
      (remaining ? `Open questions still worth asking: ${remaining}` : "No open questions remain.")
    );
  }

  async function applyPendingAnswers(report: MatchReport): Promise<MatchReport> {
    let current = report;
    for (const pa of pendingAnswersRef.current.splice(0)) {
      try {
        const res = await fetch("/api/voice/tools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "answer_question",
            args: pa,
            profile: current.profile,
            priorReport: current,
          }),
        });
        const d = (await res.json()) as { report?: MatchReport };
        if (d.report) {
          current = d.report;
          onEngineEvent({ type: "report", report: current });
        }
      } catch {}
    }
    return current;
  }

  async function startBackgroundAnalysis(description: string) {
    if (analysisBusyRef.current) return;
    analysisBusyRef.current = true;
    let finalReport: MatchReport | null = null;
    let questionsSent = false;
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ founderText: description, prior: getProfile() }),
      });
      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const chunks = buf.split("\n\n");
        buf = chunks.pop() ?? "";
        for (const chunk of chunks) {
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const ev = JSON.parse(line.slice(6)) as AnalyzeEvent;
          onEngineEvent(ev); // keep the on-screen UI live
          if (ev.type === "questions" && !questionsSent) {
            questionsSent = true;
            const qs = ev.questions.map((q) => `${q.question} (${q.whyAsking})`).join(" | ");
            queueUpdate(
              `Screening done: ${ev.meter.unlockedCount} programs already eligible (${usd(ev.meter.unlockedUsd)}). ` +
                `Ranking runs ~30s more. ` +
                (qs
                  ? `Interview questions you can ask RIGHT NOW while we wait: ${qs}`
                  : `No open questions — make small talk about their plans until results land.`),
            );
          } else if (ev.type === "activity") {
            const m = ev.message.match(/Scored (\d+)\/(\d+) candidates — (\d+) matches/);
            if (m && Date.now() - lastProgressAtRef.current > 9000) {
              lastProgressAtRef.current = Date.now();
              queueUpdate(`progress: ${m[3]} matches found so far (${m[1]}/${m[2]} scored)`);
            }
          } else if (ev.type === "report") {
            finalReport = ev.report;
          } else if (ev.type === "error") {
            queueUpdate(`Analysis FAILED (${ev.message}). Apologize briefly and offer to retry.`);
          }
        }
      }
      if (finalReport) {
        const after = await applyPendingAnswers(finalReport);
        queueUpdate(finalSummary(after as UiReport));
      }
    } catch (e) {
      queueUpdate(
        `Analysis failed (${e instanceof Error ? e.message : String(e)}). Apologize and offer to retry.`,
      );
    } finally {
      analysisBusyRef.current = false;
    }
  }

  // ---------- tool calls ----------

  async function handleToolCalls(calls: FunctionCall[]) {
    const functionResponses = [];
    for (const c of calls) {
      // analyze_company: fire-and-return — the engine streams in the background.
      if (c.name === "analyze_company") {
        const description = String(c.args?.description ?? "").trim();
        pushSys("⚙ analyze_company → background");
        if (description) void startBackgroundAnalysis(description);
        functionResponses.push({
          id: c.id,
          name: c.name,
          response: {
            result: description
              ? {
                  status: "analysis_started",
                  note: "Engine running in background. First [ANALYSIS UPDATE] (with interview questions) arrives in seconds — keep the conversation going.",
                }
              : { error: "description is required" },
          },
        });
        continue;
      }
      // answer_question mid-analysis: buffer it; applied the moment results land.
      if (c.name === "answer_question" && analysisBusyRef.current && !getReport()) {
        pushSys(`⚙ ${c.name} → buffered`);
        pendingAnswersRef.current.push({
          field: String(c.args?.field ?? ""),
          answer: String(c.args?.answer ?? ""),
        });
        functionResponses.push({
          id: c.id,
          name: c.name,
          response: {
            result: {
              status: "recorded",
              note: "Answer saved — it will be applied instantly when the running analysis lands. Keep going.",
            },
          },
        });
        continue;
      }
      pushSys(`⚙ ${c.name}`);
      let data: { result?: unknown; report?: MatchReport };
      try {
        const res = await fetch("/api/voice/tools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: c.name,
            args: c.args ?? {},
            profile: getProfile(),
            priorReport: getReport(),
          }),
        });
        data = await res.json();
      } catch (e) {
        data = { result: { error: e instanceof Error ? e.message : String(e) } };
      }
      if (data.report) onEngineEvent({ type: "report", report: data.report });
      functionResponses.push({
        id: c.id,
        name: c.name,
        response: { result: data.result ?? { error: "no result" } },
      });
    }
    wsRef.current?.send(JSON.stringify({ toolResponse: { functionResponses } }));
  }

  // ---------- session ----------

  function handleMsg(msg: ServerMsg) {
    if (msg.setupComplete) {
      readyRef.current = true;
      setStatus("live");
      pushSys("connected — Radar speaks first");
      // The agent greets first: hand it an opening turn.
      sendText("[SESSION STARTED] The founder just joined the voice session. Greet them now.");
    }
    const sc = msg.serverContent;
    if (sc) {
      if (sc.interrupted) {
        stopPlayback();
        modelSpeakingRef.current = false;
      }
      if (sc.modelTurn?.parts?.length) modelSpeakingRef.current = true;
      for (const p of sc.modelTurn?.parts ?? []) {
        if (p.inlineData?.data) playChunk(p.inlineData.data);
      }
      if (sc.inputTranscription?.text) appendLine("you", sc.inputTranscription.text);
      if (sc.outputTranscription?.text) appendLine("radar", sc.outputTranscription.text);
      if (sc.turnComplete) {
        openLineRef.current = { you: false, radar: false };
        modelSpeakingRef.current = false;
        flushUpdates(); // natural seam: model finished a turn
      }
    }
    if (msg.toolCall?.functionCalls?.length) void handleToolCalls(msg.toolCall.functionCalls);
  }

  async function start() {
    setErr(null);
    setLog([]);
    setStatus("connecting");
    updatesRef.current = [];
    pendingAnswersRef.current = [];
    try {
      const res = await fetch("/api/voice/token", { method: "POST" });
      const session = (await res.json()) as { wsUrl?: string; model?: string; error?: string };
      if (!res.ok || !session.wsUrl) throw new Error(session.error ?? `HTTP ${res.status}`);

      micRef.current = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      });
      outCtxRef.current = new AudioContext({ sampleRate: 24000 });

      const ws = new WebSocket(session.wsUrl);
      wsRef.current = ws;
      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            setup: {
              model: `models/${session.model}`,
              generationConfig: { responseModalities: ["AUDIO"] },
              systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
              tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
              inputAudioTranscription: {},
              outputAudioTranscription: {},
            },
          }),
        );
        startCapture(micRef.current!);
      };
      ws.onmessage = async (e) => {
        const text = typeof e.data === "string" ? e.data : await (e.data as Blob).text();
        handleMsg(JSON.parse(text) as ServerMsg);
      };
      ws.onerror = () => setErr("voice connection error");
      ws.onclose = (e) => {
        if (wsRef.current === ws) {
          if (!e.wasClean && e.reason) setErr(`connection closed: ${e.reason}`);
          stop();
        }
      };
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
      stop();
    }
  }

  function stop() {
    readyRef.current = false;
    modelSpeakingRef.current = false;
    const ws = wsRef.current;
    wsRef.current = null;
    ws?.close();
    micRef.current?.getTracks().forEach((t) => t.stop());
    micRef.current = null;
    stopPlayback();
    void inCtxRef.current?.close().catch(() => {});
    void outCtxRef.current?.close().catch(() => {});
    inCtxRef.current = outCtxRef.current = null;
    setStatus((s) => (s === "off" ? "off" : "idle"));
  }

  if (status === "off") return null;

  const busy = status === "connecting" || status === "live";
  return (
    <section className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={busy ? stop : () => void start()}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${
            busy
              ? "border border-red-500/50 text-red-400 hover:bg-red-500/10"
              : "border border-neutral-700 hover:bg-neutral-800"
          }`}
        >
          {status === "live" ? "■ End voice" : status === "connecting" ? "Connecting…" : "🎤 Voice mode"}
        </button>
        {status === "live" && (
          <span className="flex items-center gap-1.5 text-xs text-green-400">
            <span className="h-2 w-2 animate-pulse rounded-full bg-green-400" />
            live — Radar will greet you
          </span>
        )}
        {err && <span className="text-xs text-red-400">{err}</span>}
      </div>
      {log.length > 0 && (
        <div className="max-h-40 space-y-1 overflow-y-auto border-t border-neutral-800 pt-2 text-xs">
          {log.map((line, i) => (
            <p
              key={i}
              className={
                line.who === "you"
                  ? "text-neutral-300"
                  : line.who === "radar"
                    ? "text-blue-300"
                    : "font-mono text-neutral-500"
              }
            >
              {line.who === "you" ? "You: " : line.who === "radar" ? "Radar: " : ""}
              {line.text}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
