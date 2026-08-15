"use client";

// Drop-in "Save & monitor" card (kit dress). Mounted under the report in
// opportunity-map.tsx; match cards' "Save for Later" buttons scroll here
// (the section id is the affordance target).
//
// Saving is the opt-in: the company is enrolled in the Radar watch
// cycle (see /radar).

import { useState } from "react";
import type { CompanyProfile } from "@/lib/types";
import { Button } from "./components/ui";

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
    <div id="save-monitor" className="or-card mt-6">
      <p className="mk-label" style={{ textTransform: "uppercase" }}>
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
            className="or-field w-auto"
            style={{ padding: "8px 12px" }}
            placeholder="Company name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="or-field w-auto"
            style={{ padding: "8px 12px" }}
            placeholder="Email for alerts (optional)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button variant="filled" disabled={!name.trim() || state === "saving"} onClick={save}>
            {state === "saving" ? "Saving…" : "Save & monitor"}
          </Button>
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
