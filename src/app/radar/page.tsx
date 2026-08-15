"use client";

// The Radar dashboard: monitored companies + the live notification feed,
// framed as the founder's daily funding brief. Presentation follows the
// Catalyst identity; polling and data shapes are unchanged.

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

// Tier chips: good = money/pass, warn = needs a look. Never decorative.
const tierChip: Record<string, string> = {
  likely_fit: "bg-good-soft text-good",
  verify_eligibility: "bg-warn-soft text-warn",
};

// Status dot beside each notification row, matching its tier chip.
const tierDot: Record<string, string> = {
  likely_fit: "bg-good",
  verify_eligibility: "bg-warn",
};

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-faint">
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
          <h1 className="text-3xl font-bold tracking-tight text-ink sm:text-4xl">
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
          <h2 className="text-lg font-bold tracking-tight text-ink">Monitored companies</h2>
          <span className="font-mono text-xs text-faint">{companies.length}</span>
          <div className="h-px flex-1 bg-hairline" />
        </div>
        {companies.length === 0 ? (
          <p className="rounded-2xl border border-hairline bg-card p-5 text-sm text-muted shadow-card">
            No companies saved yet — run an analysis and hit Save &amp; monitor.
          </p>
        ) : (
          <ul className="divide-y divide-hairline rounded-2xl border border-hairline bg-card shadow-card">
            {companies.map((c) => (
              <li key={c.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-semibold text-ink">{c.name}</span>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 font-mono text-[11px] font-semibold ${
                      c.completeness.monitorable
                        ? "bg-good-soft text-good"
                        : "bg-warn-soft text-warn"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        c.completeness.monitorable ? "animate-pulse bg-good" : "bg-warn"
                      }`}
                    />
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
          <h2 className="text-lg font-bold tracking-tight text-ink">Notifications</h2>
          <span className="font-mono text-xs text-faint">{notifications.length}</span>
          <div className="h-px flex-1 bg-hairline" />
        </div>
        {notifications.length === 0 ? (
          <p className="rounded-2xl border border-hairline bg-card p-5 text-sm text-muted shadow-card">
            Nothing new for your companies yet. The radar checks every cycle — you don&apos;t have
            to.
          </p>
        ) : (
          <ul className="divide-y divide-hairline rounded-2xl border border-hairline bg-card shadow-card">
            {notifications.map((n, i) => (
              <li
                key={n.id}
                className="card-in space-y-2 px-5 py-4"
                style={{ animationDelay: `${Math.min(i * 60, 420)}ms` }}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-2.5">
                    <span
                      aria-hidden
                      className={`mt-1.5 h-2 w-2 flex-none rounded-full ${tierDot[n.tier] ?? "bg-faint"}`}
                    />
                    <div className="min-w-0 space-y-1">
                      <Eyebrow>New match · {n.companyName}</Eyebrow>
                      <p className="font-semibold text-ink">
                        {n.opportunity?.url ? (
                          <a
                            className="transition-colors hover:text-accent hover:underline"
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
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 font-mono text-[11px] font-semibold uppercase ${
                      tierChip[n.tier] ?? "bg-bg text-muted"
                    }`}
                  >
                    {n.tier.replace("_", " ")} · <span>{n.score}</span>
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-muted">{n.whyFit}</p>
                {n.emailBody && (
                  <div>
                    <button
                      type="button"
                      className="font-mono text-xs font-semibold text-brand transition-colors hover:text-brand-strong"
                      onClick={() => setOpenEmail(openEmail === n.id ? null : n.id)}
                    >
                      {openEmail === n.id ? "▾ Hide drafted email" : "▸ View drafted email"}
                    </button>
                    {openEmail === n.id && (
                      <pre className="mt-2 overflow-x-auto whitespace-pre-wrap rounded-xl border border-hairline bg-[#FBFCFE] p-3.5 font-mono text-xs leading-relaxed text-ink/85">
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
