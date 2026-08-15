"use client";

// The Radar dashboard: monitored companies + the live notification feed,
// framed as the founder's daily funding brief. Presentation follows the
// treasury identity; polling and data shapes are unchanged.

import { useCallback, useEffect, useState } from "react";
import RadarScope from "../components/radar-scope";

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

// Tier chips: treasury = money/pass, brass = needs a look. Never decorative.
const tierChip: Record<string, string> = {
  likely_fit: "border-treasury/50 bg-treasury/10 text-treasury",
  verify_eligibility: "border-brass/50 bg-brass/10 text-brass",
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-faint">
      {children}
    </p>
  );
}

export default function RadarPage() {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [openEmail, setOpenEmail] = useState<number | null>(null);
  // Weekday is set after mount so the SSR shell can't disagree with the client clock.
  const [weekday, setWeekday] = useState<string | null>(null);

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
    setWeekday(new Date().toLocaleDateString("en-US", { weekday: "long" }));
    void refresh();
    const t = setInterval(refresh, 10_000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8">
      {/* masthead: the brief's title + an ambient scanning scope */}
      <header className="flex items-start justify-between gap-6">
        <div className="space-y-2">
          <Eyebrow>Proactive monitoring · no buttons</Eyebrow>
          <h1 className="font-display text-3xl font-semibold text-paper sm:text-4xl">
            {weekday ?? "Today's"} funding brief
          </h1>
          <p className="max-w-2xl text-sm leading-relaxed text-muted">
            Saved companies are monitored automatically: every ingest cycle, new opportunities are
            gated and ranked against each profile — matches become notifications and drafted
            emails. No buttons.
          </p>
        </div>
        <div className="hidden shrink-0 sm:block">
          <RadarScope report={null} busy size={120} />
        </div>
      </header>

      {/* monitored companies */}
      <section className="mt-10 space-y-3">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-lg font-semibold text-paper">Monitored companies</h2>
          <span className="font-mono text-xs text-faint">{companies.length}</span>
          <div className="h-px flex-1 bg-hairline" />
        </div>
        {companies.length === 0 ? (
          <p className="rounded-lg border border-hairline bg-panel p-4 text-sm text-muted">
            No companies saved yet — run an analysis and hit Save &amp; monitor.
          </p>
        ) : (
          <ul className="space-y-2">
            {companies.map((c) => (
              <li key={c.id} className="rounded-lg border border-hairline bg-panel p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-paper">{c.name}</span>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      c.completeness.monitorable
                        ? "border-treasury/50 bg-treasury/10 text-treasury"
                        : "border-hairline bg-panel-2 text-muted"
                    }`}
                  >
                    {c.completeness.monitorable && (
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-treasury" />
                    )}
                    {c.completeness.monitorable
                      ? "monitoring active"
                      : `needs: ${c.completeness.missing.join(", ")}`}
                  </span>
                </div>
                <p className="mt-1.5 font-mono text-xs text-faint">
                  profile {Math.round(c.completeness.score * 100)}% complete
                  {c.email ? ` · ${c.email}` : " · no email on file"}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* notifications: the brief entries */}
      <section className="mt-10 space-y-3">
        <div className="flex items-baseline gap-3">
          <h2 className="font-display text-lg font-semibold text-paper">Notifications</h2>
          <span className="font-mono text-xs text-faint">{notifications.length}</span>
          <div className="h-px flex-1 bg-hairline" />
        </div>
        {notifications.length === 0 ? (
          <p className="rounded-lg border border-hairline bg-panel p-4 text-sm text-muted">
            Nothing new for your companies yet. The radar checks every cycle — you don&apos;t have
            to.
          </p>
        ) : (
          <ul className="space-y-3">
            {notifications.map((n, i) => (
              <li
                key={n.id}
                className="card-in space-y-2 rounded-lg border border-hairline bg-panel p-4"
                style={{ animationDelay: `${Math.min(i * 60, 420)}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <Eyebrow>New match · {n.companyName}</Eyebrow>
                    <p className="font-semibold text-paper">
                      {n.opportunity?.url ? (
                        <a
                          className="transition-colors hover:text-brass-bright hover:underline"
                          href={n.opportunity.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {n.opportunity?.title ?? n.emailSubject}
                        </a>
                      ) : (
                        (n.opportunity?.title ?? n.emailSubject)
                      )}
                    </p>
                    <p className="font-mono text-xs text-muted">
                      {n.opportunity?.agency}
                      {n.opportunity?.closeDate ? ` · closes ${n.opportunity.closeDate}` : ""}
                      <span className="text-faint">
                        {` · ${new Date(n.createdAt + "Z").toLocaleString()}`}
                      </span>
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                      tierChip[n.tier] ?? "border-hairline bg-panel-2 text-muted"
                    }`}
                  >
                    {n.tier.replace("_", " ")} · <span className="font-mono">{n.score}</span>
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-muted">{n.whyFit}</p>
                {n.emailBody && (
                  <div>
                    <button
                      type="button"
                      className="font-mono text-xs font-semibold text-muted transition-colors hover:text-paper"
                      onClick={() => setOpenEmail(openEmail === n.id ? null : n.id)}
                    >
                      {openEmail === n.id ? "▾ Hide drafted email" : "▸ View drafted email"}
                    </button>
                    {openEmail === n.id && (
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-md border border-hairline bg-ink p-3 font-mono text-xs leading-relaxed text-paper/85">
                        {`Subject: ${n.emailSubject}\n\n${n.emailBody}`}
                      </pre>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
