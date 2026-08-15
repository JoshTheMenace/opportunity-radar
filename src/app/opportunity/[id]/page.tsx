// Opportunity detail page: everything we know about one program, plus the
// pursuit panel (build a submission plan, then track it to submission).

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOpportunityById } from "@/lib/engine/retrieve";
import { formatUsdCompact } from "@/lib/engine/meter";
import PursuitPanel from "./pursuit-panel";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

function opp(idRaw: string) {
  return getOpportunityById(decodeURIComponent(idRaw));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const o = opp((await params).id);
  return { title: o?.title ?? "Opportunity" };
}

const fmt = (n: number | null) => (n == null ? "—" : formatUsdCompact(n));

function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  return Math.ceil((Date.parse(iso) - Date.now()) / 86400000);
}

export default async function OpportunityPage({ params }: Params) {
  const o = opp((await params).id);
  if (!o) notFound();
  const close = daysUntil(o.closeDate);
  const closeSoon = close != null && close >= 0 && close <= 30;

  return (
    <main className="mx-auto w-full max-w-6xl space-y-6 px-4 py-8">
      {/* header */}
      <header id="opp-header" className="space-y-3">
        <p className="font-mono text-xs text-muted">
          <Link href="/" className="transition-colors hover:text-brand">
            Active grants
          </Link>
          <span className="text-faint"> › </span>
          <span className="text-faint">{o.title}</span>
        </p>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <h1 className="max-w-3xl text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {o.title}
          </h1>
          {o.url && (
            <a
              href={o.url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-full border border-hairline bg-card px-4 py-2 font-mono text-[12.5px] font-semibold text-brand transition-colors hover:bg-soft"
            >
              Review official notice ↗
            </a>
          )}
        </div>
        <p className="font-mono text-[11.5px] uppercase tracking-[0.02em] text-muted">
          {o.agency}
          {o.agencyCode ? ` · ${o.agencyCode}` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <Chip>{o.kind.replace(/_/g, "/")}</Chip>
          <Chip>{o.source.replace(/_/g, ".")}</Chip>
          <Chip>{o.status}</Chip>
        </div>
      </header>

      {/* key facts — stat strip */}
      <section
        id="opp-facts"
        className="grid grid-cols-2 divide-hairline overflow-hidden rounded-xl border border-hairline bg-card shadow-card sm:grid-cols-4 sm:divide-x"
      >
        <Fact
          label="Award range"
          money
          value={
            o.awardFloorUsd != null && o.awardCeilingUsd != null
              ? `${fmt(o.awardFloorUsd)}–${fmt(o.awardCeilingUsd)}`
              : o.awardCeilingUsd != null
                ? `up to ${fmt(o.awardCeilingUsd)}`
                : "unlisted"
          }
        />
        <Fact
          label="Closes"
          value={o.closeDate ? `${o.closeDate}${close != null && close >= 0 ? ` (${close}d)` : ""}` : "rolling"}
          alert={closeSoon}
        />
        <Fact label="Program total" value={fmt(o.estimatedTotalUsd)} />
        <Fact
          label="Expected awards"
          value={
            o.expectedAwards != null
              ? `~${o.expectedAwards}` +
                (o.expectedApplications != null && o.expectedAwards > 0
                  ? ` · 1-in-${Math.max(1, Math.round(o.expectedApplications / o.expectedAwards))} odds`
                  : "")
              : "—"
          }
        />
      </section>

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-5">
          {/* pursuit: plan + tracker */}
          <PursuitPanel opportunityId={o.id} />

          {/* about */}
          <Section id="opp-about" title="ABOUT THIS PROGRAM">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/85">
              {o.description || "No description provided by the source."}
            </p>
          </Section>

          {o.eligibilityText && (
            <Section id="opp-eligibility" title="WHO'S ELIGIBLE (OFFICIAL TEXT)">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/85">
                {o.eligibilityText}
              </p>
            </Section>
          )}
        </div>

        <aside className="space-y-4">
          {/* funding stat card */}
          <Section id="opp-funding" title="FUNDING">
            <p
              className={`text-2xl font-bold tracking-tight ${
                o.awardCeilingUsd != null ? "text-good" : "text-faint"
              }`}
            >
              {o.awardCeilingUsd != null ? `Up to ${fmt(o.awardCeilingUsd)}` : "Unlisted"}
            </p>
            {o.awardFloorUsd != null && (
              <p className="font-mono text-xs text-muted">floor {fmt(o.awardFloorUsd)}</p>
            )}
          </Section>

          {/* deadline timeline */}
          <Section id="opp-deadline" title="DEADLINE TIMELINE">
            {o.closeDate ? (
              <div className="flex items-baseline gap-3 py-1">
                <span className="w-[78px] flex-none font-mono text-[11px] font-semibold text-brand">
                  {o.closeDate}
                </span>
                <p className="text-[13.5px] text-ink">
                  Submission closes{" "}
                  {closeSoon && (
                    <span className="rounded-full bg-risk-soft px-2.5 py-0.5 font-mono text-[11px] font-semibold text-risk">
                      IN {close} DAYS
                    </span>
                  )}
                </p>
              </div>
            ) : (
              <p className="text-[13.5px] text-muted">Rolling — no fixed close date.</p>
            )}
          </Section>

          {/* contact + source link */}
          <Section id="opp-contact" title="CONTACT & OFFICIAL NOTICE">
            <div className="space-y-1.5 text-[13.5px] text-ink/85">
              {o.contactName && <p>{o.contactName}</p>}
              {o.contactEmail && (
                <a
                  href={`mailto:${o.contactEmail}`}
                  className="text-accent underline transition-colors hover:text-brand"
                >
                  {o.contactEmail}
                </a>
              )}
              {o.url ? (
                <p>
                  <a
                    href={o.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-accent underline transition-colors hover:text-brand"
                  >
                    View the official notice ↗
                  </a>
                </p>
              ) : (
                <p className="text-faint">No official URL on record — search the title on the source site.</p>
              )}
              {o.alnNumbers.length > 0 && (
                <p className="font-mono text-xs text-faint">ALN: {o.alnNumbers.join(", ")}</p>
              )}
            </div>
          </Section>
        </aside>
      </div>
    </main>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-hairline bg-card px-3 py-1 font-mono text-[11px] font-semibold text-muted">
      {children}
    </span>
  );
}

function Fact({
  label,
  value,
  money = false,
  alert = false,
}: {
  label: string;
  value: string;
  money?: boolean;
  alert?: boolean;
}) {
  return (
    <div className="px-4 py-3">
      <p
        className={`text-lg font-bold tracking-tight ${
          money && value !== "unlisted" ? "text-good" : alert ? "text-risk" : value === "unlisted" || value === "—" ? "text-faint" : "text-ink"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 font-mono text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">
        {label}
      </p>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-2 rounded-2xl border border-hairline bg-card p-5 shadow-card">
      <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.09em] text-faint">
        {title}
      </h2>
      {children}
    </section>
  );
}
