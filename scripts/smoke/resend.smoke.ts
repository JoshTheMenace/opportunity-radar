// Live smoke: send the most recent notification email through Resend to
// the company's saved address — rebuilt as the rich Catalyst HTML draft.
// Pass --preview to write the HTML to data/outbox/preview.html instead
// of sending (for a browser check).
// Run: set -a; source .env.local; set +a; pnpm tsx scripts/smoke/resend.smoke.ts

import fs from "fs";
import path from "path";
import { listNotifications, getCompany } from "../../src/lib/monitor/db";
import { getOpportunityById } from "../../src/lib/engine/retrieve";
import { draftMatchEmail } from "../../src/lib/monitor/email";
import { resendEnabled, sendViaResend } from "../../src/lib/monitor/deliver";
import type { RankedMatch } from "../../src/lib/types";

async function main() {
  const n = listNotifications(undefined, 50).find((x) => x.emailSubject && x.emailBody);
  if (!n) throw new Error("no drafted notification emails in the DB — run a watch cycle first");
  const company = getCompany(n.companyId);
  if (!company?.email) throw new Error(`company "${n.companyName}" has no email on file`);
  const opp = getOpportunityById(n.opportunityId);
  if (!opp) throw new Error(`opportunity ${n.opportunityId} not in DB`);

  // Older rows predate email_html — reconstruct the match to re-draft.
  const match: RankedMatch = {
    opportunityId: opp.id,
    tier: n.tier,
    score: n.score,
    whyFit: n.whyFit,
    whatCouldDisqualify: "Confirm SBIR small-business size rules and PI employment requirements before investing application time.",
    whatToVerify: "Current solicitation terms on the official notice.",
    nextSteps: "Open the program page, confirm the current cycle is open, then start a pursuit plan in Opportunity Radar.",
  };
  const email = draftMatchEmail(company, opp, match);

  if (process.argv.includes("--preview")) {
    const file = path.join(process.cwd(), "data", "outbox", "preview.html");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, email.html);
    console.log(`wrote ${file}`);
    return;
  }

  if (!resendEnabled()) throw new Error("RESEND_API_KEY not set — source .env.local first");
  console.log(`sending "${email.subject}" -> ${company.email}`);
  const id = await sendViaResend(company.email, email);
  console.log(`delivered — resend message id ${id}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
