// ============================================================
// Multi-turn founder personas for the interview harness
// (eval/run-personas.ts). Ported from Halda's persona-tests
// pattern. Each persona = an opening paragraph + scripted turns:
//   { field, answer }  -> structured button answer (applyAnswer)
//   { message }        -> freeform chat (applyFreeformAnswer)
// Kept OUT of cases.ts — that file is locked to the brief.
//
// Ordering note: majorityUsOwned is never inferred by extraction,
// so putting it LAST keeps the profile un-ready (no expensive
// ranking pass) until the final round on the real backend.
// ============================================================

import type { GateField } from "../src/lib/types";

export type Turn =
  | { field: GateField; answer: string | number | boolean }
  | {
      message: string;
      /** LLM-guarded: this message settles nothing (skipped under mock). */
      expectsNoFacts?: boolean;
      /** LLM-guarded: this message settles at least N fields (skipped under mock). */
      expectsFactCountAtLeast?: number;
    };

export interface Persona {
  id: string;
  name: string;
  strategy: string;
  initial: string;
  turns: Turn[];
  /** Values that must hold in the FINAL round's profile (explicit-wins). */
  expectFinal?: { field: GateField; value: string | number | boolean }[];
  /** Assert round 1 asks <= cap questions, all genuinely unanswered. */
  checkRound1Upfront?: boolean;
}

export const PERSONAS: readonly Persona[] = [
  {
    id: "cold-start",
    name: "Cold-start dribbler",
    strategy: "Vague opener; facts arrive one structured answer at a time. Tests question ranking on a near-empty profile.",
    initial:
      "hey - i run a small medical software startup. we might want some grant " +
      "money but honestly no idea where to start.",
    turns: [
      { field: "employees", answer: 12 },
      { field: "location", answer: "Lehi, Utah" },
      { field: "hasActiveRnD", answer: true },
    ],
  },
  {
    id: "voice-dump",
    name: "Voice-style multi-fact dump",
    strategy: "One freeform message answers several gate questions at once. Tests multi-fact freeform extraction.",
    initial:
      "We build computer-vision quality inspection systems for food processing " +
      "plants. Starting to look into government funding options.",
    turns: [
      {
        message:
          "sure, quick rundown: we're 14 people based in Provo, Utah, did about " +
          "$900K revenue last year, majority US-owned, definitely doing active " +
          "R&D, already registered in SAM.gov, and the product is in pilot with " +
          "two plants. We're after roughly $1.5M.",
        expectsFactCountAtLeast: 4,
      },
    ],
  },
  {
    id: "adversarial",
    name: "Adversarial minimalist",
    strategy: "Freeform non-answers. Tests that no-fact messages leave the profile untouched (no hallucinated facts).",
    initial: "i have a company",
    turns: [
      { message: "idk", expectsNoFacts: true },
      { message: "money", expectsNoFacts: true },
      { message: "just show me the grants", expectsNoFacts: true },
    ],
  },
  {
    id: "self-corrector",
    name: "Self-corrector",
    strategy: "Answers employees=12, later corrects to 600. The later EXPLICIT answer must win in every subsequent round.",
    initial:
      "We make industrial battery-monitoring hardware for warehouse fleets, " +
      "based in Ogden, Utah. Looking for around $2M to fund development.",
    turns: [
      { field: "employees", answer: 12 },
      { field: "employees", answer: 600 },
      { field: "hasActiveRnD", answer: true },
      { field: "majorityUsOwned", answer: true },
    ],
    expectFinal: [{ field: "employees", value: 600 }],
  },
  {
    id: "conflicting",
    name: "Conflicting constraints",
    strategy: "Consumer app founder insisting on federal grants; honest answers (no R&D) put honest-no pressure on ranking.",
    initial:
      "We're a 9-person consumer social shopping app company in Miami, Florida. " +
      "Standard mobile stack, nothing research-y. We want federal grant money - " +
      "at least $1M. Everyone gets grants, right?",
    turns: [
      { message: "seriously, just find us a federal grant, we deserve one" },
      { field: "hasActiveRnD", answer: false },
      { field: "majorityUsOwned", answer: true },
    ],
  },
  {
    id: "sbir-fail",
    name: "SBIR gate-fail (foreign-owned)",
    strategy: "R&D company that is majority foreign-owned - the SBIR ownership gate must fail and STAY failed.",
    initial:
      "We're a robotics research lab in Salt Lake City, Utah building " +
      "autonomous inspection drones for utilities. 40 employees, about $4M " +
      "revenue, seeking $1M to $3M in federal funding for continued R&D.",
    turns: [
      { field: "hasActiveRnD", answer: true },
      { field: "samRegistered", answer: false },
      { field: "majorityUsOwned", answer: false },
    ],
    expectFinal: [{ field: "majorityUsOwned", value: false }],
  },
  {
    id: "ideal-rnd",
    name: "Ideal R&D healthcare company",
    strategy: "Strong SBIR-shaped company, cooperative founder. The smooth path: rich opener, crisp structured answers.",
    initial:
      "We're a 15-person digital health company in Lehi, Utah. Our platform " +
      "uses machine learning on bedside vitals to catch early sepsis in " +
      "hospital patients. $1.2M ARR, raised $3M seed, and we're seeking $500K " +
      "to $2M in non-dilutive funding for clinical validation and R&D.",
    turns: [
      { field: "hasActiveRnD", answer: true },
      { field: "samRegistered", answer: true },
      { field: "majorityUsOwned", answer: true },
    ],
  },
  {
    id: "upfront",
    name: "Everything-upfront founder",
    strategy: "Opening paragraph already contains most gate facts - the engine should ask few or zero questions.",
    initial:
      "We're QuakeSense, an 18-person earthquake early-warning sensor company " +
      "headquartered in Provo, Utah. For-profit, majority-owned by US citizens, " +
      "actively doing R&D, registered in SAM.gov, product in pilot with two " +
      "school districts. About $1.2M revenue last year, raised $3M. Seeking " +
      "$1M to $4M in non-dilutive funding for R&D and sensor deployment.",
    turns: [{ message: "that's everything about us - what have you got?" }],
    checkRound1Upfront: true,
  },
];

export function getPersona(id: string): Persona | undefined {
  return PERSONAS.find((p) => p.id === id);
}
