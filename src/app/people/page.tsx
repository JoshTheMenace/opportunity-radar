// /people — Utah funding connections for the most recently saved company:
// public navigators, the UTIF microgrant route, and documented precedents.
// Server component; reads the saved profile and the Utah intelligence tables.

import type { Metadata } from "next";
import Link from "next/link";
import UtahPathways from "../components/utah-pathways";
import { getUtahContext } from "@/lib/engine/utah-intelligence";
import { listCompanies } from "@/lib/monitor/db";

export const metadata: Metadata = {
  title: "People — Utah Funding Connections",
  description: "Public Utah navigators and documented grant and contracting precedents.",
};

export const dynamic = "force-dynamic";

export default function PeoplePage() {
  const company = [...listCompanies()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!company) {
    return (
      <main className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-10">
        <div className="card mx-auto max-w-2xl space-y-4 p-6 sm:p-8">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
            Utah funding connections
          </p>
          <h1 className="font-display text-[26px] font-bold tracking-tight text-ink">
            Start with your company profile.
          </h1>
          <p className="text-[14px] leading-relaxed text-muted">
            This focused directory connects a saved company with public Utah navigators and
            documented Utah grant and federal-contract precedents. It never implies an endorsement
            or promised introduction.
          </p>
          <Link
            href="/"
            className="inline-block rounded-xl bg-brand px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-brand-strong"
          >
            Analyze my company →
          </Link>
        </div>
      </main>
    );
  }
  const context = getUtahContext(company.profile);
  return (
    <main className="mx-auto w-full max-w-[1440px] space-y-6 px-4 py-6 sm:px-6 lg:px-10">
      <header className="max-w-3xl space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">
          Utah funding connections
        </p>
        <h1 className="font-display text-[28px] font-bold tracking-tight text-ink">
          Relevant Utah people and proven paths for {company.name}
        </h1>
        <p className="text-[14px] leading-relaxed text-muted">
          Public contacts, program routes, and comparable Utah companies selected for this
          profile. These are starting points for research and outreach — not funding commitments.
        </p>
      </header>
      <UtahPathways context={context} />
    </main>
  );
}
