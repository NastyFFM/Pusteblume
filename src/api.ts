import type { CardData, StoredCard } from "../shared/card";

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
  });
  return parse(res);
}

export async function fetchCard(id: string): Promise<StoredCard> {
  const res = await fetch(`/api/cards/${encodeURIComponent(id)}`);
  return parse(res);
}
