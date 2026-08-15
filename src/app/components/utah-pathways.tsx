"use client";

import type { UtahNavigator, UtahPathContext, UtahPrecedent } from "@/lib/types";
import { fmtUsd } from "./shared";

function PrecedentCard({ item }: { item: UtahPrecedent }) {
  const record = item.representativeRecords[0] ?? {};
  const title = String(record.title ?? record.award_title ?? record.description ?? "Representative documented award");
  const source = String(record.source_url ?? item.sourceUrl ?? "");
  return (
    <article className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">{item.pathKind === "grant" ? "Grant precedent" : "Contract precedent"}</p>
          <h3 className="mt-1 text-sm font-semibold text-neutral-100">{item.company}</h3>
          <p className="text-xs text-neutral-500">{item.city ?? "Utah"} · {item.awardCount} documented {item.pathKind === "grant" ? "award" : "contract"}{item.awardCount === 1 ? "" : "s"}</p>
        </div>
        {source && <a className="text-xs text-sky-300 hover:text-sky-200" href={source} target="_blank" rel="noreferrer">Source ↗</a>}
      </div>
      {item.industryTags.length > 0 && <p className="mt-2 text-xs text-neutral-400">{item.industryTags.slice(0, 3).join(" · ").replaceAll("_", " ")}</p>}
      <p className="mt-2 text-xs text-neutral-300">{title.slice(0, 170)}{title.length > 170 ? "…" : ""}</p>
      <p className="mt-2 text-xs font-medium text-neutral-400">{fmtUsd(item.totalAmountUsd)} documented obligation / award total</p>
    </article>
  );
}

function NavigatorCard({ item }: { item: UtahNavigator }) {
  const email = item.publicContact?.email;
  return (
    <article className="rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-300">Utah navigator</p>
      <h3 className="mt-1 text-sm font-semibold text-neutral-100">{item.name}</h3>
      <p className="text-xs text-neutral-500">{[item.title, item.organization].filter(Boolean).join(" · ")}</p>
      {item.summary && <p className="mt-2 text-xs text-neutral-300">{item.summary}</p>}
      <div className="mt-2 flex gap-3 text-xs">
        {email && <a className="text-sky-300 hover:text-sky-200" href={`mailto:${email}`}>Email ↗</a>}
        {item.sourceUrl && <a className="text-sky-300 hover:text-sky-200" href={item.sourceUrl} target="_blank" rel="noreferrer">Source ↗</a>}
      </div>
    </article>
  );
}

export default function UtahPathways({ context }: { context: UtahPathContext }) {
  const hasPrecedents = context.grantPrecedents.length + context.contractPrecedents.length > 0;
  if (!hasPrecedents && context.navigators.length === 0) return null;
  return (
    <section className="space-y-3 rounded-lg border border-sky-500/30 bg-sky-500/5 p-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-sky-300">Utah path connections</p>
        <h2 className="mt-1 text-base font-bold text-neutral-100">People and precedents that help you understand the route</h2>
        <p className="mt-1 text-xs text-neutral-400">These are documented local precedents and public program routes—not endorsements, funding promises, or guaranteed introductions.</p>
      </div>
      {context.exactCompanyPaths.length > 0 && <p className="rounded bg-sky-950/40 p-2 text-xs text-sky-100">We found a direct local-company match with documented {context.exactCompanyPaths[0].pathKind} peers. The cards below show the underlying sources.</p>}
      {context.grantPrecedents.length > 0 && <div className="space-y-2"><h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Comparable grant paths</h3><div className="grid gap-2 md:grid-cols-2">{context.grantPrecedents.map((item) => <PrecedentCard key={item.id} item={item} />)}</div></div>}
      {context.contractPrecedents.length > 0 && <div className="space-y-2"><h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">Comparable federal-contract paths</h3><div className="grid gap-2 md:grid-cols-2">{context.contractPrecedents.map((item) => <PrecedentCard key={item.id} item={item} />)}</div></div>}
      {context.navigators.length > 0 && <div className="space-y-2"><h3 className="text-xs font-semibold uppercase tracking-wide text-neutral-400">People and programs who can help</h3><div className="grid gap-2 md:grid-cols-2">{context.navigators.map((item) => <NavigatorCard key={item.id} item={item} />)}</div></div>}
    </section>
  );
}
