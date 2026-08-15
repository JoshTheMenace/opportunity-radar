"use client";

// Region: Unlock Results — the mock's tinted mk-ask card, powered by the
// real eligibility meter. One active question at a time with its rich answer
// widget (tap a state, tap an amount); the rest queue below with their
// dollar-unlock chips. Freeform chat stays as the escape hatch — one typed
// sentence can settle several fields. Absorbs the old meter+interview panels.

import { useState } from "react";
import type { EligibilityMeter, GateField, InterviewQuestion } from "@/lib/types";
import { isRequiredField } from "@/lib/engine/readiness";
import FieldWidget, { type WidgetAnswer } from "./field-widgets";
import { Badge, Icon } from "./ui";
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
    <section id="unlock" className="or-card mk-ask">
      <h4
        style={{
          margin: "0 0 8px",
          font: "600 20px/28px var(--font-headline)",
          color: "var(--color-text-deep)",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <Icon name="key" color="var(--color-primary)" aria-hidden />
        Unlock Results
      </h4>
      <p style={{ margin: "0 0 16px", font: "400 14px/20px var(--font-body)", color: "var(--color-on-surface-variant)" }}>
        {remaining > 0 ? (
          <>
            Answer below to reveal <span className="mk-num">{fmtUsd(remaining)}</span>
            {hiddenCount > 0 && (
              <>
                {" "}
                across <span className="mk-num">{hiddenCount}</span> more programs
              </>
            )}{" "}
            and firm up your eligibility.
          </>
        ) : (
          <>A few answers sharpen the ranking and your eligibility read.</>
        )}
      </p>

      {/* active question + its widget */}
      <div className="or-card" style={{ padding: 16 }}>
        <p className="text-[14px] font-semibold text-ink">
          {active.question}
          {isRequiredField(active.field) && (
            <Badge tone="caution" pill className="ml-2 align-middle">
              needed for ranking
            </Badge>
          )}
        </p>
        <p className="mb-3 mt-1 text-[12.5px] text-faint">{active.whyAsking}</p>
        <FieldWidget field={String(active.field)} disabled={busy} onPick={pick} />
      </div>

      {/* queued questions with their unlock chips */}
      {rest.length > 0 && (
        <div className="mt-3 flex flex-col gap-1.5">
          {rest.map((q) => {
            const u = unlockFor(String(q.field));
            return (
              <button
                key={String(q.field)}
                type="button"
                disabled={busy}
                onClick={() => setActiveField(String(q.field))}
                className="flex w-full items-baseline justify-between gap-2 rounded-lg bg-card px-4 py-2.5 text-left transition-colors hover:bg-surface-low disabled:opacity-50"
              >
                <span className="min-w-0 truncate text-[13px] text-muted">{q.question}</span>
                {u && (
                  <span className="mk-num shrink-0 text-[12px]" style={{ color: "var(--color-fit-strong)" }}>
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
              type="button"
              disabled={busy}
              onClick={() => onSend(r.message)}
              title={r.message}
              className="or-btn or-btn--glass or-btn--sm"
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
          className="or-field min-w-0 flex-1"
          style={{ padding: "8px 12px" }}
        />
        <button className="or-btn or-btn--filled" disabled={busy || !chat.trim()}>
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
