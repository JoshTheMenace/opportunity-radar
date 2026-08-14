import type { CompanyProfile } from "@/lib/types";
import { runAnalysis, sseResponse } from "../engine-facade";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    founderText?: string;
    prior?: Partial<CompanyProfile> | null;
  } | null;
  const founderText = body?.founderText?.trim();
  if (!founderText) {
    return Response.json({ error: "founderText is required" }, { status: 400 });
  }
  return sseResponse((emit) => runAnalysis(founderText, body?.prior ?? null, emit));
}
