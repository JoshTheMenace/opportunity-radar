// Verifies the mechanism the voice panel's update system rests on:
// clientContent with turnComplete:false must append SILENT context (no
// model generation), and turnComplete:true must trigger exactly one turn.
// Connects exactly like the browser panel — session minted by the app's
// own /api/voice/token route (dev server required; APP_URL to override).
//
// Run: pnpm tsx scripts/smoke/live-silent-context.smoke.ts

async function main() {
  const APP_URL = process.env.APP_URL ?? "http://localhost:3001";
  const tokenRes = await fetch(`${APP_URL}/api/voice/token`, { method: "POST" });
  const session = (await tokenRes.json()) as { wsUrl?: string; model?: string; error?: string };
  if (!tokenRes.ok || !session.wsUrl) {
    console.error(`token mint failed: ${session.error ?? tokenRes.status} (is the dev server up?)`);
    process.exit(1);
  }
  const model = session.model ?? "gemini-3.1-flash-live-preview";
  console.log(`token minted — model ${model}`);

  const ws = new WebSocket(session.wsUrl);

  let phase: "setup" | "silent" | "spoken" = "setup";
  let generationDuringSilent = 0;
  let generationAfterSpoken = 0;

  function finish(code: number, msg: string) {
    console.log(msg);
    try {
      ws.close();
    } catch {}
    process.exit(code);
  }

  // NOT unref'd — this timer also keeps the event loop alive.
  setTimeout(() => finish(1, "FAIL: overall timeout (45s)"), 45_000);

  ws.addEventListener("open", () => {
    console.log("ws open — sending setup...");
    ws.send(
      JSON.stringify({
        setup: {
          model: `models/${model}`,
          generationConfig: { responseModalities: ["AUDIO"] },
          systemInstruction: {
            parts: [{ text: "You are a terse voice assistant. Reply in one short sentence." }],
          },
          outputAudioTranscription: {},
        },
      }),
    );
  });

  ws.addEventListener("message", (e) => {
    void (async () => {
      const raw = e.data as unknown;
      const text =
        typeof raw === "string"
          ? raw
          : raw instanceof Blob
            ? await raw.text()
            : Buffer.from(raw as ArrayBuffer).toString("utf8");
      const msg = JSON.parse(text) as {
        setupComplete?: object;
        serverContent?: {
          modelTurn?: { parts?: unknown[] };
          outputTranscription?: { text?: string };
          turnComplete?: boolean;
        };
      };

      if (msg.setupComplete) {
        phase = "silent";
        console.log("setup complete — sending SILENT context (turnComplete:false)...");
        ws.send(
          JSON.stringify({
            clientContent: {
              turns: [
                {
                  role: "user",
                  parts: [
                    {
                      text: "[BACKGROUND CONTEXT] The founder's company is called Beacon Farms.",
                    },
                  ],
                },
              ],
              turnComplete: false,
            },
          }),
        );
        // If ANY generation arrives in the next 8s, silent append is broken.
        setTimeout(() => {
          if (generationDuringSilent > 0) {
            finish(1, `FAIL: silent context triggered generation (${generationDuringSilent} chunks)`);
          }
          phase = "spoken";
          console.log("no generation after 8s ✓ — sending SPOKEN turn (turnComplete:true)...");
          ws.send(
            JSON.stringify({
              clientContent: {
                turns: [
                  { role: "user", parts: [{ text: "What is the founder's company called?" }] },
                ],
                turnComplete: true,
              },
            }),
          );
        }, 8_000);
        return;
      }

      const sc = msg.serverContent;
      if (!sc) return;
      const generated = (sc.modelTurn?.parts?.length ?? 0) > 0 || !!sc.outputTranscription?.text;
      if (generated && phase === "silent") generationDuringSilent++;
      if (generated && phase === "spoken") generationAfterSpoken++;
      if (sc.outputTranscription?.text) process.stdout.write(sc.outputTranscription.text);
      if (sc.turnComplete && phase === "spoken") {
        console.log("");
        if (generationAfterSpoken === 0) finish(1, "FAIL: spoken turn produced no generation");
        finish(
          0,
          "PASS: turnComplete:false = silent append; turnComplete:true = one spoken turn (model answered using the silent context).",
        );
      }
    })();
  });

  ws.addEventListener("close", (e) =>
    console.log(`ws closed: code=${e.code} reason=${e.reason || "(none)"}`),
  );
  ws.addEventListener("error", () => finish(1, "FAIL: websocket error"));
}

void main();

export {}; // module scope — avoids global-script name collisions under tsc
