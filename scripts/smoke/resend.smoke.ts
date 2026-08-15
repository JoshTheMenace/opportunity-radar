// Live smoke: send the most recent drafted notification email through
// Resend to the company's saved address. Verifies the key + sandbox rules.
// Run: set -a; source .env.local; set +a; pnpm tsx scripts/smoke/resend.smoke.ts

import { listNotifications, getCompany } from "../../src/lib/monitor/db";
import { resendEnabled, sendViaResend } from "../../src/lib/monitor/deliver";

async function main() {
  if (!resendEnabled()) throw new Error("RESEND_API_KEY not set — source .env.local first");
  const n = listNotifications(undefined, 50).find((x) => x.emailSubject && x.emailBody);
  if (!n) throw new Error("no drafted notification emails in the DB — run a watch cycle first");
  const company = getCompany(n.companyId);
  if (!company?.email) throw new Error(`company "${n.companyName}" has no email on file`);
  console.log(`sending "${n.emailSubject}" -> ${company.email}`);
  const id = await sendViaResend(company.email, { subject: n.emailSubject!, body: n.emailBody! });
  console.log(`delivered — resend message id ${id}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
