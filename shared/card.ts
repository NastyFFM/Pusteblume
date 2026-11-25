/** Von Editor, Karte und API gemeinsam genutztes Datenmodell. */

export const ROSE_COLORS = ["red", "white", "yellow"] as const;
export type RoseColor = (typeof ROSE_COLORS)[number];

export interface CardData {
  color: RoseColor;
  message: string;
  from?: string;
}

export interface StoredCard extends CardData {
  id: string;
  createdAt: string;
}

export const LIMITS = {
  message: 400,
  from: 60,
} as const;

export function isRoseColor(value: unknown): value is RoseColor {
  return typeof value === "string" && (ROSE_COLORS as readonly string[]).includes(value);
}

/** Normalisiert und prüft Eingaben; gibt Fehlertext oder die bereinigten Daten zurück. */
export function validateCard(input: unknown): { ok: true; card: CardData } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) return { ok: false, error: "Ungültige Daten." };
  const o = input as Record<string, unknown>;

  if (!isRoseColor(o.color)) return { ok: false, error: "Bitte eine Rosenfarbe wählen." };

  const message = typeof o.message === "string" ? o.message.replace(/\r\n/g, "\n").trim() : "";
  if (!message) return { ok: false, error: "Die Botschaft darf nicht leer sein." };
  if (message.length > LIMITS.message) return { ok: false, error: `Die Botschaft darf höchstens ${LIMITS.message} Zeichen haben.` };

  const fromRaw = typeof o.from === "string" ? o.from.trim() : "";
  if (fromRaw.length > LIMITS.from) return { ok: false, error: `Der Absender darf höchstens ${LIMITS.from} Zeichen haben.` };

  return { ok: true, card: { color: o.color, message, ...(fromRaw ? { from: fromRaw } : {}) } };
}
