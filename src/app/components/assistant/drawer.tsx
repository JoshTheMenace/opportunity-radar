"use client";

// The Assistant drawer + FAB — the mock's screen-assistant-drawer, live.
// A 384px panel that slides OVER the page (never reflows it), holding the
// page-aware chat. The FAB is the only entry point and hides while open.

import { useEffect, useRef, useState } from "react";
import { ChatComposer, Icon, IconButton } from "../ui";
import { useAssistant } from "./context";

/** Page-aware starter questions, shown until the founder says something. */
function suggestionsFor(page: string | undefined): string[] {
  switch (page) {
    case "opportunity":
      return [
        "Am I actually eligible for this one?",
        "What should I verify before applying?",
        "What's the first step to apply?",
      ];
    case "pursuits":
      return [
        "What should I work on first?",
        "Explain this requirement in plain words",
        "What happens if I miss the deadline?",
      ];
    case "utah":
      return [
        "Who in Utah can help me apply?",
        "Which Utah program fits me best?",
        "How do these winners compare to me?",
      ];
    case "screening":
      return [
        "What's still blocking my eligibility?",
        "Which answer unlocks the most money?",
        "Why can't some of this be settled?",
      ];
    case "profile":
      return [
        "What's still missing from my profile?",
        "Why do you need to know my ownership?",
        "What did you infer vs. what did I say?",
      ];
    default:
      return [
        "What's my strongest match right now?",
        "What's still blocking my eligibility?",
        "Explain SBIR in plain words",
      ];
  }
}

export default function AssistantDrawer() {
  const { open, setOpen, thread, busy, ask, pageContext, voice } = useAssistant();
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Keep the newest turn in view.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [thread, busy, open]);

  // Escape closes, matching every other dismissible surface.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  function send() {
    if (!draft.trim() || busy) return;
    ask(draft);
    setDraft("");
  }

  return (
    <>
      <aside className="mk-drawer" data-open={open} aria-label="Assistant" aria-hidden={!open}>
        {/* header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px",
            borderBottom: "1px solid var(--color-border-ice)",
          }}
        >
          <h2 style={{ margin: 0, font: "600 24px/32px var(--font-headline)", color: "var(--color-text-deep)" }}>
            Assistant
          </h2>
          <IconButton icon="close" dense aria-label="Close assistant" onClick={() => setOpen(false)} />
        </div>

        {/* thread */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          {pageContext && (
            <p className="mk-label" style={{ margin: 0, display: "flex", alignItems: "center", gap: 6 }}>
              <Icon name="visibility" size={14} /> SEEING: {pageContext.title.toUpperCase()}
            </p>
          )}

          {thread.map((m, i) =>
            m.role === "user" ? (
              <div
                key={i}
                style={{
                  alignSelf: "flex-end",
                  maxWidth: "85%",
                  background: "var(--color-primary-fixed)",
                  color: "var(--color-on-primary-fixed)",
                  borderRadius: "var(--radius-lg)",
                  padding: "8px 12px",
                  font: "400 14px/20px var(--font-body)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.text}
              </div>
            ) : (
              <div
                key={i}
                style={{
                  alignSelf: "flex-start",
                  maxWidth: "95%",
                  font: "400 14px/21px var(--font-body)",
                  color: "var(--color-on-surface)",
                  whiteSpace: "pre-wrap",
                }}
              >
                {m.text}
              </div>
            ),
          )}

          {busy && (
            <div
              className="shimmer"
              style={{
                alignSelf: "flex-start",
                width: 120,
                height: 18,
                borderRadius: "var(--radius-default)",
                background: "var(--color-surface-container)",
              }}
              aria-label="Assistant is thinking"
            />
          )}

          {/* empty-state greeting + page-aware suggestions */}
          {thread.length === 0 && !busy && (
            <div style={{ marginTop: "auto" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <h3 style={{ margin: 0, font: "500 18px/28px var(--font-body)", color: "var(--color-text-deep)" }}>
                  How can I help?
                </h3>
                <Icon name="auto_awesome" size={20} color="var(--color-primary)" />
              </div>
              <p className="mk-label" style={{ margin: "0 0 8px" }}>
                SUGGESTIONS
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {suggestionsFor(pageContext?.page).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      width: "100%",
                      textAlign: "left",
                      padding: 8,
                      border: 0,
                      background: "none",
                      cursor: "pointer",
                      borderRadius: "var(--radius-default)",
                      font: "400 14px/20px var(--font-body)",
                      color: "var(--color-text-deep)",
                    }}
                  >
                    <Icon name="arrow_forward" size={18} color="var(--color-outline)" />
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* composer (voice lives here too: mic icon + live field widget) */}
        <div
          style={{
            padding: 16,
            borderTop: "1px solid var(--color-border-ice)",
            background: "var(--color-background)",
          }}
        >
          {voice?.extra}
          {voice && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <IconButton
                icon={voice.status === "live" ? "stop_circle" : "mic"}
                aria-label={voice.status === "live" ? "Stop voice" : "Talk to Radar"}
                title={voice.status === "live" ? "Stop voice" : "Talk to Radar"}
                onClick={voice.status === "idle" ? voice.start : voice.stop}
              />
              {voice.status !== "idle" && (
                <span
                  className={voice.status === "connecting" ? "mk-label animate-pulse" : "mk-label"}
                  style={voice.status === "live" ? { color: "var(--color-fit-strong)" } : undefined}
                >
                  {voice.status === "live" ? "● Live — just talk" : "Connecting…"}
                </span>
              )}
            </div>
          )}
          <ChatComposer
            value={draft}
            onChange={setDraft}
            onSend={send}
            model="Radar engine"
            placeholder="Ask about anything on this page…"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
        </div>
      </aside>

      {!open && (
        <button type="button" className="or-btn or-btn--filled or-btn--pill mk-fab" onClick={() => setOpen(true)}>
          <Icon name="auto_awesome" size={18} />
          Assistant
        </button>
      )}
    </>
  );
}
