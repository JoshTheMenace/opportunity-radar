import type { CompanyProfile, GateField, MatchReport } from "@/lib/types";
import { applyAnswer, applyFreeformAnswer } from "@/lib/engine/profile";
import { ALL_GATE_FIELDS } from "@/lib/engine/meter";
import { refineReport } from "@/lib/engine/refine";
import { runAnalysis, sseResponse, withOpportunities } from "../engine-facade";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    profile?: CompanyProfile;
    field?: string;
    answer?: unknown;
    message?: string;
    /** Prior report enables the incremental fast path: re-gate + subtract,
     *  reusing all previous LLM scores. No re-ranking. */
    priorReport?: MatchReport | null;
  } | null;
  const { profile, field, answer, message, priorReport } = body ?? {};
  if (!profile?.description) {
    return Response.json({ error: "profile (with description) is required" }, { status: 400 });
  }
  const canRefine = priorReport != null && Array.isArray(priorReport.matches);

  // Freeform chat answer: one message may settle several gate fields at once.
  if (typeof message === "string" && message.trim()) {
    const text = message.trim();
    return sseResponse(async (emit) => {
      emit({ type: "activity", message: "Reading your answer..." });
      const { profile: updated, answered } = await applyFreeformAnswer(profile, text);
      emit({
        type: "activity",
        message: answered.length
          ? `Recorded: ${answered.join(", ")}`
          : "No eligibility facts recognized — re-checking with what we know",
      });
      // Keep the founder's words: follow-ups accumulate into the description.
      const description = `${updated.description}\n\nFounder follow-up: ${text}`;
      if (canRefine && answered.length > 0) {
        emit({ type: "activity", message: "Re-checking eligibility (no re-ranking needed)..." });
        return withOpportunities(refineReport(priorReport, { ...updated, description }));
      }
      return runAnalysis(description, { ...updated, description }, emit);
    });
  }

  // Single-field answer (Yes/No buttons): deterministic, no parse needed.
  if (!ALL_GATE_FIELDS.includes(field as GateField)) {
    return Response.json(
      { error: "either a freeform `message` or a valid gate `field` + `answer` is required" },
      { status: 400 },
    );
  }
  const updated = applyAnswer(
    profile,
    field as GateField,
    (answer ?? "") as string | number | boolean,
  );
  if (canRefine) {
    return sseResponse(async (emit) => {
      emit({ type: "activity", message: "Re-checking eligibility (no re-ranking needed)..." });
      return withOpportunities(refineReport(priorReport, updated));
    });
  }
  return sseResponse((emit) => runAnalysis(updated.description, updated, emit));
}
