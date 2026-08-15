// ============================================================
// Submission-plan generation for a pursuit. Two layers:
//   1. Deterministic scaffold — registrations and the submission
//      buffer every application needs; dates from code, not LLM.
//   2. LLM enrichment — opportunity-specific tasks (narrative
//      sections, eligibility checks, budget, attachments) via the
//      shared llm.ts interface; falls back to a generic plan.
// The LLM proposes day offsets; code turns them into real dates
// clamped inside the window. It never invents amounts/deadlines.
// ============================================================

import { completeJSON } from "../llm";
import { localIsoDate } from "../engine/dates";
import type { CompanyProfile, Opportunity } from "../types";
import type { NewTask } from "./db";
import { PLAIN_LANGUAGE_RULE } from "../engine/plain-language";

/** Canonical phase order for display + sorting. */
export const PHASES = [
  "Registrations",
  "Eligibility",
  "Narrative",
  "Budget & documents",
  "Review",
  "Submission",
  "After submission",
] as const;

export interface GeneratedPlan {
  summary: string;
  tasks: NewTask[];
}

// ---------- date helpers ----------

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}

// ---------- deterministic scaffold ----------

function scaffoldTasks(
  opp: Opportunity,
  profile: CompanyProfile,
  today: string,
  submitBy: string | null,
): NewTask[] {
  const tasks: NewTask[] = [];
  const federal = opp.source === "grants_gov" || opp.source === "assistance_listing";

  if (profile.samRegistered !== true && (federal || opp.kind === "sbir_sttr")) {
    tasks.push({
      phase: "Registrations",
      title: "Register at SAM.gov and get a UEI",
      detail:
        "Federal awards require an active SAM.gov registration (free). Processing takes 2–4 weeks — start immediately. You'll receive a Unique Entity ID (UEI) used on every federal form.",
      dueDate: addDays(today, 3),
      kind: "registration",
    });
  }
  if (federal) {
    tasks.push({
      phase: "Registrations",
      title: "Create a Grants.gov account and workspace",
      detail:
        "Register your organization on Grants.gov (needs your UEI), add authorized users, and open a Workspace for this opportunity so you can see the exact required forms.",
      dueDate: addDays(today, 7),
      kind: "registration",
    });
  }
  if (opp.kind === "sbir_sttr") {
    tasks.push({
      phase: "Registrations",
      title: "Register at SBIR.gov and confirm size/ownership eligibility",
      detail:
        "SBIR/STTR requires SBIR.gov registration and meeting small-business size + majority-US-ownership rules. Confirm both before investing writing time.",
      dueDate: addDays(today, 7),
      kind: "registration",
    });
  }
  if (submitBy) {
    tasks.push({
      phase: "Submission",
      title: "Submit the application (3-day buffer before the deadline)",
      detail: `Target ${submitBy} — three days before the ${opp.closeDate} close. Federal portals reject late submissions with no grace period; validation errors are common on the last day.`,
      dueDate: submitBy,
      kind: "submission",
    });
  } else {
    tasks.push({
      phase: "Submission",
      title: "Submit the application",
      detail:
        "This program has a rolling or unlisted deadline. Confirm the current window with the program contact before submitting.",
      dueDate: null,
      kind: "submission",
    });
  }
  tasks.push({
    phase: "After submission",
    title: "Confirm receipt and calendar the award decision window",
    detail:
      "Save the submission confirmation/tracking number, note the expected review timeline, and set a reminder to follow up with the program contact if you hear nothing.",
    dueDate: submitBy ? addDays(submitBy, 7) : null,
    kind: "admin",
  });
  return tasks;
}

/** Generic middle-of-plan tasks used when the LLM is unavailable. */
function fallbackTasks(today: string, submitBy: string | null): NewTask[] {
  const span = submitBy ? Math.max(daysBetween(today, submitBy), 14) : 45;
  const at = (frac: number) => addDays(today, Math.round(span * frac));
  return [
    {
      phase: "Eligibility",
      title: "Read the full solicitation and confirm eligibility line-by-line",
      detail:
        "Go through the official notice's eligibility section and confirm each requirement applies to you; email the program contact about anything ambiguous.",
      dueDate: at(0.1),
      kind: "eligibility",
    },
    {
      phase: "Narrative",
      title: "Draft the project narrative",
      detail:
        "Problem, solution, work plan, team, and impact — mapped to the opportunity's stated objectives and evaluation criteria.",
      dueDate: at(0.5),
      kind: "writing",
    },
    {
      phase: "Budget & documents",
      title: "Build the budget and budget justification",
      detail:
        "Cost out personnel, equipment, and other direct costs inside the award range; justify each line against the work plan.",
      dueDate: at(0.65),
      kind: "budget",
    },
    {
      phase: "Review",
      title: "Full internal review against the evaluation criteria",
      detail:
        "Have someone outside the writing team score the draft against the solicitation's review criteria; fix the weakest sections.",
      dueDate: at(0.85),
      kind: "review",
    },
  ];
}

// ---------- LLM enrichment ----------

const PLAN_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    tasks: {
      type: "array",
      items: {
        type: "object",
        properties: {
          phase: { type: "string", enum: PHASES as unknown as string[] },
          title: { type: "string" },
          detail: { type: "string" },
          dueOffsetDays: { type: ["number", "null"] },
          kind: {
            type: "string",
            enum: [
              "registration",
              "eligibility",
              "writing",
              "budget",
              "evidence",
              "review",
              "submission",
              "admin",
            ],
          },
        },
        required: ["phase", "title", "detail", "dueOffsetDays", "kind"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "tasks"],
  additionalProperties: false,
};

interface LlmPlan {
  summary: string;
  tasks: {
    phase: string;
    title: string;
    detail: string;
    dueOffsetDays: number | null;
    kind: string;
  }[];
}

async function llmTasks(
  opp: Opportunity,
  profile: CompanyProfile,
  today: string,
  submitBy: string | null,
): Promise<{ summary: string; tasks: NewTask[] } | null> {
  const windowDays = submitBy ? daysBetween(today, submitBy) : null;
  const prompt = [
    `You are a grants consultant building a submission work plan for a startup founder. ${PLAIN_LANGUAGE_RULE}`,
    "Produce 6-12 tasks SPECIFIC to this opportunity — eligibility checks drawn from its eligibility text,",
    "narrative sections implied by its description, budget/attachment work, and one review pass.",
    "Do NOT include generic registrations (SAM.gov, Grants.gov, SBIR.gov) or the final submission — those are handled separately.",
    "dueOffsetDays = working days from today the task should be DONE by" +
      (windowDays != null
        ? `; the whole plan must fit inside ${windowDays} days (submission buffer already reserved).`
        : "; deadline is rolling, spread tasks over ~45 days."),
    "Also write `summary`: 3-4 sentences of straight talk on the winning angle for THIS company and THIS program,",
    "grounded only in the data below — never invent amounts, dates, or program rules.",
    "",
    `TODAY: ${today}`,
    `OPPORTUNITY (JSON):\n${JSON.stringify(
      {
        title: opp.title,
        agency: opp.agency,
        kind: opp.kind,
        source: opp.source,
        awardFloorUsd: opp.awardFloorUsd,
        awardCeilingUsd: opp.awardCeilingUsd,
        closeDate: opp.closeDate,
        eligibilityText: opp.eligibilityText?.slice(0, 1500) ?? null,
        description: opp.description.slice(0, 3000),
      },
      null,
      1,
    )}`,
    "",
    `COMPANY PROFILE (JSON):\n${JSON.stringify(profile, null, 1)}`,
  ].join("\n");
  try {
    const out = await completeJSON<LlmPlan>(prompt, PLAN_SCHEMA, {
      effort: "medium",
      maxTokens: 2500,
    });
    const tasks: NewTask[] = out.tasks.slice(0, 14).map((t) => ({
      phase: (PHASES as readonly string[]).includes(t.phase) ? t.phase : "Narrative",
      title: t.title,
      detail: t.detail,
      dueDate:
        t.dueOffsetDays == null
          ? null
          : // Clamp inside the window: never past the submission buffer.
            addDays(
              today,
              windowDays != null
                ? Math.min(Math.max(1, Math.round(t.dueOffsetDays)), windowDays - 1)
                : Math.max(1, Math.round(t.dueOffsetDays)),
            ),
      kind: t.kind,
    }));
    return { summary: out.summary, tasks };
  } catch (err) {
    console.warn("plan generation LLM failed, using fallback:", err);
    return null;
  }
}

// ---------- public API ----------

export async function generatePlan(
  opp: Opportunity,
  profile: CompanyProfile,
): Promise<GeneratedPlan> {
  const today = localIsoDate();
  // Submission buffer: 3 days before close; if already inside 3 days, the
  // close date itself. Past-deadline opportunities get a rolling plan.
  const closeUsable = opp.closeDate && opp.closeDate > today ? opp.closeDate : null;
  const submitBy = closeUsable
    ? daysBetween(today, closeUsable) > 3
      ? addDays(closeUsable, -3)
      : closeUsable
    : null;

  const scaffold = scaffoldTasks(opp, profile, today, submitBy);
  const enriched = await llmTasks(opp, profile, today, submitBy);
  const middle = enriched?.tasks?.length ? enriched.tasks : fallbackTasks(today, submitBy);

  const phaseRank = (p: string) => {
    const i = (PHASES as readonly string[]).indexOf(p);
    return i === -1 ? PHASES.length : i;
  };
  const all = [...scaffold, ...middle].sort(
    (a, b) =>
      phaseRank(a.phase) - phaseRank(b.phase) ||
      (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"),
  );

  return {
    summary:
      enriched?.summary ??
      `Work plan for ${opp.title} (${opp.agency}). Generated without AI enrichment — review the official notice for program-specific requirements.`,
    tasks: all,
  };
}
