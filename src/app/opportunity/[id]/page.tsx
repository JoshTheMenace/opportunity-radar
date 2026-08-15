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
        <Link
          href="/"
          className="font-mono text-xs text-faint transition-colors hover:text-paper"
        >
          ← Back to your matches
        </Link>
        <h1 className="font-display text-2xl font-semibold text-paper sm:text-3xl">
          {o.title}
        </h1>
        <p className="font-mono text-xs text-muted">
          {o.agency}
          {o.agencyCode ? ` (${o.agencyCode})` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <Chip>{o.kind.replace(/_/g, "/")}</Chip>
          <Chip>{o.source.replace(/_/g, ".")}</Chip>
          <Chip>{o.status}</Chip>
        </div>
      </header>

      {/* key facts — instrument readout band */}
      <section
        id="opp-facts"
        className="grid grid-cols-2 divide-hairline rounded-lg border border-hairline bg-panel sm:grid-cols-4 sm:divide-x"
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
      <Section id="opp-about" title="ABOUT THIS PROGRAM">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-paper/85">
          {o.description || "No description provided by the source."}
        </p>
      </Section>

      {o.eligibilityText && (
        <Section id="opp-eligibility" title="WHO'S ELIGIBLE (OFFICIAL TEXT)">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-paper/85">
            {o.eligibilityText}
          </p>
        </Section>
      )}

      {/* contact + source link */}
      <Section id="opp-contact" title="CONTACT & OFFICIAL NOTICE">
        <div className="space-y-1 text-sm text-paper/85">
          {o.contactName && <p>{o.contactName}</p>}
          {o.contactEmail && (
            <a
              href={`mailto:${o.contactEmail}`}
              className="text-muted underline transition-colors hover:text-paper"
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
                className="text-muted underline transition-colors hover:text-paper"
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
    </main>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-hairline px-2.5 py-0.5 font-mono text-[11px] text-muted">
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
    <div className="p-3.5">
      <p
        className={`font-mono text-lg font-semibold ${
          money ? "text-treasury" : alert ? "text-signal" : "text-paper"
        }`}
      >
        {value}
      </p>
      <p className="mt-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
        {label}
      </p>
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="space-y-2 rounded-lg border border-hairline bg-panel p-4">
      <h2 className="font-mono text-[10px] font-medium tracking-[0.18em] text-faint">{title}</h2>
      {children}
    </section>
  );
}
