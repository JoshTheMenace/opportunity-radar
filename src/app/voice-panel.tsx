"use client";

// Voice mode — Gemini Live over a raw browser WebSocket (no SDK).
// Fully additive: renders nothing when /api/voice/token says disabled.
//
// Conversation shape (see schema.ts persona):
// - The AGENT speaks first: a [SESSION STARTED] turn is injected on connect.
// - analyze_company is intercepted CLIENT-SIDE: the tool returns
//   "analysis_started" immediately and the real engine run streams in the
//   background (driving the on-screen UI via onEngineEvent). Interim state
//   (screening done + askable questions) is appended as SILENT context
//   (clientContent turnComplete:false — no model turn); only the final
//   summary/error triggers ONE spoken turn. Both wait for a quiet seam,
//   because any clientContent interrupts in-flight generation.
// - answer_question is instant (incremental refine, no re-ranking). Answers
//   given while ranking is still running are buffered and applied the
//   moment the analysis lands.

import { useEffect, useRef, useState } from "react";
import type { AnalyzeEvent, CompanyProfile, MatchReport } from "@/lib/types";
import { formatUsdCompact } from "@/lib/engine/meter";
import { profileReadiness } from "@/lib/engine/readiness";
import { SYSTEM_INSTRUCTION, TOOL_DECLARATIONS } from "@/lib/voice/schema";
import FieldWidget, { type WidgetAnswer } from "./components/field-widgets";

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

/** On-screen phrasing for the widget stage, per askable field. */
const WIDGET_QUESTIONS: Record<string, string> = {
  location: "Where are you based? Tap your state",
  capitalNeed: "How much funding are you looking for?",
  employees: "How big is the team?",
  productMaturity: "Where is the product today?",
  annualRevenueUsd: "Roughly what's your annual revenue?",
  majorityUsOwned: "Majority US-owned?",
  hasActiveRnD: "Actively doing R&D?",
  isForProfit: "For-profit company?",
  isSmallBusiness: "Small business (SBA rules)?",
  samRegistered: "Registered in SAM.gov?",
};

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
  /** Widget the agent pushed on screen via ask_with_widget (one at a time). */
  const [stage, setStage] = useState<{ field: string; question: string } | null>(null);

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
  const updatesRef = useRef<{ text: string; speak: boolean }[]>([]);
  const analysisBusyRef = useRef(false);
  const lastUserInputAtRef = useRef(0);
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  /** Transcription arrives in fragments; extend the open line for that
   *  speaker. Fragments often omit the space at chunk boundaries ("looks
   *  likeyour strongest") — glue with a space unless one side already has
   *  whitespace or the fragment opens with punctuation. */
  function appendLine(who: "you" | "radar", text: string) {
    setLog((l) => {
      const i = l.length - 1;
      if (openLineRef.current[who] && i >= 0 && l[i].who === who) {
        const prev = l[i].text;
        const glue =
          prev && !/\s$/.test(prev) && !/^[\s.,!?;:%)\]'"’”—-]/.test(text) ? " " : "";
        return [...l.slice(0, i), { who, text: prev + glue + text }];
      }
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

  // ---------- update delivery: silent context vs. spoken turns ----------
  //
  // Live API semantics (verified against the docs):
  // - clientContent with turnComplete:false is appended to the conversation
  //   WITHOUT starting generation — silent context the model uses at its
  //   next natural turn. With turnComplete:true it forces a model turn.
  // - EITHER kind "will interrupt any current model generation", so all
  //   updates go through the seam-guarded queue below, never directly.

  function sendContent(text: string, speak: boolean) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !readyRef.current) return false;
    ws.send(
      JSON.stringify({
        clientContent: { turns: [{ role: "user", parts: [{ text }] }], turnComplete: speak },
      }),
    );
    return true;
  }

  /** speak:false (default) = silent context; speak:true = one spoken turn. */
  function queueUpdate(text: string, opts: { speak?: boolean } = {}) {
    updatesRef.current.push({ text, speak: opts.speak ?? false });
    flushUpdates();
  }

  /** Deliver queued updates at a quiet seam — model idle AND the founder not
   *  mid-utterance. Silent items merge into one context-only append. A spoken
   *  item (final summary / error) supersedes everything queued before it and
   *  triggers exactly ONE model turn — this is what stops the old behavior of
   *  the agent monologuing after every background event. */
  function flushUpdates() {
    if (updatesRef.current.length === 0 || flushTimerRef.current) return;
    flushTimerRef.current = setTimeout(() => {
      flushTimerRef.current = null;
      if (updatesRef.current.length === 0) return;
      const quiet =
        !modelSpeakingRef.current && Date.now() - lastUserInputAtRef.current > 1500;
      if (!quiet) {
        flushUpdates(); // try again at the next seam
        return;
      }
      const items = updatesRef.current.splice(0);
      const spoken = [...items].reverse().find((u) => u.speak);
      const ok = spoken
        ? sendContent(
            // Pre-bracketed items (e.g. on-screen answer acks) carry their own
            // framing; bare items get the analysis-results framing.
            spoken.text.startsWith("[")
              ? spoken.text
              : `[ANALYSIS UPDATE — system data, not the founder speaking. Tell the founder these results now in ONE short conversational turn (top match + one number), then ask one question. Never say this bracketed note aloud, and never announce these same results again in later turns.]\n${spoken.text}`,
            true,
          )
        : sendContent(
            `[BACKGROUND CONTEXT — system data, not the founder speaking. Silent knowledge for you: use it when it helps the conversation. Never read it aloud as an announcement and never mention this note.]\n${items.map((u) => u.text).join("\n")}`,
            false,
          );
      if (!ok) updatesRef.current.unshift(...items); // connection not ready — requeue
    }, 700);
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
            // Silent context: the agent learns the questions and weaves them
            // into its NEXT natural reply — no forced announcement.
            queueUpdate(
              `Screening done: ${ev.meter.unlockedCount} programs already eligible (${usd(ev.meter.unlockedUsd)}). ` +
                `Ranking runs ~30-60s more; final results will arrive separately. ` +
                (qs
                  ? `Eligibility questions worth asking while you wait: ${qs}`
                  : `No open questions — keep the conversation on their plans until results land.`),
            );
          } else if (ev.type === "report") {
            finalReport = ev.report;
          } else if (ev.type === "error") {
            queueUpdate(`Analysis FAILED (${ev.message}). Apologize briefly and offer to retry.`, {
              speak: true,
            });
          }
        }
      }
      if (finalReport) {
        const after = await applyPendingAnswers(finalReport);
        queueUpdate(finalSummary(after as UiReport), { speak: true });
      }
    } catch (e) {
      queueUpdate(
        `Analysis failed (${e instanceof Error ? e.message : String(e)}). Apologize and offer to retry.`,
        { speak: true },
      );
    } finally {
      analysisBusyRef.current = false;
    }
  }

  // ---------- on-screen widget answers (ask_with_widget) ----------

  async function submitWidgetAnswer(ans: WidgetAnswer) {
    setStage(null);
    pushSys(`⊞ tapped: ${ans.field} = ${ans.sayAs}`);
    // Same routing as a spoken answer: buffer while ranking has no report yet,
    // otherwise instant refine via the tools route.
    if (analysisBusyRef.current && !getReport()) {
      pendingAnswersRef.current.push({ field: ans.field, answer: String(ans.value) });
    } else {
      try {
        const res = await fetch("/api/voice/tools", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: "answer_question",
            args: { field: ans.field, answer: String(ans.value) },
            profile: getProfile(),
            priorReport: getReport(),
          }),
        });
        const d = (await res.json()) as { report?: MatchReport };
        if (d.report) onEngineEvent({ type: "report", report: d.report });
      } catch {}
    }
    // One short spoken acknowledgment at the next quiet seam (pre-bracketed
    // so flushUpdates doesn't wrap it in results framing).
    queueUpdate(
      `[FOUNDER ANSWERED ON SCREEN — system data, never say this note aloud. They tapped: ${ans.field} = ${ans.sayAs}. It is ALREADY recorded. Acknowledge in a few words and continue the conversation; do not re-ask it or call answer_question for it.]`,
      { speak: true },
    );
  }

  // ---------- tool calls ----------

  async function handleToolCalls(calls: FunctionCall[]) {
    const functionResponses = [];
    for (const c of calls) {
      // ask_with_widget: render the tap-to-answer control locally.
      if (c.name === "ask_with_widget") {
        const field = String(c.args?.field ?? "");
        if (field) {
          setStage({ field, question: WIDGET_QUESTIONS[field] ?? "Tap to answer" });
          pushSys(`⊞ widget: ${field}`);
        }
        functionResponses.push({
          id: c.id,
          name: c.name,
          response: {
            result: field
              ? {
                  status: "widget_shown",
                  note: "On screen. The founder may tap it (you'll get [FOUNDER ANSWERED ON SCREEN]) or answer aloud — handle either.",
                }
              : { error: "field is required" },
          },
        });
        continue;
      }
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
      // Answered aloud — retire any widget waiting on the same field.
      if (c.name === "answer_question") {
        setStage((s) => (s && s.field === String(c.args?.field ?? "") ? null : s));
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
      // The agent greets first: hand it an opening turn (model is idle at
      // setup, so a direct triggered send is safe here).
      sendContent("[SESSION STARTED] The founder just joined the voice session. Greet them now.", true);
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
      if (sc.inputTranscription?.text) {
        lastUserInputAtRef.current = Date.now(); // founder has the floor — hold updates
        appendLine("you", sc.inputTranscription.text);
      }
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
    setStage(null);
    if (flushTimerRef.current) {
      clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    updatesRef.current = [];
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
    <section className="space-y-2 rounded-lg border border-hairline bg-panel p-3">
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={busy ? stop : () => void start()}
          className={`rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
            busy
              ? "border border-signal/50 text-signal hover:bg-signal/10"
              : "border border-hairline text-muted hover:bg-panel-2 hover:text-paper"
          }`}
        >
          {status === "live" ? "■ End voice" : status === "connecting" ? "Connecting…" : "🎤 Voice mode"}
        </button>
        {status === "live" && (
          <span className="flex items-center gap-1.5 text-xs text-treasury">
            <span className="h-2 w-2 animate-pulse rounded-full bg-treasury" />
            live — Radar will greet you
          </span>
        )}
        {err && <span className="text-xs text-signal">{err}</span>}
      </div>
      {stage && status === "live" && (
        <div className="card-in space-y-2 rounded-lg border border-brass/50 bg-brass/5 p-3">
          <p className="font-mono text-[10px] font-medium tracking-[0.18em] text-brass">
            RADAR IS ASKING — TAP OR JUST SAY IT
          </p>
          <p className="text-sm text-paper">{stage.question}</p>
          <FieldWidget field={stage.field} onPick={(a) => void submitWidgetAnswer(a)} />
        </div>
      )}
      {log.length > 0 && (
        <div className="max-h-40 space-y-1 overflow-y-auto border-t border-hairline pt-2 text-xs">
          {log.map((line, i) => (
            <p
              key={i}
              className={
                line.who === "you"
                  ? "text-paper/85"
                  : line.who === "radar"
                    ? "text-brass"
                    : "font-mono text-faint"
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
