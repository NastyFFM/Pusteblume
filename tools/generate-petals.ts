/**
 * Blättersheet per Vercel AI Gateway erzeugen (Bildmodell).
 *
 *   AI_GATEWAY_API_KEY=... npx tsx tools/generate-petals.ts [ausgabe.png] [--model openai/gpt-image-1]
 *
 * Danach: npx tsx tools/build-atlas.ts <ausgabe.png> <name>
 *
 * Hinweis: Noch ohne Key getestet. Der Gateway ist OpenAI-kompatibel; sollte der
 * Bild-Endpunkt abweichen, nur die URL und das Antwortformat unten anpassen.
 */
import { writeFileSync } from "node:fs";

const PROMPT = [
  "A sprite sheet of 16 individual red rose petals, each petal fully separated with generous white space between them,",
  "arranged in a loose 4 by 4 grid on a pure white background. Top-down studio photo, soft even lighting,",
  "no shadows on the background, no stems, no leaves, no whole flowers.",
  "Include a range from small tightly curled inner petals to large open outer petals,",
  "each petal shown with its narrow base at the bottom and its tip at the top. Photorealistic, sharp focus.",
].join(" ");

async function main() {
  const [out = "tools/fixtures/ai-petal-sheet.png", ...rest] = process.argv.slice(2);
  const modelIdx = rest.indexOf("--model");
  const model = modelIdx >= 0 ? rest[modelIdx + 1]! : "openai/gpt-image-1";
  const key = process.env.AI_GATEWAY_API_KEY;
  if (!key) {
    console.error("AI_GATEWAY_API_KEY fehlt. Bitte als Umgebungsvariable setzen.");
    process.exit(1);
  }
  const res = await fetch("https://ai-gateway.vercel.sh/v1/images/generations", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ model, prompt: PROMPT, size: "1024x1024", n: 1 }),
  });
  if (!res.ok) throw new Error(`Gateway antwortet ${res.status}: ${await res.text()}`);
  const json = (await res.json()) as { data?: { b64_json?: string; url?: string }[] };
  const item = json.data?.[0];
  if (!item) throw new Error("Keine Bilddaten in der Antwort.");
  const bytes = item.b64_json ? Buffer.from(item.b64_json, "base64") : Buffer.from(await (await fetch(item.url!)).arrayBuffer());
  writeFileSync(out, bytes);
  console.log("Bild geschrieben:", out);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
