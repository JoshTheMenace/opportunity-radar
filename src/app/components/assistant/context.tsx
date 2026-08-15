"use client";

// Assistant context — the app-wide sidebar agent's shared state. Pages
// register what they're showing (usePageAssistantContext); the drawer reads
// it, so "what's the cost share on this one?" is answered about the page the
// founder is actually looking at. The last analysis (profile + top matches)
// rides along from sessionStorage so the assistant knows the company on
// every page, not just the Opportunity Map.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export interface AssistantMsg {
  role: "user" | "assistant";
  text: string;
}

/** Serializable description of what the current page shows. */
export interface PageContext {
  page: string;
  title: string;
  data?: unknown;
}

interface AssistantApi {
  open: boolean;
  setOpen: (open: boolean) => void;
  thread: AssistantMsg[];
  busy: boolean;
  /** Ask the assistant a question (page + profile context attach themselves). */
  ask: (question: string) => void;
  /** Append a message without calling the LLM. */
  post: (msg: AssistantMsg) => void;
  /** Open the drawer, show `userText` as the founder's turn, run `worker`
   *  for the reply — how "Help me" buttons pipe task guidance in. */
  runTask: (userText: string, worker: () => Promise<string>) => void;
  pageContext: PageContext | null;
  setPageContext: (ctx: PageContext | null) => void;
}

const Ctx = createContext<AssistantApi | null>(null);

/** Trim the stored report to what the assistant needs — never ship the
 *  whole opportunity map over the wire on every question. */
function compactReport(r: unknown): unknown {
  if (!r || typeof r !== "object") return null;
  const rep = r as {
    profile?: unknown;
    honestNo?: boolean;
    matches?: { opportunityId: string; score: number; tier: string }[];
    opportunities?: Record<
      string,
      { title?: string; agency?: string; closeDate?: string | null; awardCeilingUsd?: number | null; url?: string | null }
    >;
  };
  const opps = rep.opportunities ?? {};
  return {
    profile: rep.profile ?? null,
    honestNo: rep.honestNo ?? false,
    topMatches: (rep.matches ?? []).slice(0, 10).map((m) => {
      const o = opps[m.opportunityId] ?? {};
      return {
        id: m.opportunityId,
        title: o.title,
        agency: o.agency,
        score: m.score,
        tier: m.tier,
        closeDate: o.closeDate ?? null,
        awardCeilingUsd: o.awardCeilingUsd ?? null,
      };
    }),
  };
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [thread, setThread] = useState<AssistantMsg[]>([]);
  const [busy, setBusy] = useState(false);
  const [pageContext, setPageContext] = useState<PageContext | null>(null);
  const threadRef = useRef(thread);
  threadRef.current = thread;
  const pageRef = useRef(pageContext);
  pageRef.current = pageContext;

  const post = useCallback((msg: AssistantMsg) => setThread((t) => [...t, msg]), []);

  const ask = useCallback(
    (question: string) => {
      const q = question.trim();
      if (!q) return;
      setThread((t) => [...t, { role: "user", text: q }]);
      setBusy(true);
      let report: unknown = null;
      try {
        report = compactReport(JSON.parse(sessionStorage.getItem("or:lastReport") ?? "null"));
      } catch {
        // no stored report — the assistant just knows less
      }
      void fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          thread: threadRef.current.slice(-8),
          pageContext: pageRef.current,
          report,
        }),
      })
        .then((r) => r.json())
        .then((d: { answer?: string; error?: string }) =>
          post({
            role: "assistant",
            text: d.answer ?? d.error ?? "Something went wrong — try again.",
          }),
        )
        .catch(() =>
          post({ role: "assistant", text: "I couldn't reach the engine — try again." }),
        )
        .finally(() => setBusy(false));
    },
    [post],
  );

  const runTask = useCallback(
    (userText: string, worker: () => Promise<string>) => {
      setOpen(true);
      setThread((t) => [...t, { role: "user", text: userText }]);
      setBusy(true);
      void worker()
        .then((answer) => post({ role: "assistant", text: answer }))
        .catch(() => post({ role: "assistant", text: "That didn't work — try again." }))
        .finally(() => setBusy(false));
    },
    [post],
  );

  const api = useMemo(
    () => ({ open, setOpen, thread, busy, ask, post, runTask, pageContext, setPageContext }),
    [open, thread, busy, ask, post, runTask, pageContext],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAssistant(): AssistantApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useAssistant must be used inside AssistantProvider");
  return api;
}

/** Register the current page's content with the assistant for as long as the
 *  calling component is mounted. Pass stable, JSON-serializable data. */
export function usePageAssistantContext(ctx: PageContext | null) {
  const { setPageContext } = useAssistant();
  const key = JSON.stringify(ctx);
  useEffect(() => {
    setPageContext(key ? (JSON.parse(key) as PageContext | null) : null);
    return () => setPageContext(null);
  }, [key, setPageContext]);
}
