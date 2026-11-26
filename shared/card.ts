/** Von Editor, Karte und API gemeinsam genutztes Datenmodell. */

export const ROSE_COLORS = ["red", "white", "yellow"] as const;
export type RoseColor = (typeof ROSE_COLORS)[number];

/** Form der Blüte, vom Absender im Editor einstellbar. */
export interface RoseShape {
  /** Gesamtzahl der Blütenblätter */
  petals: number;
  /** 0 = geschlossene Knospe, 1 = voll erblüht */
  openness: number;
  /** Breite der Blüte, 1 = normal */
  spread: number;
  /** Spiralige Drehung der Blätter, 0 = keine, 1 = stark */
  twist: number;
}

export const SHAPE_LIMITS = {
  petals: { min: 12, max: 110, step: 1 },
  openness: { min: 0, max: 1, step: 0.01 },
  spread: { min: 0.6, max: 1.4, step: 0.01 },
  twist: { min: 0, max: 1, step: 0.01 },
} as const;

export const DEFAULT_SHAPE: RoseShape = { petals: 74, openness: 0.5, spread: 1, twist: 0.5 };

export interface CardData {
  color: RoseColor;
  message: string;
  from?: string;
  /** Blütenform; fehlt sie, gilt DEFAULT_SHAPE */
  shape?: RoseShape;
}

function clampNum(value: unknown, lim: { min: number; max: number }, fallback: number): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(lim.max, Math.max(lim.min, n));
}

/** Form bereinigen: unbekannte oder ungültige Werte fallen auf den Standard zurück. */
export function normalizeShape(input: unknown): RoseShape {
  if (typeof input !== "object" || input === null) return { ...DEFAULT_SHAPE };
  const o = input as Record<string, unknown>;
  return {
    petals: Math.round(clampNum(o.petals, SHAPE_LIMITS.petals, DEFAULT_SHAPE.petals)),
    openness: clampNum(o.openness, SHAPE_LIMITS.openness, DEFAULT_SHAPE.openness),
    spread: clampNum(o.spread, SHAPE_LIMITS.spread, DEFAULT_SHAPE.spread),
    twist: clampNum(o.twist, SHAPE_LIMITS.twist, DEFAULT_SHAPE.twist),
  };
}

export function isDefaultShape(shape: RoseShape): boolean {
  return (
    shape.petals === DEFAULT_SHAPE.petals &&
    Math.abs(shape.openness - DEFAULT_SHAPE.openness) < 0.005 &&
    Math.abs(shape.spread - DEFAULT_SHAPE.spread) < 0.005 &&
    Math.abs(shape.twist - DEFAULT_SHAPE.twist) < 0.005
  );
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

  const shape = o.shape === undefined ? undefined : normalizeShape(o.shape);
  return {
    ok: true,
    card: {
      color: o.color,
      message,
      ...(fromRaw ? { from: fromRaw } : {}),
      ...(shape && !isDefaultShape(shape) ? { shape } : {}),
    },
  };
}
