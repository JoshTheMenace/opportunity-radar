import type { CompanyProfile, GateField } from "@/lib/types";
import { applyAnswer, applyFreeformAnswer } from "@/lib/engine/profile";
import { ALL_GATE_FIELDS } from "@/lib/engine/meter";
import { runAnalysis, sseResponse } from "../engine-facade";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    profile?: CompanyProfile;
    field?: string;
    answer?: unknown;
    message?: string;
  } | null;
  const { profile, field, answer, message } = body ?? {};
  if (!profile?.description) {
    return Response.json({ error: "profile (with description) is required" }, { status: 400 });
  }

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
  return sseResponse((emit) => runAnalysis(updated.description, updated, emit));
}
