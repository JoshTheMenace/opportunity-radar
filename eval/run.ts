// ============================================================
// Eval runner. Usage (from repo root):
//
//   pnpm tsx eval/run.ts                  # run all 5 cases, print table
//   pnpm tsx eval/run.ts --case cyber     # run one case
//   pnpm tsx eval/run.ts --json           # machine-readable (for agent loops)
//   pnpm tsx eval/run.ts --provider live  # drive the Gemini Live voice agent
//                                         # (text in/out) instead of the
//                                         # pipeline; judges its transcript
//
// Results are always written to eval/results/<timestamp>.json.
// Requires src/lib/engine/pipeline.ts to export:
//   runAnalysis(founderInput: string): Promise<MatchReport>
// ============================================================

import fs from "fs";
import path from "path";
import { EVAL_CASES, getCase } from "./cases";
import { judgeReport } from "./judge";
import type { EvalScore, MatchReport } from "../src/lib/types";

type RunAnalysis = (founderInput: string) => Promise<MatchReport>;

const PIPELINE_SPECIFIER = "../src/lib/engine/pipeline";
const PIPELINE_MISSING_MSG =
  "Eval runner could not load the matching pipeline.\n" +
  "Expected src/lib/engine/pipeline.ts to export:\n" +
  "  export async function runAnalysis(founderInput: string): Promise<MatchReport>\n" +
  "That module does not exist yet (or does not export runAnalysis). Build it, " +
  "then re-run: pnpm tsx eval/run.ts";

async function loadPipeline(jsonMode: boolean): Promise<RunAnalysis> {
  let mod: Record<string, unknown> | null = null;
  try {
    // Non-literal specifier: pipeline.ts may not exist yet; resolve at runtime.
    mod = (await import(PIPELINE_SPECIFIER)) as Record<string, unknown>;
  } catch {
    mod = null;
  }
  const fn = mod?.runAnalysis;
  if (typeof fn !== "function") {
    if (jsonMode) console.log(JSON.stringify({ error: "pipeline_missing", message: PIPELINE_MISSING_MSG }));
    console.error(PIPELINE_MISSING_MSG);
    process.exit(1);
  }
  return fn as RunAnalysis;
}

type Provider = "codex" | "live";

/** What one provider run yields: the report, plus (live only) what the agent said. */
type CaseRun = { report: MatchReport; spoken?: string };

/** codex = call the pipeline directly; live = converse with the Gemini Live voice agent. */
async function loadDriver(
  provider: Provider,
  jsonMode: boolean,
): Promise<(founderInput: string) => Promise<CaseRun>> {
  if (provider === "live") {
    if (!process.env.GEMINI_API_KEY) {
      const msg = "--provider live requires GEMINI_API_KEY in .env.local / env";
      if (jsonMode) console.log(JSON.stringify({ error: "gemini_key_missing", message: msg }));
      console.error(msg);
      process.exit(1);
    }
    const { runLiveText } = await import("../src/lib/voice/live-text");
    return async (input) => {
      const r = await runLiveText(input);
      return { report: r.report, spoken: r.agentText };
    };
  }
  const fn = await loadPipeline(jsonMode);
  return async (input) => ({ report: await fn(input) });
}

function parseArgs(argv: string[]): {
  caseId: string | null;
  json: boolean;
  provider: Provider;
} {
  let caseId: string | null = null;
  let json = false;
  let provider: Provider = "codex";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--case") caseId = argv[++i] ?? null;
    else if (argv[i] === "--json") json = true;
    else if (argv[i] === "--provider") {
      const p = argv[++i];
      if (p !== "codex" && p !== "live") {
        console.error(`--provider must be "codex" or "live", got "${p}"`);
        process.exit(1);
      }
      provider = p;
    }
  }
  return { caseId, json, provider };
}

function fmt(n: number): string {
  return n.toFixed(2);
}

function printTable(scores: EvalScore[], mock: boolean) {
  const header = ["case", "coverage", "honesty", "noDead", "explain", "TOTAL"];
  const rows = scores.map((s) => [
    s.caseId,
    fmt(s.coverage),
    fmt(s.honesty),
    fmt(s.noDeadOpportunities),
    mock ? "n/a" : fmt(s.explanationQuality),
    fmt(s.total),
  ]);
  const widths = header.map((h, i) => Math.max(h.length, ...rows.map((r) => r[i].length)));
  const line = (cells: string[]) => cells.map((c, i) => c.padEnd(widths[i])).join("  ");
  console.log(line(header));
  console.log(widths.map((w) => "-".repeat(w)).join("  "));
  for (const r of rows) console.log(line(r));
  const avg = scores.reduce((a, s) => a + s.total, 0) / Math.max(1, scores.length);
  console.log(`\naverage total: ${fmt(avg)}${mock ? "  (explanationQuality n/a: mock backend)" : ""}`);
  for (const s of scores) console.log(`  [${s.caseId}] ${s.notes}`);
}

async function main() {
  const { caseId, json, provider } = parseArgs(process.argv.slice(2));
  const cases = caseId ? [getCase(caseId)].filter((c) => c != null) : EVAL_CASES;
  if (caseId && cases.length === 0) {
    console.error(
      `Unknown case "${caseId}". Valid ids: ${EVAL_CASES.map((c) => c.id).join(", ")}`,
    );
    process.exit(1);
  }

  const run = await loadDriver(provider, json);
  const scores: EvalScore[] = [];
  const transcripts: Record<string, string> = {};
  for (const c of cases) {
    if (!json) console.log(`\n=== running case: ${c.id} (${provider}) ===`);
    try {
      const { report, spoken } = await run(c.founderInput);
      if (spoken != null) transcripts[c.id] = spoken;
      scores.push(await judgeReport(c, report, { spokenTranscript: spoken }));
    } catch (err) {
      scores.push({
        caseId: c.id,
        coverage: 0,
        honesty: 0,
        noDeadOpportunities: 0,
        explanationQuality: 0,
        total: 0,
        notes: `${provider} run threw: ${(err as Error).message}`,
      });
    }
  }

  const result = {
    timestamp: new Date().toISOString(),
    backend: process.env.LLM_BACKEND ?? "codex", // engine LLM (pipeline runs under both providers)
    provider,
    averageTotal: scores.reduce((a, s) => a + s.total, 0) / Math.max(1, scores.length),
    scores,
    // Live only: what the agent said per case, for inspection alongside scores.
    ...(Object.keys(transcripts).length > 0 ? { transcripts } : {}),
  };

  const resultsDir = path.join(__dirname, "results");
  fs.mkdirSync(resultsDir, { recursive: true });
  const outPath = path.join(
    resultsDir,
    `${result.timestamp.replace(/[:.]/g, "-")}.json`,
  );
  fs.writeFileSync(outPath, JSON.stringify(result, null, 2));

  if (json) {
    console.log(JSON.stringify(result)); // stdout = the parseable payload
    console.error(`results written to ${outPath}`);
  } else {
    console.log("");
    printTable(scores, result.backend === "mock");
    console.log(`\nresults written to ${outPath}`);
  }
}

main().then(
  // Explicit exit: the codex app-server child keeps the event loop alive
  // after results are written, so without this the process never exits.
  () => process.exit(0),
  (err) => {
    console.error(err);
    process.exit(1);
  },
);
