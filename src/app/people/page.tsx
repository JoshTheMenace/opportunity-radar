import type { Metadata } from "next";
import Link from "next/link";
import UtahPathways from "../components/utah-pathways";
import { getUtahContext } from "@/lib/engine/utah-intelligence";
import { listCompanies } from "@/lib/monitor/db";

export const metadata: Metadata = {
  title: "People & Paths",
  description: "Public Utah navigators and documented grant and contracting precedents.",
};

export default function PeoplePage() {
  const company = [...listCompanies()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  if (!company) {
    return (
      <main className="mx-auto w-full max-w-3xl space-y-4 px-4 py-10 sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">People & Paths</p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Start with your company profile.</h1>
        <p className="text-sm leading-relaxed text-muted">This focused directory connects a saved company with public Utah navigators and documented local grant and federal-contract precedents. It never implies an endorsement or promised introduction.</p>
        <Link href="/" className="inline-block rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white">Analyze my company →</Link>
      </main>
    );
  }
  const context = getUtahContext(company.profile);
  return (
    <main className="mx-auto w-full max-w-[1200px] space-y-6 px-4 py-8 sm:px-6 lg:px-10">
      <header className="max-w-3xl space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-brand">People & Paths</p>
        <h1 className="font-display text-3xl font-bold tracking-tight text-ink">Relevant Utah people and proven paths for {company.name}</h1>
        <p className="text-sm leading-relaxed text-muted">Public contacts, program routes, and comparable Utah companies selected for this profile. These are starting points for research and outreach—not funding commitments.</p>
      </header>
      <UtahPathways context={context} />
    </main>
  );
}
