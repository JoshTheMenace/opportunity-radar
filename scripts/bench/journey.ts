// ============================================================
// Latency benchmark: the text-user journey, as the UI experiences
// it. Runs against the dev server and timestamps every SSE event
// to produce a stage waterfall. One full ranking run included.
// Run: pnpm tsx scripts/bench/journey.ts [base-url]
// ============================================================

const BASE = process.argv[2] ?? "http://localhost:3001";

interface EvLog {
  t: number; // ms since request start
  type: string;
  note: string;
}

async function sse(path: string, body: unknown): Promise<{
  events: EvLog[];
  report: any;
  totalMs: number;
}> {
  const t0 = Date.now();
  const events: EvLog[] = [];
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw new Error(`${path} -> HTTP ${res.status}`);
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  let report: any = null;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const chunks = buf.split("\n\n");
    buf = chunks.pop() ?? "";
    for (const c of chunks) {
      const line = c.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      const ev = JSON.parse(line.slice(6));
      const note =
        ev.type === "activity"
          ? ev.message
          : ev.type === "report"
            ? `report (${ev.report.matches.length} matches)`
            : ev.type;
      events.push({ t: Date.now() - t0, type: ev.type, note });
      if (ev.type === "report") report = ev.report;
      if (ev.type === "error") throw new Error(ev.message);
    }
  }
  return { events, report, totalMs: Date.now() - t0 };
}

const s = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

function waterfall(label: string, r: { events: EvLog[]; totalMs: number }) {
  console.log(`\n── ${label} — total ${s(r.totalMs)}`);
  let prev = 0;
  for (const e of r.events) {
    console.log(`  +${s(e.t - prev).padStart(6)}  t=${s(e.t).padStart(7)}  ${e.note.slice(0, 90)}`);
    prev = e.t;
  }
}

async function timeJson(label: string, path: string, init?: RequestInit) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${path}`, init);
  await res.json().catch(() => null);
  console.log(`  ${label}: ${s(Date.now() - t0)} (HTTP ${res.status})`);
  return Date.now() - t0;
}

async function main() {
  console.log(`journey benchmark against ${BASE}\n`);

  // A) Sparse intake -> readiness hold (extraction + gates, no ranking)
  const holdRun = await sse("/api/analyze", {
    founderText:
      "We build robotics kits that teach middle school science classes hands-on engineering. Based in Tucson, Arizona, 6 people.",
  });
  waterfall("A. sparse intake → hold (what a new user waits before ANY feedback)", holdRun);

  // B) Freeform answer settling two required fields (parse + instant refine)
  const b = await sse("/api/answer", {
    profile: holdRun.report.profile,
    message: "We're looking for about $400K, and yes we do active R&D on new sensor designs.",
    priorReport: holdRun.report,
  });
  waterfall("B. freeform answer (LLM parse + refine)", b);

  // C) One-tap field answer, non-required field (pure refine)
  const c = await sse("/api/answer", {
    profile: b.report.profile,
    field: "productMaturity",
    answer: "in-market",
    priorReport: b.report,
  });
  waterfall("C. one-tap answer (pure refine — no LLM)", c);

  // D) The answer that completes readiness -> ONE full ranking run
  const d = await sse("/api/answer", {
    profile: c.report.profile,
    field: "majorityUsOwned",
    answer: true,
    priorReport: c.report,
  });
  waterfall("D. crossover → full ranking run (the big one)", d);

  // Batch cadence analysis from D's Scored lines
  const scored = d.events.filter((e) => e.note.startsWith("Scored"));
  if (scored.length > 1) {
    const gaps = scored.slice(1).map((e, i) => e.t - scored[i].t);
    console.log(
      `\n  ranking batch cadence: ${scored.length} progress events, ` +
        `gaps ${gaps.map((g) => (g / 1000).toFixed(1)).join("s, ")}s ` +
        `(parallel batches land together => small gaps; serialized => ~one-LLM-call gaps)`,
    );
  }

  // E) Secondary endpoints the UI touches
  console.log("\n── E. secondary endpoints");
  await timeJson("quick replies (/api/suggest)", "/api/suggest", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ questions: holdRun.report.questions }),
  });
  await timeJson("voice feature-detect (GET /api/voice/token)", "/api/voice/token");
  await timeJson("voice session mint (POST /api/voice/token)", "/api/voice/token", {
    method: "POST",
  });

  // Summary
  const extraction = holdRun.events.find((e) => e.type === "profile")?.t ?? 0;
  const gates =
    (holdRun.events.find((e) => e.type === "questions")?.t ?? extraction) - extraction;
  console.log("\n══ SUMMARY (user-perceived) ══");
  console.log(`  first feedback (activity line):        ${s(holdRun.events[0]?.t ?? 0)}`);
  console.log(`  profile extracted:                     ${s(extraction)}`);
  console.log(`  retrieve+gates (4,595 opps):           ${s(gates)}`);
  console.log(`  sparse intake → questions on screen:   ${s(holdRun.totalMs)}`);
  console.log(`  freeform answer round-trip:            ${s(b.totalMs)}`);
  console.log(`  one-tap answer round-trip:             ${s(c.totalMs)}`);
  console.log(`  full ranking run (crossover):          ${s(d.totalMs)}`);
  const firstMatch = d.events.find((e) => e.note.includes("matches so far") && !e.note.includes("— 0 matches"));
  if (firstMatch) console.log(`    …first matches visible at:           ${s(firstMatch.t)}`);
  console.log(
    `  TOTAL machine time, intake → ranked:   ${s(holdRun.totalMs + b.totalMs + c.totalMs + d.totalMs)}`,
  );
}

main().then(
  () => process.exit(0),
  (e) => {
    console.error(e);
    process.exit(1);
  },
);
