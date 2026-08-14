// Drafted notification emails. For the hackathon we generate real,
// send-ready messages and write them to data/outbox/ as .eml files
// (and store subject/body on the notification for the Radar feed).
// Wiring an actual provider (Resend/SMTP) is a drop-in replacement
// for deliver(); recipients are opt-in (they saved their profile).

import fs from "fs";
import path from "path";
import type { Opportunity, RankedMatch } from "../types";
import { formatUsdCompact } from "../engine/meter";
import type { CompanyRecord } from "./db";

export interface DraftedEmail {
  subject: string;
  body: string;
}

function awardRange(opp: Opportunity): string {
  if (opp.awardFloorUsd && opp.awardCeilingUsd)
    return `${formatUsdCompact(opp.awardFloorUsd)}–${formatUsdCompact(opp.awardCeilingUsd)}`;
  if (opp.awardCeilingUsd) return `up to ${formatUsdCompact(opp.awardCeilingUsd)}`;
  if (opp.estimatedTotalUsd) return `${formatUsdCompact(opp.estimatedTotalUsd)} program total`;
  return "amount varies";
}

export function draftMatchEmail(
  company: CompanyRecord,
  opp: Opportunity,
  match: RankedMatch,
): DraftedEmail {
  const odds =
    opp.expectedAwards && opp.expectedApplications
      ? `Roughly ${opp.expectedAwards} awards are expected from ~${opp.expectedApplications} applications (about 1-in-${Math.max(1, Math.round(opp.expectedApplications / opp.expectedAwards))} odds).`
      : opp.expectedAwards
        ? `About ${opp.expectedAwards} awards are expected.`
        : null;

  const lines = [
    `Hi ${company.name} team,`,
    ``,
    `Opportunity Radar found a new government funding opportunity that matches your profile:`,
    ``,
    `${opp.title}`,
    `${opp.agency} · ${awardRange(opp)}${opp.closeDate ? ` · closes ${opp.closeDate}` : " · rolling deadline"}`,
    ``,
    `Why this looks like a fit for you:`,
    match.whyFit,
    ``,
    ...(match.whatCouldDisqualify ? [`Worth checking before you invest time:`, match.whatCouldDisqualify, ``] : []),
    ...(odds ? [odds, ``] : []),
    ...(opp.url ? [`Details: ${opp.url}`, ``] : []),
    `Next steps: ${match.nextSteps}`,
    ``,
    `— Opportunity Radar`,
    `You're receiving this because you saved your company profile for monitoring. Reply STOP to unsubscribe.`,
  ];
  return {
    subject: `New funding match: ${opp.title.slice(0, 80)} (${awardRange(opp)})`,
    body: lines.join("\n"),
  };
}

export function writeEmlToOutbox(
  company: CompanyRecord,
  opp: Opportunity,
  email: DraftedEmail,
): string {
  const dir = path.join(process.cwd(), "data", "outbox");
  fs.mkdirSync(dir, { recursive: true });
  const safe = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
  const file = path.join(dir, `${safe(company.name)}--${safe(opp.id)}.eml`);
  const eml = [
    `From: Opportunity Radar <radar@example.local>`,
    `To: ${company.email ?? "unknown@example.local"}`,
    `Subject: ${email.subject}`,
    `Date: ${new Date().toUTCString()}`,
    `Content-Type: text/plain; charset=utf-8`,
    ``,
    email.body,
  ].join("\r\n");
  fs.writeFileSync(file, eml);
  return file;
}
