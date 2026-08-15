// ============================================================
// Multi-turn persona harness. Usage (from repo root):
//
//   LLM_BACKEND=mock pnpm tsx eval/run-personas.ts          # all personas
//   pnpm tsx eval/run-personas.ts --persona ideal-rnd       # one persona
//
// Drives the engine DIRECTLY (no HTTP), mirroring /api/answer:
//   round 0: runAnalysis(initial, null, emit, {gatherFirst:true})
//   per turn: {field,answer} -> applyAnswer; {message} ->
//     applyFreeformAnswer + "Founder follow-up" description
//     accumulation; then re-run runAnalysis with the profile as prior.
//
// Deterministic assertions (the product):
//   cap          questions never exceed the cap meter.ts enforces
//                (measured empirically, not assumed)
//   askedNull    a question never asks an already-answered field
//   explicitWins a known gate value is never overwritten by later
//                inference (self-corrector: employees stays 600)
//   ffNoop       a freeform turn that answered nothing leaves the
//                gate fields unchanged
//   upfrontR1    everything-upfront: round-1 asks <= cap, all-null fields
// LLM-guarded (skipped under LLM_BACKEND=mock, where extraction is inert):
//   noFacts*     "idk"-style messages settle zero fields
//   multiFact*   the voice dump settles >= N fields
//
// Writes a markdown transcript to eval/results/personas-<timestamp>.md.
// Exit code 1 if any assertion fails.
// ============================================================

import fs from "fs";
import path from "path";
import { PERSONAS, getPersona, type Persona, type Turn } from "./personas";
import { runAnalysis } from "../src/lib/engine/pipeline";
import { applyAnswer, applyFreeformAnswer } from "../src/lib/engine/profile";
import { ALL_GATE_FIELDS, buildQuestions, formatUsdCompact } from "../src/lib/engine/meter";
import type {
  AnalyzeEvent,
  CompanyProfile,
  GateField,
  GatedOpportunity,
  MatchReport,
} from "../src/lib/types";

const MOCK = (process.env.LLM_BACKEND ?? "codex") === "mock";

// ---------- Measure the real question cap (never assume 3) ----------

const NULL_PROFILE: CompanyProfile = {
  description: "", name: null, industry: null, naicsGuesses: [],
  technologyKeywords: [], govKeywords: [], location: null, employees: null,
  annualRevenueUsd: null, capitalRaisedUsd: null, fundingStage: null,
  isForProfit: null, isSmallBusiness: null, majorityUsOwned: null,
  hasActiveRnD: null, productMaturity: null,
  capitalNeedUsd: { min: null, max: null }, useOfFunds: null,
  targetCustomers: null, samRegistered: null, milestones: [],
};

/** One synthetic unknown-verdict opportunity gated solely by `field`. */
function syntheticUnknown(field: GateField): GatedOpportunity {
  return {
    opportunity: {
      id: `synthetic:${field}`, source: "grants_gov", kind: "grant",
      title: "synthetic", agency: "synthetic", agencyCode: null,
      description: "", alnNumbers: [], eligibilityCodes: [],
      eligibilityText: null, openToSmallBusiness: null, awardFloorUsd: null,
      awardCeilingUsd: null, estimatedTotalUsd: null, expectedAwards: null,
      expectedApplications: null, openDate: null, closeDate: null,
      status: "unknown", url: null, contactName: null, contactEmail: null,
      raw: null,
    },
    gates: [{ gate: "synthetic", verdict: "unknown", missingField: field, detail: "" }],
    verdict: "unknown",
    missingFields: [field],
    meterValueUsd: 1000,
  };
}

/** The cap buildQuestions actually enforces: feed it one askable unknown per
 *  gate field against an all-null profile and see how many come back. */
const QUESTION_CAP = buildQuestions(
  ALL_GATE_FIELDS.map(syntheticUnknown),
  NULL_PROFILE,
).length;

// ---------- Assertion bookkeeping ----------

type CheckId =
  | "cap" | "askedNull" | "explicitWins" | "ffNoop" | "upfrontR1"
  | "noFacts" | "multiFact";
const CHECKS: CheckId[] = [
  "cap", "askedNull", "explicitWins", "ffNoop", "upfrontR1", "noFacts", "multiFact",
];
const LLM_GUARDED: CheckId[] = ["noFacts", "multiFact"];

interface Failure { check: CheckId; msg: string }

const isFreeform = (t: Turn): t is Extract<Turn, { message: string }> => "message" in t;

function applicable(p: Persona, check: CheckId): boolean {
  switch (check) {
    case "cap":
    case "askedNull": return true;
    case "explicitWins": return p.turns.length > 0 || (p.expectFinal?.length ?? 0) > 0;
    case "ffNoop": return p.turns.some(isFreeform);
    case "upfrontR1": return p.checkRound1Upfront === true;
    case "noFacts": return p.turns.some((t) => isFreeform(t) && t.expectsNoFacts);
    case "multiFact": return p.turns.some((t) => isFreeform(t) && t.expectsFactCountAtLeast != null);
  }
}

// ---------- Profile helpers ----------

/** Gate-field value as the meter sees it (location collapses to state). */
function fieldValue(p: CompanyProfile, f: GateField): string | number | boolean | null {
  if (f === "location") return p.location?.state ?? null;
  return p[f];
}

type GateSnapshot = Record<GateField, string | number | boolean | null>;

function gateSnapshot(p: CompanyProfile): GateSnapshot {
  const s = {} as GateSnapshot;
  for (const f of ALL_GATE_FIELDS) s[f] = fieldValue(p, f);
  return s;
}

// ---------- Per-persona run ----------

interface Round {
  label: string;
  answered: string[]; // freeform: what applyFreeformAnswer recorded
  report: MatchReport;
}

interface PersonaResult {
  persona: Persona;
  rounds: Round[];
  failures: Failure[];
  error: string | null;
}

async function runPersona(p: Persona): Promise<PersonaResult> {
  const rounds: Round[] = [];
  const failures: Failure[] = [];
  const fail = (check: CheckId, msg: string) => failures.push({ check, msg });
  const emit = (_e: AnalyzeEvent) => {};

  const checkRound = (label: string, report: MatchReport) => {
    if (report.questions.length > QUESTION_CAP)
      fail("cap", `${label}: surfaced ${report.questions.length} questions > cap ${QUESTION_CAP}`);
    for (const q of report.questions) {
      if (fieldValue(report.profile, q.field) !== null)
        fail("askedNull", `${label}: asked "${q.field}" but profile already has ${JSON.stringify(fieldValue(report.profile, q.field))}`);
    }
  };

  try {
    let report = await runAnalysis(p.initial, null, emit, { gatherFirst: true });
    checkRound("round 0", report);
    if (p.checkRound1Upfront) {
      if (report.questions.length > QUESTION_CAP)
        fail("upfrontR1", `round 0 asked ${report.questions.length} > cap ${QUESTION_CAP}`);
      for (const q of report.questions) {
        if (fieldValue(report.profile, q.field) !== null)
          fail("upfrontR1", `round 0 asked "${q.field}" though it was extracted from the opener`);
      }
    }
    rounds.push({ label: `initial: "${p.initial.slice(0, 60)}..."`, answered: [], report });

    let profile = report.profile;
    for (let i = 0; i < p.turns.length; i++) {
      const turn = p.turns[i];
      let answered: string[] = [];
      let label: string;

      if (isFreeform(turn)) {
        label = `turn ${i + 1} (freeform): "${turn.message.slice(0, 60)}"`;
        const before = gateSnapshot(profile);
        const r = await applyFreeformAnswer(profile, turn.message);
        answered = r.answered;
        profile = r.profile;
        if (answered.length === 0) {
          const after = gateSnapshot(profile);
          for (const f of ALL_GATE_FIELDS) {
            if (before[f] !== after[f])
              fail("ffNoop", `${label}: answered nothing yet "${f}" changed ${JSON.stringify(before[f])} -> ${JSON.stringify(after[f])}`);
          }
        }
        if (!MOCK && turn.expectsNoFacts && answered.length > 0)
          fail("noFacts", `${label}: expected zero facts, recorded [${answered.join("; ")}]`);
        if (!MOCK && turn.expectsFactCountAtLeast != null && answered.length < turn.expectsFactCountAtLeast)
          fail("multiFact", `${label}: expected >= ${turn.expectsFactCountAtLeast} facts, recorded ${answered.length}`);
        // Mirror /api/answer: the founder's words accumulate into the description.
        profile = { ...profile, description: `${profile.description}\n\nFounder follow-up: ${turn.message}` };
      } else {
        label = `turn ${i + 1} (structured): ${turn.field} = ${JSON.stringify(turn.answer)}`;
        profile = applyAnswer(profile, turn.field, turn.answer);
      }

      // Everything known when this round starts must survive re-analysis:
      // an explicit answer is never overwritten by later inference.
      const expected = gateSnapshot(profile);
      report = await runAnalysis(profile.description, profile, emit, { gatherFirst: true });
      for (const f of ALL_GATE_FIELDS) {
        if (expected[f] !== null && fieldValue(report.profile, f) !== expected[f])
          fail("explicitWins", `${label}: "${f}" was ${JSON.stringify(expected[f])} going in, came back ${JSON.stringify(fieldValue(report.profile, f))}`);
      }
      checkRound(label, report);
      rounds.push({ label, answered, report });
      profile = report.profile;
    }

    for (const e of p.expectFinal ?? []) {
      const got = fieldValue(profile, e.field);
      if (got !== e.value)
        fail("explicitWins", `final profile: expected ${e.field} === ${JSON.stringify(e.value)}, got ${JSON.stringify(got)}`);
    }

    return { persona: p, rounds, failures, error: null };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    for (const c of CHECKS) if (applicable(p, c)) fail(c, `run threw: ${msg}`);
    return { persona: p, rounds, failures, error: msg };
  }
}

// ---------- Reporting ----------

function statusOf(r: PersonaResult, check: CheckId): string {
  if (!applicable(r.persona, check)) return "-";
  if (MOCK && LLM_GUARDED.includes(check)) return "skip";
  return r.failures.some((f) => f.check === check) ? "FAIL" : "PASS";
}

function printTable(results: PersonaResult[]) {
  const header = ["persona", ...CHECKS];
  const rows = results.map((r) => [r.persona.id, ...CHECKS.map((c) => statusOf(r, c))]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((row) => row[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log(`\nquestion cap enforced by meter.ts (measured): ${QUESTION_CAP}`);
  console.log(`backend: ${process.env.LLM_BACKEND ?? "codex"}${MOCK ? "  (LLM-guarded checks skipped)" : ""}\n`);
  console.log(line(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const row of rows) console.log(line(row));
  for (const r of results) {
    for (const f of r.failures) console.log(`  [${r.persona.id}] ${f.check}: ${f.msg}`);
  }
}

function roundMd(r: Round): string[] {
  const rep = r.report;
  const out = [`**${r.label}**`];
  if (r.answered.length) out.push(`- recorded: ${r.answered.join("; ")}`);
  out.push(
    `- meter: unlocked ${formatUsdCompact(rep.meter.unlockedUsd)} of ${formatUsdCompact(rep.meter.potentialUsd)} potential` +
      ` | matches: ${rep.matches.length || (rep.honestNo ? "0" : "0 (held/none)")} | honestNo: ${rep.honestNo}`,
  );
  if (rep.questions.length === 0) out.push(`- questions: none`);
  for (const q of rep.questions) out.push(`- Q[${q.field}]: ${q.question}`);
  out.push("");
  return out;
}

function transcriptMd(results: PersonaResult[]): string {
  const out = [
    `# Persona interview transcripts — ${new Date().toISOString()}`,
    `backend: ${process.env.LLM_BACKEND ?? "codex"} | question cap (measured): ${QUESTION_CAP}`,
    "",
  ];
  for (const r of results) {
    out.push(`## ${r.persona.name} (\`${r.persona.id}\`)`, `_${r.persona.strategy}_`, "");
    if (r.error) out.push(`**RUN ERROR:** ${r.error}`, "");
    for (const round of r.rounds) out.push(...roundMd(round));
    const final = r.rounds[r.rounds.length - 1]?.report;
    if (final) {
      const gates = ALL_GATE_FIELDS.map((f) => `${f}=${JSON.stringify(fieldValue(final.profile, f))}`).join(", ");
      out.push(`_Final gates: ${gates}_`, `_Final honestNo: ${final.honestNo}_`, "");
    }
    const verdicts = CHECKS.map((c) => `${c}:${statusOf(r, c)}`).join(" ");
    out.push(`_Checks: ${verdicts}_`, "", "---", "");
  }
  return out.join("\n");
}

// ---------- Main ----------

async function main() {
  const argv = process.argv.slice(2);
  const idx = argv.indexOf("--persona");
  const only = idx >= 0 ? argv[idx + 1] : null;
  const personas = only ? [getPersona(only)].filter((p) => p != null) : [...PERSONAS];
  if (only && personas.length === 0) {
    console.error(`Unknown persona "${only}". Valid ids: ${PERSONAS.map((p) => p.id).join(", ")}`);
    process.exit(1);
  }

  const results: PersonaResult[] = [];
  for (const p of personas) {
    process.stderr.write(`Running persona: ${p.id}...\n`);
    results.push(await runPersona(p));
  }

  printTable(results);

  const resultsDir = path.join(__dirname, "results");
  fs.mkdirSync(resultsDir, { recursive: true });
  const outPath = path.join(
    resultsDir,
    `personas-${new Date().toISOString().replace(/[:.]/g, "-")}.md`,
  );
  fs.writeFileSync(outPath, transcriptMd(results));
  console.log(`\ntranscript written to ${outPath}`);

  const failed = results.some((r) => r.failures.length > 0);
  console.log(failed ? "\nRESULT: FAIL" : "\nRESULT: PASS");
  process.exit(failed ? 1 : 0); // explicit: the codex child keeps the loop alive
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
