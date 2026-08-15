"use client";

// Region: Unlock Results — the kit's locked right-rail panel, powered by the
// real eligibility meter. One active question at a time with its rich answer
// widget (tap a state, tap an amount); the rest queue below with their
// dollar-unlock chips. Freeform chat stays as the escape hatch — one typed
// sentence can settle several fields. Absorbs the old meter+interview panels.

import { useState } from "react";
import type { EligibilityMeter, GateField, InterviewQuestion } from "@/lib/types";
import { isRequiredField } from "@/lib/engine/readiness";
import FieldWidget, { type WidgetAnswer } from "./field-widgets";
import { fmtUsd, type QuickReply } from "./shared";

/** Synthetic card for the funding amount (not a GateField; freeform-backed). */
const CAPITAL_NEED_Q: InterviewQuestion = {
  field: "capitalNeed" as GateField,
  question: "Roughly how much funding are you looking for?",
  whyAsking: "Needed before we can rank accurately",
  answerType: "number",
} as unknown as InterviewQuestion;

export default function UnlockPanel({
  meter,
  questions,
  quickReplies,
  busy,
  askCapitalNeed = false,
  preliminary = false,
  onAnswer,
  onSend,
}: {
  meter: EligibilityMeter | null;
  questions: InterviewQuestion[];
  quickReplies: QuickReply[];
  busy: boolean;
  askCapitalNeed?: boolean;
  preliminary?: boolean;
  onAnswer: (field: GateField, value: unknown) => void;
  onSend: (message: string) => void;
}) {
  const [chat, setChat] = useState("");
  const [activeField, setActiveField] = useState<string | null>(null);

  const all: InterviewQuestion[] = [
    ...(askCapitalNeed ? [CAPITAL_NEED_Q] : []),
    ...questions,
  ];
  if (all.length === 0) return null;

  const active = all.find((q) => String(q.field) === activeField) ?? all[0];
  const rest = all.filter((q) => q.field !== active.field);
  const remaining = meter ? Math.max(0, meter.potentialUsd - meter.unlockedUsd) : 0;
  const hiddenCount = meter
    ? meter.unlocks.reduce((n, u) => n + u.opportunityCount, 0)
    : 0;
  const unlockFor = (field: string) => meter?.unlocks.find((u) => u.field === field);

  function pick(ans: WidgetAnswer) {
    if (ans.field === "capitalNeed") {
      onSend(`We're looking for ${ans.sayAs || `about ${ans.value}`} in funding.`);
    } else {
      onAnswer(ans.field as GateField, ans.value);
    }
    setActiveField(null);
  }

  return (
    <section
      id="unlock"
      className="card relative overflow-hidden p-6"
    >
      <h4 className="mb-1 font-display text-[18px] font-bold tracking-tight text-ink">Unlock Results</h4>
      <p className="mb-4 text-[14px] leading-relaxed text-muted">
        {remaining > 0 ? (
          <>
            Answer below to reveal{" "}
            <span className="font-mono font-semibold text-brand">{fmtUsd(remaining)}</span>
            {hiddenCount > 0 && (
              <>
                {" "}
                across <span className="font-mono font-semibold text-brand">{hiddenCount}</span>{" "}
                more programs
              </>
            )}{" "}
            and firm up your eligibility.
          </>
        ) : (
          <>A few answers sharpen the ranking and your eligibility read.</>
        )}
      </p>

      {/* active question + its widget */}
      <div className="rounded-2xl border border-accent/30 bg-soft/70 p-4">
        <p className="text-[14px] font-semibold text-ink">
          {active.question}
          {isRequiredField(active.field) && (
            <span className="ml-2 rounded-full bg-warn-soft px-2.5 py-0.5 align-middle text-[12px] font-semibold text-warn">
              needed for ranking
            </span>
          )}
        </p>
        <p className="mb-3 mt-1 text-[12.5px] text-faint">{active.whyAsking}</p>
        <FieldWidget field={String(active.field)} disabled={busy} onPick={pick} />
      </div>

      {/* queued questions with their unlock chips */}
      {rest.length > 0 && (
        <div className="mt-3 space-y-1.5">
          {rest.map((q) => {
            const u = unlockFor(String(q.field));
            return (
              <button
                key={String(q.field)}
                type="button"
                disabled={busy}
                onClick={() => setActiveField(String(q.field))}
                className="flex w-full items-baseline justify-between gap-2 rounded-xl bg-surface-low px-4 py-2.5 text-left transition-colors hover:bg-surface disabled:opacity-50"
              >
                <span className="min-w-0 truncate text-[13px] text-muted">{q.question}</span>
                {u && (
                  <span className="shrink-0 font-mono text-[12px] font-semibold text-good">
                    +{fmtUsd(u.unlockUsd)}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* quick replies from the suggest model */}
      {quickReplies.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {quickReplies.map((r) => (
            <button
              key={r.label}
              disabled={busy}
              onClick={() => onSend(r.message)}
              title={r.message}
              className="rounded-full bg-soft px-3 py-1 text-[12px] font-semibold text-brand transition-colors hover:bg-brand-fixed disabled:opacity-40"
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {/* freeform escape hatch */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (chat.trim()) {
            onSend(chat);
            setChat("");
          }
        }}
        className="mt-3 flex gap-2"
      >
        <input
          value={chat}
          onChange={(e) => setChat(e.target.value)}
          placeholder="Or answer in your own words…"
          className="min-w-0 flex-1 rounded-xl border border-line bg-card px-4 py-2.5 text-[14px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
        />
        <button
          disabled={busy || !chat.trim()}
          className="rounded-xl bg-brand px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-strong disabled:cursor-not-allowed disabled:opacity-40"
        >
          Send
        </button>
      </form>

      {preliminary && (
        <p className="mt-3 text-[12.5px] text-warn">
          Preliminary — numbers firm up once the required questions are answered.
        </p>
      )}
    </section>
  );
}
