// ============================================================
// Date helpers shared across the engine and eval harness.
// ============================================================

/** Today's (or `d`'s) date as yyyy-mm-dd in LOCAL time — never UTC. */
export function localIsoDate(d: Date = new Date()): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
