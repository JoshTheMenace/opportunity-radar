import type { CompanyProfile, GateField } from "@/lib/types";
import { runAnalysis, sseResponse } from "../engine-facade";

export const runtime = "nodejs";

const GATE_FIELDS: readonly GateField[] = [
  "employees",
  "isForProfit",
  "isSmallBusiness",
  "majorityUsOwned",
  "hasActiveRnD",
  "annualRevenueUsd",
  "location",
  "samRegistered",
  "productMaturity",
];

function toNumber(v: unknown): number | null {
  const n = Number(String(v).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? n : null;
}

function toBool(v: unknown): boolean {
  return typeof v === "boolean" ? v : /^(y|yes|true|1)$/i.test(String(v).trim());
}

/** Fold an interview answer into the profile (the field is a GateField). */
function applyAnswer(
  profile: CompanyProfile,
  field: GateField,
  answer: unknown,
): CompanyProfile {
  const p = { ...profile };
  switch (field) {
    case "employees":
      p.employees = toNumber(answer);
      break;
    case "annualRevenueUsd":
      p.annualRevenueUsd = toNumber(answer);
      break;
    case "isForProfit":
      p.isForProfit = toBool(answer);
      break;
    case "isSmallBusiness":
      p.isSmallBusiness = toBool(answer);
      break;
    case "majorityUsOwned":
      p.majorityUsOwned = toBool(answer);
      break;
    case "hasActiveRnD":
      p.hasActiveRnD = toBool(answer);
      break;
    case "samRegistered":
      p.samRegistered = toBool(answer);
      break;
    case "productMaturity":
      p.productMaturity = String(answer);
      break;
    case "location": {
      // Accept "City, ST" or just "ST".
      const [a, b] = String(answer).split(",").map((s) => s.trim());
      p.location = b ? { city: a || null, state: b } : { city: null, state: a || null };
      break;
    }
  }
  return p;
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as {
    profile?: CompanyProfile;
    field?: string;
    answer?: unknown;
  } | null;
  const { profile, field, answer } = body ?? {};
  if (!profile?.description || !GATE_FIELDS.includes(field as GateField)) {
    return Response.json(
      { error: "profile (with description) and a valid gate field are required" },
      { status: 400 },
    );
  }
  const updated = applyAnswer(profile, field as GateField, answer);
  return sseResponse((emit) => runAnalysis(updated.description, updated, emit));
}
