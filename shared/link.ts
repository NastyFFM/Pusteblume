import { validateCard, type CardData } from "./card";

/**
 * Karte vollständig im Link kodieren (kein Backend nötig).
 * Format: base64url(UTF-8 JSON). Nutzt nur APIs, die in allen mobilen Browsern vorhanden sind.
 */

function bytesToBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(text: string): Uint8Array {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeCard(card: CardData): string {
  const compact: Record<string, string> = { c: card.color, m: card.message };
  if (card.from) compact.f = card.from;
  return bytesToBase64Url(new TextEncoder().encode(JSON.stringify(compact)));
}

export function decodeCard(encoded: string): CardData | null {
  try {
    const raw = JSON.parse(new TextDecoder().decode(base64UrlToBytes(encoded))) as Record<string, unknown>;
    const result = validateCard({ color: raw.c, message: raw.m, from: raw.f });
    return result.ok ? result.card : null;
  } catch {
    return null;
  }
}
