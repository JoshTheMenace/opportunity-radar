// Web-research backend: Gemini REST generateContent with Google Search
// grounding (same GEMINI_API_KEY + raw-fetch pattern as the voice module;
// no SDK). Used ONLY by the dream researcher — interactive analysis never
// touches the network beyond the cached DB.

export interface WebResearchResult {
  text: string;
  sources: { title: string; url: string }[];
}

const HOST = "generativelanguage.googleapis.com";

export async function researchComplete(prompt: string): Promise<WebResearchResult> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY missing — dream research needs it (.env.local)");
  // gemini-flash-latest = stable alias this key can always reach (probed live).
  const model = process.env.GEMINI_TEXT_MODEL ?? "gemini-flash-latest";
  const res = await fetch(
    `https://${HOST}/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        tools: [{ google_search: {} }],
        generationConfig: { temperature: 0.2 },
      }),
    },
  );
  if (!res.ok) throw new Error(`gemini research ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = (await res.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
      groundingMetadata?: { groundingChunks?: Array<{ web?: { uri?: string; title?: string } }> };
    }>;
  };
  const cand = data.candidates?.[0];
  const text = (cand?.content?.parts ?? []).map((p) => p.text ?? "").join("");
  const sources = (cand?.groundingMetadata?.groundingChunks ?? [])
    .map((c) => ({ title: c.web?.title ?? "", url: c.web?.uri ?? "" }))
    .filter((s) => s.url)
    .slice(0, 8);
  return { text, sources };
}
