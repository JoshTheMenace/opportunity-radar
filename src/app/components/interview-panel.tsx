"use client";

// Region: interview — the "answer to unlock" questions, one-tap quick-reply
// chips, and the freeform chat box. Lives in the guidance rail; this is the
// dropoff-sensitive surface, keep friction minimal.

import { useState } from "react";
import type { GateField, InterviewQuestion } from "@/lib/types";
import { isRequiredField } from "@/lib/engine/readiness";
import type { QuickReply } from "./shared";

/** Small brass tag for questions ranking can't run without. */
function RequiredTag() {
  return (
    <span className="ml-2 rounded-full border border-brass/50 bg-brass/10 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-brass">
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
    <section id="interview" className="space-y-2 rounded-lg border border-hairline bg-panel p-4">
      <p className="font-mono text-[10px] font-medium tracking-[0.18em] text-faint">
        ANSWER TO UNLOCK MORE
      </p>
      {askCapitalNeed && <CapitalNeedCard disabled={busy} onSend={onSend} />}
      {questions.map((q) => (
        <QuestionCard key={q.field} q={q} disabled={busy} onAnswer={onAnswer} />
      ))}
      {quickReplies.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-faint">Quick answers:</span>
          {quickReplies.map((r) => (
            <button
              key={r.label}
              disabled={busy}
              onClick={() => onSend(r.message)}
              title={r.message}
              className="rounded-full border border-brass/40 bg-brass/10 px-3 py-1 text-xs text-brass transition-colors hover:bg-brass/20 disabled:opacity-40"
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
          className="min-w-0 flex-1 rounded-lg border border-hairline bg-ink px-3 py-2 text-sm text-paper placeholder:text-faint focus:border-brass focus:outline-none"
        />
        <button
          disabled={busy || !chat.trim()}
          className="rounded-lg bg-brass px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-brass-bright disabled:cursor-not-allowed disabled:opacity-40"
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
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-ink p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-paper">
          Roughly how much funding are you looking for?
          <RequiredTag />
        </p>
        <p className="text-xs text-faint">Needed before we can rank accurately</p>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (val.trim()) onSend(`We're looking for about ${val.trim()} in funding.`);
        }}
        className="flex gap-2"
      >
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="$500K"
          className="w-28 rounded-md border border-hairline bg-panel px-2 py-1 font-mono text-sm text-paper focus:border-brass focus:outline-none"
        />
        <button
          disabled={disabled || !val.trim()}
          className="rounded-md border border-hairline px-3 py-1 text-sm text-muted transition-colors hover:bg-panel-2 hover:text-paper disabled:opacity-40"
        >
          Answer
        </button>
      </form>
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
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-hairline bg-ink p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm text-paper">
          {q.question}
          {isRequiredField(q.field) && <RequiredTag />}
        </p>
        <p className="text-xs text-faint">{q.whyAsking}</p>
      </div>
      {q.answerType === "boolean" ? (
        <div className="flex gap-2">
          <button
            disabled={disabled}
            onClick={() => onAnswer(q.field, true)}
            className="rounded-md border border-treasury/50 px-3 py-1 text-sm text-treasury transition-colors hover:bg-treasury/10 disabled:opacity-40"
          >
            Yes
          </button>
          <button
            disabled={disabled}
            onClick={() => onAnswer(q.field, false)}
            className="rounded-md border border-hairline px-3 py-1 text-sm text-muted transition-colors hover:bg-panel-2 hover:text-paper disabled:opacity-40"
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
              className="rounded-md border border-hairline px-3 py-1 text-sm text-muted transition-colors hover:bg-panel-2 hover:text-paper disabled:opacity-40"
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
            className="w-32 rounded-md border border-hairline bg-panel px-2 py-1 font-mono text-sm text-paper focus:border-brass focus:outline-none"
          />
          <button
            disabled={disabled || !val.trim()}
            className="rounded-md border border-hairline px-3 py-1 text-sm text-muted transition-colors hover:bg-panel-2 hover:text-paper disabled:opacity-40"
          >
            Answer
          </button>
        </form>
      )}
    </div>
  );
}
