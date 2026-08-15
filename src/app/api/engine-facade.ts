// ============================================================
// UI-facing facade over the engine pipeline. Runs the real
// pipeline, enriches the report with an id -> Opportunity map,
// and owns the SSE framing (including the final report event).
// ============================================================
import type {
  AnalyzeEvent,
  CompanyProfile,
  MatchReport,
  Opportunity,
} from "@/lib/types";
import { runAnalysis as runPipeline } from "@/lib/engine/pipeline";
import { getOpportunityById } from "@/lib/engine/retrieve";

export type Emit = (e: AnalyzeEvent) => void;

/** MatchReport plus an id→Opportunity lookup so match cards can render details. */
export type UiMatchReport = MatchReport & {
  opportunities: Record<string, Opportunity>;
};

export async function runAnalysis(
  founderText: string,
  prior: Partial<CompanyProfile> | null,
  emit: Emit,
): Promise<UiMatchReport> {
  // The pipeline streams partial report events while scoring; enrich each one
  // with the id→Opportunity lookup so cards render fully as they appear.
  const enriching: Emit = (e) =>
    emit(
      e.type === "report"
        ? { type: "report", report: withOpportunities(e.report) }
        : e,
    );
  // Interactive path: hold ranking until required basics are known (the UI
  // and voice agent gather answers, then re-run). One-shot callers that use
  // the pipeline directly (eval harness) always rank.
  const report = await runPipeline(founderText, prior, enriching, { gatherFirst: true });
  return withOpportunities(report);
}

/** Attach the id→Opportunity lookup — used for the pipeline's partial report
 *  events above AND exported for reports built outside runAnalysis (the
 *  incremental refine path). */
export function withOpportunities(report: MatchReport): UiMatchReport {
  return { ...report, opportunities: lookupOpportunities(report) };
}

/** Resolve match opportunityIds to full rows so the UI can render cards. */
function lookupOpportunities(report: MatchReport): Record<string, Opportunity> {
  const map: Record<string, Opportunity> = {};
  for (const m of report.matches) {
    const opp = getOpportunityById(m.opportunityId);
    if (opp) map[m.opportunityId] = opp;
  }
  return map;
}

/** Wrap a pipeline run in an SSE Response; emits the final report event. */
export function sseResponse(run: (emit: Emit) => Promise<UiMatchReport>): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit: Emit = (e) =>
        controller.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      try {
        const report = await run(emit);
        emit({ type: "report", report });
      } catch (err) {
        console.error("engine pipeline failed:", err);
        emit({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
