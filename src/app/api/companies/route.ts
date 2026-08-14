import { NextResponse } from "next/server";
import type { CompanyProfile } from "@/lib/types";
import { listCompanies, saveCompany } from "@/lib/monitor/db";
import { profileCompleteness } from "@/lib/monitor/completeness";

export const runtime = "nodejs";

// POST { name, email?, profile } — save/replace a company profile and
// enroll it in monitoring (opt-in by the act of saving).
export async function POST(req: Request) {
  const body = (await req.json()) as {
    name?: string;
    email?: string | null;
    profile?: CompanyProfile;
  };
  if (!body?.profile || typeof body.profile !== "object") {
    return NextResponse.json({ error: "profile required" }, { status: 400 });
  }
  const name = (body.name ?? body.profile.name ?? "").trim();
  if (!name) return NextResponse.json({ error: "company name required" }, { status: 400 });

  const record = saveCompany(name, body.email?.trim() || null, body.profile, true);
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
