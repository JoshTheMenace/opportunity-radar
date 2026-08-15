// Voice mode (Gemini Live) session auth. All Gemini endpoint knowledge
// lives here. GET = feature detection (no key -> UI hides voice mode).
// POST = mint a short-lived ephemeral token so the real API key never
// reaches the browser; dev-only fallback hands the raw key to localhost.

export const runtime = "nodejs";

const HOST = "generativelanguage.googleapis.com";
// Ephemeral tokens only authenticate against the *Constrained* WS method
// (verified live 2026-08-14); raw API keys use the plain one.
const WS_PATH = (ver: string, method: string) =>
  `wss://${HOST}/ws/google.ai.generativelanguage.${ver}.GenerativeService.${method}`;

const model = () => process.env.GEMINI_LIVE_MODEL ?? "gemini-3.1-flash-live-preview";

export async function GET() {
  return Response.json({ enabled: !!process.env.GEMINI_API_KEY, model: model() });
}

export async function POST() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return Response.json(
      { error: "Voice mode is off — set GEMINI_API_KEY in .env.local" },
      { status: 503 },
    );
  }
  try {
    const res = await fetch(`https://${HOST}/v1alpha/auth_tokens`, {
      method: "POST",
      headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
      body: JSON.stringify({
        uses: 1,
        expireTime: new Date(Date.now() + 30 * 60_000).toISOString(),
        newSessionExpireTime: new Date(Date.now() + 2 * 60_000).toISOString(),
      }),
    });
    const tok = (await res.json().catch(() => ({}))) as { name?: string };
    if (res.ok && tok.name) {
      return Response.json({
        model: model(),
        wsUrl: `${WS_PATH("v1alpha", "BidiGenerateContentConstrained")}?access_token=${encodeURIComponent(tok.name)}`,
      });
    }
    console.warn("voice: ephemeral token mint failed", res.status, tok);
  } catch (err) {
    console.warn("voice: ephemeral token mint failed", err);
  }
  if (process.env.NODE_ENV !== "development") {
    return Response.json({ error: "could not mint a voice session token" }, { status: 502 });
  }
  // Local-dev fallback: raw key in the browser is acceptable on localhost only.
  return Response.json({
    model: model(),
    wsUrl: `${WS_PATH("v1beta", "BidiGenerateContent")}?key=${encodeURIComponent(key)}`,
  });
}
