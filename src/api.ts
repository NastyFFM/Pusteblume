import type { CardData, StoredCard } from "../shared/card";

async function parse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(data.error ?? `Fehler ${res.status}`);
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
