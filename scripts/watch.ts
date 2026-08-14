// The Radar daemon. Usage:
//   pnpm tsx scripts/watch.ts                 # one cycle
//   pnpm tsx scripts/watch.ts --loop 15       # every 15 minutes, forever
//   pnpm tsx scripts/watch.ts --ingest-first  # pull fresh grants.gov data, then cycle
//
// A cycle: diff opportunities vs the watcher's seen-set; gate + rank the
// new ones against every monitorable saved company; write notifications
// and drafted emails (data/outbox/). First run seeds silently.

import { spawnSync } from "child_process";
import { runWatchCycle } from "../src/lib/monitor/watcher";

function arg(flag: string): boolean {
  return process.argv.includes(flag);
}
function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : null;
}

async function cycle() {
  if (arg("--ingest-first")) {
    console.log("[watch] refreshing grants.gov data...");
    const r = spawnSync("pnpm", ["tsx", "scripts/ingest/grants-gov.ts"], {
      stdio: "inherit",
      cwd: process.cwd(),
    });
    if (r.status !== 0) console.log("[watch] ingest failed; matching against existing data only");
  }
  const result = await runWatchCycle((m) => console.log(`[watch] ${m}`));
  if (result.seeded) return;
  console.log(
    `[watch] cycle done: ${result.newOpportunities} new opportunities, ` +
      `${result.companiesChecked} companies checked, ${result.notifications.length} notifications`,
  );
  for (const n of result.notifications) {
    console.log(`[watch]   -> ${n.company}: "${n.opportunity}" (${n.tier}, score ${n.score})`);
  }
}

const loopMin = argValue("--loop");
if (loopMin) {
  const ms = Math.max(1, Number(loopMin)) * 60_000;
  console.log(`[watch] looping every ${loopMin} min (ctrl-c to stop)`);
  const tick = async () => {
    try {
      await cycle();
    } catch (e) {
      console.error("[watch] cycle error:", e instanceof Error ? e.message : e);
    }
    setTimeout(tick, ms);
  };
  void tick();
} else {
  cycle().then(
    () => process.exit(0),
    (e) => {
      console.error("[watch] fatal:", e);
      process.exit(1);
    },
  );
}
