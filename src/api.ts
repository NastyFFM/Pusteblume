import type { CardData, StoredCard } from "../shared/card";
import { encodeCard } from "../shared/link";

/** Kurzlinks über die API nur, wenn ausdrücklich aktiviert (VITE_SHORT_LINKS=true). Sonst reiner Frontend-Link. */
export const SHORT_LINKS_ENABLED = import.meta.env.VITE_SHORT_LINKS === "true";

export interface CardLink {
  url: string;
  /** Hinweis, wenn statt Kurzlink der vollständige Link erzeugt wurde. */
  note?: string;
}

/**
 * Erzeugt den Link zu einer Karte: Kurzlink per API, wenn aktiviert und erreichbar,
 * sonst der vollständig kodierte Frontend-Link, der immer funktioniert.
 */
export async function createCardLink(card: CardData): Promise<CardLink> {
  const fallback = `${location.origin}/v/${encodeCard(card)}`;
  if (!SHORT_LINKS_ENABLED) return { url: fallback };
  try {
    return { url: (await createCard(card)).url };
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return { url: fallback, note: `Kurzlink-Dienst nicht erreichbar (${reason}). Stattdessen vollständiger Link erstellt.` };
  }
}

async function parse<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: ({ error?: string } & T) | null = null;
  try {
    data = JSON.parse(text) as { error?: string } & T;
  } catch {
    data = null;
  }
  if (!res.ok) {
    // Plattformfehler (z. B. abgestürzte Function) liefern kein JSON: Rohtext gekürzt anzeigen.
    const detail = data?.error ?? text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
    throw new Error(detail ? `Fehler ${res.status}: ${detail}` : `Fehler ${res.status}`);
  }
  if (!data) throw new Error("Ungültige Antwort vom Server.");
  return data;
}

export async function createCard(card: CardData): Promise<{ id: string; url: string }> {
  const res = await fetch("/api/cards", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(card),
    signal: AbortSignal.timeout(12_000),
  }).catch((err: unknown) => {
    throw new Error(err instanceof Error && err.name === "TimeoutError" ? "Zeitüberschreitung" : "Netzwerkfehler");
  });
  return parse(res);
}

export async function fetchCard(id: string): Promise<StoredCard> {
  const res = await fetch(`/api/cards/${encodeURIComponent(id)}`);
  return parse(res);
}
