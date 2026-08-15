"use client";

// Region: Utah funding connections — public navigators, the UTIF microgrant
// route, and documented Utah grant/contract precedents for the current
// profile. Context only: nothing here is a ranked, open opportunity.
// Mounted below the report on the map canvas and on /people.

import type { UtahNavigator, UtahPathContext, UtahPrecedent } from "@/lib/types";
import { fmtUsd } from "./shared";

/** Soften ALL-CAPS source strings (same rules as match-card's humanize):
 *  mixed-case passes through; within a shouted string short words keep caps
 *  except common connectors. */
const CONNECTORS = new Set(["OF", "THE", "AND", "FOR", "TO", "IN", "ON", "AT", "A", "AN"]);
function humanize(s: string): string {
  if (/[a-z]/.test(s)) return s;
  return s
    .split(/\s+/)
    .map((w, i) => {
      const letters = w.replace(/[^A-Za-z]/g, "");
      if (letters.length <= 3) return i > 0 && CONNECTORS.has(letters) ? w.toLowerCase() : w;
      return w.charAt(0) + w.slice(1).toLowerCase();
    })
    .join(" ");
}

/** snake_case industry tags → human chip labels ("ai_ml" → "AI / ML"). */
const ACRONYMS = new Set(["ai", "ml", "ar", "vr", "iot", "sbir", "sttr", "rd"]);
function tagLabel(tag: string): string {
  return tag
    .split("_")
    .map((w) => (ACRONYMS.has(w) ? w.toUpperCase() : w))
    .join(" ")
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/^(AI|ML|AR|VR|IOT) /, "$1 / ");
}

function PrecedentCard({ item }: { item: UtahPrecedent }) {
  const record = item.representativeRecords[0] ?? {};
  const title = String(
    record.title ?? record.award_title ?? record.description ?? "Representative documented award",
  );
  const source = String(record.source_url ?? item.sourceUrl ?? "");
  const grant = item.pathKind === "grant";
  return (
    <article className="card flex h-full flex-col p-6 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-3 py-1 text-[12px] font-semibold ${
                grant ? "bg-good-soft text-good" : "bg-twin-soft text-twin"
              }`}
            >
              {grant ? "Grant precedent" : "Contract precedent"}
            </span>
          </div>
          <h3 className="mt-2 font-display text-[17px] font-bold leading-snug tracking-tight text-ink">
            {humanize(item.company)}
          </h3>
          <p className="mt-1 text-[12.5px] text-faint">
            {humanize(item.city ?? "Utah")} · {item.awardCount} documented{" "}
            {grant ? "award" : "contract"}
            {item.awardCount === 1 ? "" : "s"}
          </p>
        </div>
        {source && (
          <a
            className="shrink-0 text-[12px] font-semibold text-brand transition-colors hover:text-brand-strong"
            href={source}
            target="_blank"
            rel="noreferrer"
          >
            Source ↗
          </a>
        )}
      </div>
      {item.industryTags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {/* agency_/branch_/phase_ tags are join keys, not human topics */}
          {item.industryTags
            .filter((tag) => !/^(agency_|branch_|phase_|sbir$|sttr$)/.test(tag))
            .slice(0, 3)
            .map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-surface-low px-3 py-1 text-[12px] font-semibold text-muted"
            >
              {tagLabel(tag)}
            </span>
            ))}
        </div>
      )}
      <p className="mt-3 text-[13px] leading-relaxed text-muted">
        {humanize(title.slice(0, 170))}
        {title.length > 170 ? "…" : ""}
      </p>
      <p className="mt-auto border-t border-hairline pt-3 text-[13px] text-muted">
        <span className="tnum font-mono font-semibold text-ink">{fmtUsd(item.totalAmountUsd)}</span>{" "}
        documented {grant ? "award" : "obligation"} total
      </p>
    </article>
  );
}

function NavigatorCard({ item }: { item: UtahNavigator }) {
  const email = item.publicContact?.email;
  return (
    <article className="card flex h-full flex-col p-6 transition-shadow hover:shadow-md">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
        Utah navigator
      </p>
      <h3 className="mt-1.5 font-display text-[17px] font-bold leading-snug tracking-tight text-ink">
        {humanize(item.name)}
      </h3>
      <p className="mt-1 text-[12.5px] text-faint">
        {[item.title, item.organization].filter(Boolean).map((s) => humanize(String(s))).join(" · ")}
      </p>
      {item.summary && (
        <p className="mt-3 text-[13px] leading-relaxed text-muted">{item.summary}</p>
      )}
      <div className="mt-auto flex gap-4 border-t border-hairline pt-3 text-[12px] font-semibold">
        {email && (
          <a
            className="text-brand transition-colors hover:text-brand-strong"
            href={`mailto:${email}`}
          >
            Email ↗
          </a>
        )}
        {item.sourceUrl && (
          <a
            className="text-brand transition-colors hover:text-brand-strong"
            href={item.sourceUrl}
            target="_blank"
            rel="noreferrer"
          >
            Source ↗
          </a>
        )}
      </div>
    </article>
  );
}

function UtifSupportCard() {
  return (
    <article className="rounded-[1.25rem] border border-good/25 bg-good-soft p-6">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-good">
        Utah SBIR first-timer support
      </p>
      <h3 className="mt-1.5 font-display text-[19px] font-bold tracking-tight text-ink">
        UTIF microgrant: <span className="tnum">$3K–$5K</span> toward your first Phase I proposal
      </h3>
      <p className="mt-2 text-[13px] leading-relaxed text-muted">
        Eligible Utah small businesses can use UTIF funding for first-time SBIR/STTR Phase I
        proposal preparation. Nucleus Grow provides the verified Utah route for topic matching,
        proposal review and editing, registrations, budgeting, and final-submission support.
      </p>
      <p className="mt-3 rounded-xl bg-card/70 px-4 py-2.5 text-[12.5px] leading-relaxed text-ink">
        <span className="font-semibold">Before applying:</span> choose a specific Phase I
        solicitation and contact Nucleus Grow for required pre-approval. The program says
        applications should be submitted at least four weeks before the related federal deadline.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <a
          className="rounded-xl bg-brand px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-strong"
          href="mailto:grow@nucleusutah.org"
        >
          Contact Nucleus Grow →
        </a>
        <a
          className="rounded-xl border border-line bg-card px-4 py-2.5 text-[13.5px] font-medium text-muted transition-colors hover:bg-surface-low"
          href="https://www.nucleusutah.org/utif"
          target="_blank"
          rel="noreferrer"
        >
          UTIF details ↗
        </a>
      </div>
    </article>
  );
}

export default function UtahPathways({ context }: { context: UtahPathContext }) {
  const hasPrecedents = context.grantPrecedents.length + context.contractPrecedents.length > 0;
  if (!hasPrecedents && context.navigators.length === 0) return null;
  return (
    <section className="card space-y-6 p-6">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
          Utah funding connections
        </p>
        <h2 className="mt-2 font-display text-[21px] font-bold tracking-tight text-ink">
          People and precedents that help you understand the route
        </h2>
        <p className="mt-2 max-w-3xl text-[13.5px] leading-relaxed text-muted">
          These are documented Utah precedents and public program routes — not endorsements,
          funding promises, or guaranteed introductions.
        </p>
      </div>
      {context.exactCompanyPaths.length > 0 && (
        <p className="rounded-xl border border-brand/20 bg-soft px-4 py-3 text-[13px] leading-relaxed text-brand-strong">
          We found a direct Utah-company match with documented{" "}
          {context.exactCompanyPaths[0].pathKind} peers. The cards below show the underlying
          sources.
        </p>
      )}
      {context.navigators.length > 0 && (
        <div className="space-y-3">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
              People and programs who can help
            </h3>
            <p className="mt-1 text-[13px] text-muted">
              Nucleus contacts are prioritized because Nucleus Grow is Utah&apos;s official
              SBIR/STTR resource partner.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {context.navigators.map((item) => (
              <NavigatorCard key={item.id} item={item} />
            ))}
          </div>
          <UtifSupportCard />
        </div>
      )}
      {context.grantPrecedents.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
            Comparable grant paths
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {context.grantPrecedents.map((item) => (
              <PrecedentCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
      {context.contractPrecedents.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
            Comparable federal-contract paths
          </h3>
          <div className="grid gap-4 md:grid-cols-2">
            {context.contractPrecedents.map((item) => (
              <PrecedentCard key={item.id} item={item} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
