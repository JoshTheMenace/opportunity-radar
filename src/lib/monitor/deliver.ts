// Real email delivery via Resend's HTTP API — plain fetch, no SDK
// (package.json is frozen). Enabled only when RESEND_API_KEY is set;
// without it the watcher still writes .eml files to data/outbox/ and
// never touches the network. Sandbox rule: until a domain is verified
// in Resend, `from` must stay onboarding@resend.dev and Resend only
// delivers to the account owner's address.

export function resendEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function from(): string {
  return process.env.RESEND_FROM ?? "Opportunity Radar <onboarding@resend.dev>";
}

/** Send one plain-text email. Returns the Resend message id; throws on any
 *  API error (callers decide whether delivery failure is fatal). */
export async function sendViaResend(
  to: string,
  email: { subject: string; body: string },
): Promise<string> {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not set (.env.local)");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: from(), to: [to], subject: email.subject, text: email.body }),
  });
  const data = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
  if (!res.ok || !data.id)
    throw new Error(`Resend ${res.status}: ${data.message ?? "no message id returned"}`);
  return data.id;
}
