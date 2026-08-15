"use client";

// Drop-in "Save & monitor" card. Mount anywhere the final report is
// available (e.g. under ReportView in opportunity-map.tsx):
//
//   <SaveMonitor profile={report.profile} />
//
// Saving is the opt-in: the company is enrolled in the Radar watch
// cycle (see /radar). Kept as its own file so it can be wired into
// opportunity-map.tsx with a 2-line change whenever that file is free.

import { useState } from "react";
import type { CompanyProfile } from "@/lib/types";

export default function SaveMonitor({ profile }: { profile: CompanyProfile }) {
  const [name, setName] = useState(profile.name ?? "");
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "done" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  async function save() {
    setState("saving");
    try {
      const res = await fetch("/api/companies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email: email || null, profile: { ...profile, name } }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "save failed");
      const c = json.completeness as { monitorable: boolean; missing: string[] };
      setMessage(
        c.monitorable
          ? "Monitoring is ON — new matching opportunities will notify you automatically."
          : `Saved. Monitoring activates once your profile has: ${c.missing.join(", ")}.`,
      );
      setState("done");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "save failed");
      setState("error");
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-hairline bg-card p-5 shadow-card">
      <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-faint">
        STANDING WATCH
      </p>
      <div className="mt-1 text-base font-semibold tracking-tight text-ink">
        Keep watching for me
      </div>
      <p className="mt-1 text-sm text-muted">
        Save this profile and Opportunity Radar will screen every newly posted opportunity
        against it — you get notified when something fits. No more re-running searches.
      </p>
      {state !== "done" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="rounded-xl border border-hairline bg-[#FBFCFE] px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-brand focus:outline-none"
            placeholder="Company name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="rounded-xl border border-hairline bg-[#FBFCFE] px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-brand focus:outline-none"
            placeholder="Email for alerts (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            className="rounded-xl border border-hairline bg-card px-4 py-2 font-mono text-[12.5px] font-semibold text-brand transition-colors hover:bg-soft disabled:opacity-50"
            disabled={!name.trim() || state === "saving"}
            onClick={save}
          >
            {state === "saving" ? "Saving..." : "Save & monitor"}
          </button>
        </div>
      ) : null}
      {message && (
        <p className={`mt-2 text-sm ${state === "error" ? "text-risk" : "text-good"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
