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
    <div className="card mt-6 p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
        Standing watch
      </p>
      <div className="mt-1 font-display text-[17px] font-bold tracking-tight text-ink">
        Keep watching for me
      </div>
      <p className="mt-1 text-[13.5px] text-muted">
        Save this profile and Opportunity Radar will screen every newly posted opportunity
        against it — you get notified when something fits. No more re-running searches.
      </p>
      {state !== "done" ? (
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            className="rounded-xl border border-line bg-card px-4 py-2.5 text-[14px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
            placeholder="Company name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="rounded-xl border border-line bg-card px-4 py-2.5 text-[14px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
            placeholder="Email for alerts (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            className="rounded-xl bg-brand px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-strong disabled:opacity-50"
            disabled={!name.trim() || state === "saving"}
            onClick={save}
          >
            {state === "saving" ? "Saving..." : "Save & monitor"}
          </button>
        </div>
      ) : null}
      {message && (
        <p className={`mt-2 text-[13.5px] ${state === "error" ? "text-risk" : "text-good"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
