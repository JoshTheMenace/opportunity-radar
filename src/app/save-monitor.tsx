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
    <div className="mt-6 rounded border border-sky-900 bg-sky-950/40 p-4">
      <div className="font-medium text-sky-200">📡 Keep watching for me</div>
      <p className="mt-1 text-sm text-neutral-400">
        Save this profile and Opportunity Radar will screen every newly posted opportunity
        against it — you get notified when something fits. No more re-running searches.
      </p>
      {state !== "done" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
            placeholder="Company name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="rounded border border-neutral-700 bg-neutral-900 px-2 py-1 text-sm"
            placeholder="Email for alerts (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            className="rounded bg-sky-700 px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
            disabled={!name.trim() || state === "saving"}
            onClick={save}
          >
            {state === "saving" ? "Saving..." : "Save & monitor"}
          </button>
        </div>
      ) : null}
      {message && (
        <p className={`mt-2 text-sm ${state === "error" ? "text-red-400" : "text-emerald-300"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
