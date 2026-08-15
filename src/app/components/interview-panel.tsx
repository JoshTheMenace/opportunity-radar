"use client";

// Region: interview — the "answer to unlock" questions, one-tap quick-reply
// chips, and the freeform chat box. Lives in the guidance rail; this is the
// dropoff-sensitive surface, keep friction minimal.

import { useState } from "react";
import type { GateField, InterviewQuestion } from "@/lib/types";
import { isRequiredField } from "@/lib/engine/readiness";
import FieldWidget, { hasRichWidget } from "./field-widgets";
import type { QuickReply } from "./shared";

/** Small brand tag for questions ranking can't run without. */
function RequiredTag() {
  return (
    <span className="ml-2 rounded-full bg-soft px-2 py-0.5 align-middle font-mono text-[10px] font-semibold text-brand">
      needed for ranking
    </span>
  );
}

export default function InterviewPanel({
  questions,
  quickReplies,
  busy,
  askCapitalNeed = false,
  onAnswer,
  onSend,
}: {
  questions: InterviewQuestion[];
  quickReplies: QuickReply[];
  busy: boolean;
  /** Show the dedicated funding-amount card (readiness hold; not a GateField). */
  askCapitalNeed?: boolean;
  onAnswer: (field: GateField, value: unknown) => void;
  onSend: (message: string) => void;
}) {
  const [chat, setChat] = useState("");
  if (questions.length === 0 && !askCapitalNeed) return null;

  return (
    <section id="interview" className="space-y-2 rounded-2xl border border-hairline bg-card p-4 shadow-card">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-faint">
        Radar is asking
      </p>
      {askCapitalNeed && <CapitalNeedCard disabled={busy} onSend={onSend} />}
      {questions.map((q) => (
        <QuestionCard key={q.field} q={q} disabled={busy} onAnswer={onAnswer} />
      ))}
      {quickReplies.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="font-mono text-[11px] text-faint">Quick answers:</span>
          {quickReplies.map((r) => (
            <button
              key={r.label}
              disabled={busy}
              onClick={() => onSend(r.message)}
              title={r.message}
              className="rounded-full bg-soft px-3 py-1 font-mono text-[11px] font-semibold text-brand transition-colors hover:bg-brand hover:text-white disabled:opacity-40"
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
          className="min-w-0 flex-1 rounded-xl border border-hairline bg-[#FBFCFE] px-3 py-2 text-[13.5px] text-ink placeholder:text-faint focus:border-brand focus:outline-none"
        />
        <button
          disabled={busy || !chat.trim()}
          className="rounded-xl bg-brand px-4 py-2 font-mono text-[12.5px] font-semibold text-white transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </form>
    </section>
  );
}

/** Funding amount isn't a GateField — this card routes through the freeform
 *  parser, which knows how to settle capitalNeedUsd. */
function CapitalNeedCard({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (message: string) => void;
}) {
  const [val, setVal] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline border-l-[3px] border-l-accent bg-[#FBFCFE] p-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-ink">
          Roughly how much funding are you looking for?
          <RequiredTag />
        </p>
        <p className="mt-0.5 font-mono text-[11px] text-good">Needed before we can rank accurately</p>
      </div>
      <FieldWidget
        field="capitalNeed"
        disabled={disabled}
        onPick={(a) => onSend(`We're looking for about ${a.sayAs} in funding.`)}
      />
    </div>
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
  // Purpose-built control (map, pickers) — full-width layout.
  if (hasRichWidget(q.field)) {
    return (
      <div className="space-y-2.5 rounded-xl border border-hairline border-l-[3px] border-l-accent bg-[#FBFCFE] p-3.5">
        <div>
          <p className="text-[13.5px] font-semibold text-ink">
            {q.question}
            {isRequiredField(q.field) && <RequiredTag />}
          </p>
          <p className="mt-0.5 font-mono text-[11px] text-good">{q.whyAsking}</p>
        </div>
        <FieldWidget
          field={q.field}
          disabled={disabled}
          onPick={(a) => onAnswer(q.field, a.value)}
        />
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-xl border border-hairline border-l-[3px] border-l-accent bg-[#FBFCFE] p-3.5">
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-semibold text-ink">
          {q.question}
          {isRequiredField(q.field) && <RequiredTag />}
        </p>
        <p className="mt-0.5 font-mono text-[11px] text-good">{q.whyAsking}</p>
      </div>
      {q.answerType === "boolean" ? (
        <div className="flex gap-2">
          <button
            disabled={disabled}
            onClick={() => onAnswer(q.field, true)}
            className="rounded-xl bg-soft px-3.5 py-1.5 font-mono text-[12.5px] font-semibold text-brand transition-colors hover:bg-brand hover:text-white disabled:opacity-40"
          >
            Yes
          </button>
          <button
            disabled={disabled}
            onClick={() => onAnswer(q.field, false)}
            className="rounded-xl bg-soft px-3.5 py-1.5 font-mono text-[12.5px] font-semibold text-brand transition-colors hover:bg-brand hover:text-white disabled:opacity-40"
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
              className="rounded-xl bg-soft px-3.5 py-1.5 font-mono text-[12.5px] font-semibold text-brand transition-colors hover:bg-brand hover:text-white disabled:opacity-40"
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
            className="w-32 rounded-xl border border-hairline bg-card px-2.5 py-1.5 font-mono text-[12.5px] text-ink placeholder:text-faint focus:border-brand focus:outline-none"
          />
          <button
            disabled={disabled || !val.trim()}
            className="rounded-xl bg-soft px-3.5 py-1.5 font-mono text-[12.5px] font-semibold text-brand transition-colors hover:bg-brand hover:text-white disabled:opacity-40"
          >
            Answer
          </button>
        </form>
      )}
    </div>
  );
}
