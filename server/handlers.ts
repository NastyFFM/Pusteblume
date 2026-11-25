import { validateCard, type StoredCard } from "../shared/card";
import { ID_PATTERN, shortId } from "./id";
import { getStore } from "./store";

export interface ApiRequest {
  method: string;
  pathname: string;
  body: string;
  /** Scheme + Host des Aufrufs, z. B. https://pusteblume.vercel.app */
  origin: string;
}

export interface ApiResponse {
  status: number;
  body: unknown;
}

const json = (status: number, body: unknown): ApiResponse => ({ status, body });

/**
 * Plattformneutraler Router für /api/cards.
 *   POST /api/cards       -> { id, url }
 *   GET  /api/cards/:id   -> StoredCard
 */
export async function handleCardsRequest(req: ApiRequest): Promise<ApiResponse> {
  const match = /^\/api\/cards(?:\/([^/]+))?\/?$/.exec(req.pathname);
  if (!match) return json(404, { error: "Nicht gefunden." });
  const id = match[1];

  try {
    if (req.method === "POST" && !id) return await createCard(req);
    if (req.method === "GET" && id) return await readCard(id);
    return json(405, { error: "Methode nicht erlaubt." });
  } catch (err) {
    console.error("[api/cards]", err);
    const message = err instanceof Error ? err.message : "Unbekannter Fehler.";
    return json(500, { error: message });
  }
}

async function createCard(req: ApiRequest): Promise<ApiResponse> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(req.body || "{}");
  } catch {
    return json(400, { error: "Ungültiges JSON." });
  }
  const result = validateCard(parsed);
  if (!result.ok) return json(400, { error: result.error });

  const store = await getStore();
  let id = shortId();
  for (let tries = 0; (await store.has(id)) && tries < 5; tries++) id = shortId();

  const card: StoredCard = { id, createdAt: new Date().toISOString(), ...result.card };
  await store.put(card);

  const base = (process.env.PUBLIC_BASE_URL || req.origin).replace(/\/$/, "");
  return json(201, { id, url: `${base}/c/${id}` });
}

async function readCard(id: string): Promise<ApiResponse> {
  if (!ID_PATTERN.test(id)) return json(400, { error: "Ungültige Karten-ID." });
  const store = await getStore();
  const card = await store.get(id);
  if (!card) return json(404, { error: "Diese Karte gibt es nicht (mehr)." });
  return json(200, card);
}
