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

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6 px-4 py-8">
      {/* header */}
      <header id="opp-header" className="space-y-2">
        <Link href="/" className="text-xs text-neutral-500 hover:text-neutral-300">
          ← Back to your matches
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">{o.title}</h1>
        <p className="text-sm text-neutral-400">
          {o.agency}
          {o.agencyCode ? ` (${o.agencyCode})` : ""}
        </p>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-neutral-700 px-2.5 py-0.5">
            {o.kind.replace(/_/g, "/")}
          </span>
          <span className="rounded-full border border-neutral-700 px-2.5 py-0.5">
            {o.source.replace(/_/g, ".")}
          </span>
          <span className="rounded-full border border-neutral-700 px-2.5 py-0.5">{o.status}</span>
        </div>
      </header>

      {/* key facts */}
      <section id="opp-facts" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Fact
          label="Award range"
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
          alert={close != null && close >= 0 && close <= 30}
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

      {/* pursuit: plan + tracker */}
      <PursuitPanel opportunityId={o.id} />

      {/* about */}
      <Section id="opp-about" title="About this program">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">
          {o.description || "No description provided by the source."}
        </p>
      </Section>

      {o.eligibilityText && (
        <Section id="opp-eligibility" title="Who's eligible (official text)">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-300">
            {o.eligibilityText}
          </p>
        </Section>
      )}

      {/* contact + source link */}
      <Section id="opp-contact" title="Contact & official notice">
        <div className="space-y-1 text-sm text-neutral-300">
          {o.contactName && <p>{o.contactName}</p>}
          {o.contactEmail && (
            <a href={`mailto:${o.contactEmail}`} className="text-blue-400 underline">
              {o.contactEmail}
            </a>
          )}
          {o.url ? (
            <p>
              <a
                href={o.url}
                target="_blank"
                rel="noreferrer"
                className="text-blue-400 underline hover:text-blue-300"
              >
                View the official notice ↗
              </a>
            </p>
          ) : (
            <p className="text-neutral-500">No official URL on record — search the title on the source site.</p>
          )}
          {o.alnNumbers.length > 0 && (
            <p className="text-xs text-neutral-500">ALN: {o.alnNumbers.join(", ")}</p>
          )}
        </div>
      </Section>
    </main>
  );
}

function Fact({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <p className={`text-sm font-bold ${alert ? "text-red-400" : ""}`}>{value}</p>
      <p className="text-xs text-neutral-500">{label}</p>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-2 rounded-lg border border-neutral-800 bg-neutral-900 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-wide text-neutral-500">{title}</h2>
      {children}
    </section>
  );
}
