"use client";

// The Radar dashboard: monitored companies + the live notification feed.
// Functional styling only — designer teammate restyles later.

import { useCallback, useEffect, useState } from "react";

interface CompanyRow {
  id: number;
  name: string;
  email: string | null;
  monitoring: boolean;
  updatedAt: string;
  completeness: { score: number; monitorable: boolean; missing: string[] };
}

interface NotificationRow {
  id: number;
  companyName: string;
  score: number;
  tier: string;
  whyFit: string;
  emailSubject: string | null;
  emailBody: string | null;
  createdAt: string;
  opportunity: { title: string; agency: string; closeDate: string | null; url: string | null } | null;
}

const tierColor: Record<string, string> = {
  likely_fit: "bg-emerald-900 text-emerald-200",
  verify_eligibility: "bg-yellow-900 text-yellow-200",
};

export default function RadarPage() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [openEmail, setOpenEmail] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [c, n] = await Promise.all([
        fetch("/api/companies").then((r) => r.json()),
        fetch("/api/notifications").then((r) => r.json()),
      ]);
      setCompanies(c.companies ?? []);
      setNotifications(n.notifications ?? []);
    } catch {
      // transient — next poll retries
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <main className="mx-auto max-w-4xl p-6 text-neutral-100">
      <h1 className="text-2xl font-bold">📡 Opportunity Radar</h1>
      <p className="mt-1 text-sm text-neutral-400">
        Saved companies are monitored automatically: every ingest cycle, new opportunities are
        gated and ranked against each profile — matches become notifications and drafted emails.
        No buttons.
      </p>

      <h2 className="mt-8 text-lg font-semibold">Monitored companies</h2>
      {companies.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">
          None yet — run an analysis on the home page and save the profile.
        </p>
      ) : (
        <ul className="mt-2 space-y-2">
          {companies.map((c) => (
            <li key={c.id} className="rounded border border-neutral-800 bg-neutral-900 p-3">
              <div className="flex items-center justify-between">
                <span className="font-medium">{c.name}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    c.completeness.monitorable
                      ? "bg-emerald-900 text-emerald-200"
                      : "bg-neutral-800 text-neutral-400"
                  }`}
                >
                  {c.completeness.monitorable
                    ? "monitoring active"
                    : `needs: ${c.completeness.missing.join(", ")}`}
                </span>
              </div>
              <div className="mt-1 text-xs text-neutral-500">
                profile {Math.round(c.completeness.score * 100)}% complete
                {c.email ? ` · ${c.email}` : " · no email on file"}
              </div>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-8 text-lg font-semibold">Notifications</h2>
      {notifications.length === 0 ? (
        <p className="mt-2 text-sm text-neutral-500">
          None yet — new matches appear here after each watch cycle.
        </p>
      ) : (
        <ul className="mt-2 space-y-3">
          {notifications.map((n) => (
            <li key={n.id} className="rounded border border-neutral-800 bg-neutral-900 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm text-neutral-400">
                    New match for <span className="text-neutral-200">{n.companyName}</span>
                  </div>
                  <div className="mt-0.5 font-medium">
                    {n.opportunity?.url ? (
                      <a
                        className="underline decoration-neutral-600 hover:decoration-neutral-300"
                        href={n.opportunity.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {n.opportunity?.title ?? n.emailSubject}
                      </a>
                    ) : (
                      (n.opportunity?.title ?? n.emailSubject)
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-neutral-500">
                    {n.opportunity?.agency}
                    {n.opportunity?.closeDate ? ` · closes ${n.opportunity.closeDate}` : ""}
                    {` · ${new Date(n.createdAt + "Z").toLocaleString()}`}
                  </div>
                </div>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-xs ${tierColor[n.tier] ?? "bg-neutral-800 text-neutral-300"}`}
                >
                  {n.tier.replace("_", " ")} · {n.score}
                </span>
              </div>
              <p className="mt-2 text-sm text-neutral-300">{n.whyFit}</p>
              {n.emailBody && (
                <div className="mt-2">
                  <button
                    className="text-xs text-sky-400 underline"
                    onClick={() => setOpenEmail(openEmail === n.id ? null : n.id)}
                  >
                    {openEmail === n.id ? "Hide drafted email" : "View drafted email"}
                  </button>
                  {openEmail === n.id && (
                    <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded bg-neutral-950 p-3 text-xs text-neutral-300">
                      {`Subject: ${n.emailSubject}\n\n${n.emailBody}`}
                    </pre>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
