// Simulated interview answers per eval case — what each brief founder would
// plausibly say when the readiness interview asks. Kept OUT of cases.ts
// (that file is locked to the brief). Facts here only fill fields the brief
// text leaves unknown; they never contradict it.

export interface CannedAnswer {
  field: string; // GateField or "capitalNeed"
  answer: string;
}

export const INTERVIEW_ANSWERS: Record<string, CannedAnswer[]> = {
  "ai-healthcare": [
    { field: "majorityUsOwned", answer: "true" },
    { field: "hasActiveRnD", answer: "true" },
  ],
  aerospace: [
    { field: "majorityUsOwned", answer: "true" },
    { field: "hasActiveRnD", answer: "true" },
  ],
  water: [
    { field: "majorityUsOwned", answer: "true" },
    { field: "hasActiveRnD", answer: "true" },
  ],
  cyber: [
    { field: "majorityUsOwned", answer: "true" },
    { field: "hasActiveRnD", answer: "true" },
  ],
  // The trap case: a consumer marketplace on standard tech — honest answers
  // make the honest-no MORE clearly correct (no R&D -> no SBIR path).
  "youth-marketplace": [
    { field: "majorityUsOwned", answer: "true" },
    { field: "hasActiveRnD", answer: "false" },
  ],
};

/** One founder-voice message carrying the same facts, for the live driver. */
export function followUpMessage(caseId: string): string | null {
  const answers = INTERVIEW_ANSWERS[caseId];
  if (!answers) return null;
  const bits = answers.map((a) => {
    if (a.field === "majorityUsOwned")
      return a.answer === "true" ? "we're majority US-owned" : "we're not majority US-owned";
    if (a.field === "hasActiveRnD")
      return a.answer === "true"
        ? "yes, we do active R&D"
        : "no, we don't really do R&D — we build on standard tech";
    return `${a.field}: ${a.answer}`;
  });
  return `To answer your questions: ${bits.join(", and ")}.`;
}
