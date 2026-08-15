"use client";

// Region: interview — the "answer to unlock" questions, one-tap quick-reply
// chips, and the freeform chat box. Lives in the guidance rail; this is the
// dropoff-sensitive surface, keep friction minimal.

import { useState } from "react";
import type { GateField, InterviewQuestion } from "@/lib/types";
import type { QuickReply } from "./shared";

export default function InterviewPanel({
  questions,
  quickReplies,
  busy,
  onAnswer,
  onSend,
}: {
  questions: InterviewQuestion[];
  quickReplies: QuickReply[];
  busy: boolean;
  onAnswer: (field: GateField, value: unknown) => void;
  onSend: (message: string) => void;
}) {
  const [chat, setChat] = useState("");
  if (questions.length === 0) return null;

  return (
    <section id="interview" className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
        Answer to unlock more
      </p>
      {questions.map((q) => (
        <QuestionCard key={q.field} q={q} disabled={busy} onAnswer={onAnswer} />
      ))}
      {quickReplies.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-neutral-500">Quick answers:</span>
          {quickReplies.map((r) => (
            <button
              key={r.label}
              disabled={busy}
              onClick={() => onSend(r.message)}
              title={r.message}
              className="rounded-full border border-blue-500/40 bg-blue-500/10 px-3 py-1 text-xs text-blue-300 hover:bg-blue-500/20 disabled:opacity-40"
            >
              {r.label}
            </button>
          ))}
        </div>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (chat.trim()) {
            onSend(chat);
            setChat("");
          }
        }}
        className="flex gap-2 pt-1"
      >
        <input
          value={chat}
          onChange={(e) => setChat(e.target.value)}
          placeholder="Or answer in your own words — one message can cover several questions…"
          className="min-w-0 flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-sm placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
        />
        <button
          disabled={busy || !chat.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </section>
  );
}

function QuestionCard({
  q,
  disabled,
  onAnswer,
}: {
  q: InterviewQuestion;
  disabled: boolean;
  onAnswer: (field: GateField, value: unknown) => void;
}) {
  const [val, setVal] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-neutral-800 bg-neutral-950 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm">{q.question}</p>
        <p className="text-xs text-neutral-500">{q.whyAsking}</p>
      </div>
      {q.answerType === "boolean" ? (
        <div className="flex gap-2">
          <button
            disabled={disabled}
            onClick={() => onAnswer(q.field, true)}
            className="rounded-md border border-green-500/50 px-3 py-1 text-sm text-green-400 hover:bg-green-500/10 disabled:opacity-40"
          >
            Yes
          </button>
          <button
            disabled={disabled}
            onClick={() => onAnswer(q.field, false)}
            className="rounded-md border border-neutral-700 px-3 py-1 text-sm text-neutral-300 hover:bg-neutral-800 disabled:opacity-40"
          >
            No
          </button>
        </div>
      ) : q.answerType === "choice" && q.choices ? (
        <div className="flex flex-wrap gap-2">
          {q.choices.map((c) => (
            <button
              key={c}
              disabled={disabled}
              onClick={() => onAnswer(q.field, c)}
              className="rounded-md border border-neutral-700 px-3 py-1 text-sm hover:bg-neutral-800 disabled:opacity-40"
            >
              {c}
            </button>
          ))}
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (val.trim()) onAnswer(q.field, val.trim());
          }}
          className="flex gap-2"
        >
          <input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            type={q.answerType === "number" ? "number" : "text"}
            className="w-32 rounded-md border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm focus:border-neutral-500 focus:outline-none"
          />
          <button
            disabled={disabled || !val.trim()}
            className="rounded-md border border-neutral-700 px-3 py-1 text-sm hover:bg-neutral-800 disabled:opacity-40"
          >
            Answer
          </button>
        </form>
      )}
    </div>
  );
}
