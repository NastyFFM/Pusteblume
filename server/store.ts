import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { StoredCard } from "../shared/card";

export interface CardStore {
  get(id: string): Promise<StoredCard | null>;
  put(card: StoredCard): Promise<void>;
  /** true, wenn die ID bereits belegt ist */
  has(id: string): Promise<boolean>;
}

const KEY_PREFIX = "card:";
const TTL_SECONDS = 60 * 60 * 24 * 365; // ein Jahr

/** Upstash Redis (Vercel Marketplace). Variablennamen beider Varianten werden akzeptiert. */
async function createRedisStore(): Promise<CardStore | null> {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return null;

  const { Redis } = await import("@upstash/redis");
  const redis = new Redis({ url, token });
  return {
    async get(id) {
      const value = await redis.get<StoredCard>(KEY_PREFIX + id);
      return value ?? null;
    },
    async put(card) {
      await redis.set(KEY_PREFIX + card.id, card, { ex: TTL_SECONDS });
    },
    async has(id) {
      return (await redis.exists(KEY_PREFIX + id)) === 1;
    },
  };
}

/** Lokaler Datei-Store für die Entwicklung. Auf Vercel ist das Dateisystem nicht beschreibbar. */
function createFileStore(path = ".data/cards.json"): CardStore {
  async function readAll(): Promise<Record<string, StoredCard>> {
    try {
      return JSON.parse(await readFile(path, "utf8")) as Record<string, StoredCard>;
    } catch {
      return {};
    }
  }
  async function writeAll(all: Record<string, StoredCard>) {
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify(all, null, 2));
  }
  return {
    async get(id) {
      return (await readAll())[id] ?? null;
    },
    async put(card) {
      const all = await readAll();
      all[card.id] = card;
      await writeAll(all);
    },
    async has(id) {
      return id in (await readAll());
    },
  };
}

let storePromise: Promise<CardStore> | null = null;

export function getStore(): Promise<CardStore> {
  storePromise ??= (async () => {
    const redis = await createRedisStore();
    if (redis) return redis;
    if (process.env.VERCEL) {
      throw new Error(
        "Kein Redis konfiguriert. Bitte 'Upstash for Redis' im Vercel Marketplace verbinden (KV_REST_API_URL / KV_REST_API_TOKEN).",
      );
    }
    return createFileStore();
  })();
  return storePromise;
}

/** Nur für Tests: Store ersetzen. */
export function _setStoreForTests(store: CardStore) {
  storePromise = Promise.resolve(store);
}
