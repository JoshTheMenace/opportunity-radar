import { NextResponse } from "next/server";
import type { CompanyProfile, FutureFit } from "@/lib/types";
import { listCompanies, saveCompany } from "@/lib/monitor/db";
import { profileCompleteness } from "@/lib/monitor/completeness";

export const runtime = "nodejs";

// POST { name, email?, profile, futureFits? } — save/replace a company
// profile and enroll it in monitoring (opt-in by the act of saving).
// futureFits (when the caller has a fresh report) snapshots the "not yet"
// matches so the watcher can notify when the company grows into one.
export async function POST(req: Request) {
  const body = (await req.json()) as {
    name?: string;
    email?: string | null;
    profile?: CompanyProfile;
    futureFits?: FutureFit[];
  };
  if (!body?.profile || typeof body.profile !== "object") {
    return NextResponse.json({ error: "profile required" }, { status: 400 });
  }
  const name = (body.name ?? body.profile.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "company name required" }, { status: 400 });

  const record = saveCompany(
    name,
    body.email?.trim() || null,
    body.profile,
    true,
    Array.isArray(body.futureFits) ? body.futureFits : undefined,
  );
  const completeness = profileCompleteness(record.profile);
  return NextResponse.json({ company: record, completeness });
}

export async function GET() {
  const companies = listCompanies().map((c) => ({
    ...c,
    completeness: profileCompleteness(c.profile),
  }));
  return NextResponse.json({ companies });
}
