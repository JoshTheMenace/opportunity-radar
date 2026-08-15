"use client";

// Voice mode — Gemini Live over a raw browser WebSocket (no SDK).
// Fully additive: renders nothing when /api/voice/token says disabled,
// so the text app never depends on it. Mic audio goes up as 16kHz PCM16,
// replies come back as 24kHz PCM16; tool calls are executed by
// /api/voice/tools and full reports are bubbled up to the page UI.

import { useEffect, useRef, useState } from "react";
import type { CompanyProfile } from "@/lib/types";
import type { UiMatchReport } from "@/app/api/engine-facade";
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

export default function VoicePanel({
  getProfile,
  onReport,
}: {
  getProfile: () => CompanyProfile | null;
  onReport: (report: UiMatchReport) => void;
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

  // ---------- tool calls -> /api/voice/tools ----------

  async function handleToolCalls(calls: FunctionCall[]) {
    pushSys(`⚙ ${calls.map((c) => c.name).join(", ")}`);
    const functionResponses = [];
    for (const c of calls) {
      let data: { result?: unknown; report?: UiMatchReport };
      try {
        const res = await fetch("/api/voice/tools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: c.name, args: c.args ?? {}, profile: getProfile() }),
        });
        data = await res.json();
      } catch (e) {
        data = { result: { error: e instanceof Error ? e.message : String(e) } };
      }
      if (data.report) onReport(data.report);
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
      pushSys("listening — just talk");
    }
    const sc = msg.serverContent;
    if (sc) {
      if (sc.interrupted) stopPlayback();
      for (const p of sc.modelTurn?.parts ?? []) {
        if (p.inlineData?.data) playChunk(p.inlineData.data);
      }
      if (sc.inputTranscription?.text) appendLine("you", sc.inputTranscription.text);
      if (sc.outputTranscription?.text) appendLine("radar", sc.outputTranscription.text);
      if (sc.turnComplete) openLineRef.current = { you: false, radar: false };
    }
    if (msg.toolCall?.functionCalls?.length) void handleToolCalls(msg.toolCall.functionCalls);
  }

  async function start() {
    setErr(null);
    setLog([]);
    setStatus("connecting");
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
            live — talk to Opportunity Radar
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
