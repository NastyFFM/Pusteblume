/** Von Editor, Karte und Link-Kodierung gemeinsam genutztes Datenmodell. */

/** Farben der Blütenblätter, wie im Figma-Design (Farbkreise im Schritt „Wähle eine Farbe“). */
export const CARD_COLORS = ["red", "white", "rosa", "beige", "grey"] as const;
export type CardColor = (typeof CARD_COLORS)[number];

/** Name und Anzeigefarbe je Blattfarbe (Farbkreis). */
export const COLOR_INFO: Record<CardColor, { label: string; hex: string }> = {
  red: { label: "Rot", hex: "#8A020E" },
  white: { label: "Weiß", hex: "#FFFFFF" },
  rosa: { label: "Rosa", hex: "#FF92A2" },
  beige: { label: "Beige", hex: "#F0D4C3" },
  grey: { label: "Grau", hex: "#D9D9D9" },
};

/** @deprecated Alte Rosen-Darstellung; neue Farben werden auf die drei Rosenpaletten abgebildet. */
export const ROSE_COLORS = ["red", "white", "yellow"] as const;
export type RoseColor = (typeof ROSE_COLORS)[number];

/** Vorgefertigte Botschaften (Schritt „Wähle eine Nachricht“), alle gemeinfrei. */
export const QUOTES: readonly { text: string; author: string }[] = [
  { text: "Und doch, welch Glück, geliebt zu werden! Und lieben, Götter, welch ein Glück!", author: "Johann Wolfgang von Goethe" },
  { text: "Du bist wie eine Blume, so hold und schön und rein; ich schau dich an, und Wehmut schleicht mir ins Herz hinein.", author: "Heinrich Heine" },
  { text: "Als ich Dich sah, verliebte ich mich und Du hast gelächelt, weil Du es wusstest.", author: "William Shakespeare" },
  { text: "Zwei Seelen und ein Gedanke, zwei Herzen und ein Schlag.", author: "Friedrich Halm" },
  { text: "Liebe besteht darin, dass zwei Einsamkeiten einander schützen, grenzen und grüßen.", author: "Rainer Maria Rilke" },
];

/** Form der Blüte (alte Rosen-Darstellung); wird von Links weiterhin gelesen. */
export interface RoseShape {
  /** Gesamtzahl der Blütenblätter */
  petals: number;
  /** 0 = fest geschlossene Knospe, 1 = offen (Standard) */
  openness: number;
  /** Größe der Blüte (Radius und Blattgröße), 1 = normal */
  spread: number;
  /** Spiralige Drehung der Blätter, 0 = keine, 1 = stark */
  twist: number;
}

export const SHAPE_LIMITS = {
  petals: { min: 5, max: 110, step: 1 },
  openness: { min: 0, max: 1, step: 0.01 },
  spread: { min: 0.3, max: 1.4, step: 0.01 },
  twist: { min: 0, max: 1, step: 0.01 },
} as const;

export const DEFAULT_SHAPE: RoseShape = { petals: 74, openness: 1, spread: 1, twist: 0.5 };

export interface CardData {
  color: CardColor;
  /** Text der Botschaft (bei Vorlagen der Zitattext) */
  message: string;
  /** Index in QUOTES, wenn eine Vorlage gewählt wurde */
  quote?: number;
  /** Absender (alte Links) bzw. Autor des Zitats */
  from?: string;
  /** Blütenform (alte Links); fehlt sie, gilt DEFAULT_SHAPE */
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

export function isCardColor(value: unknown): value is CardColor {
  return typeof value === "string" && (CARD_COLORS as readonly string[]).includes(value);
}

/** Alte Links kannten rot/weiß/gelb; gelb wird zu beige. */
export function legacyColor(value: unknown): CardColor | null {
  if (value === "yellow") return "beige";
  return isCardColor(value) ? value : null;
}

/** Neue Farbe auf eine Palette der alten Rosen-Darstellung abbilden. */
export function toRoseColor(color: CardColor): RoseColor {
  return color === "beige" ? "yellow" : color === "grey" || color === "white" ? "white" : "red";
}

/** Normalisiert und prüft Eingaben; gibt Fehlertext oder die bereinigten Daten zurück. */
export function validateCard(input: unknown): { ok: true; card: CardData } | { ok: false; error: string } {
  if (typeof input !== "object" || input === null) return { ok: false, error: "Ungültige Daten." };
  const o = input as Record<string, unknown>;

  const color = legacyColor(o.color);
  if (!color) return { ok: false, error: "Bitte eine Farbe wählen." };

  // Vorlage: Text und Autor kommen aus QUOTES, damit der Link kurz bleibt.
  if (o.quote !== undefined) {
    const q = typeof o.quote === "number" ? o.quote : Number(o.quote);
    const quote = Number.isInteger(q) ? QUOTES[q] : undefined;
    if (!quote) return { ok: false, error: "Bitte eine Nachricht wählen." };
    return { ok: true, card: { color, message: quote.text, quote: q, from: quote.author } };
  }

  const message = typeof o.message === "string" ? o.message.replace(/\r\n/g, "\n").trim() : "";
  if (!message) return { ok: false, error: "Bitte eine Nachricht wählen." };
  if (message.length > LIMITS.message) return { ok: false, error: `Die Botschaft darf höchstens ${LIMITS.message} Zeichen haben.` };

  const fromRaw = typeof o.from === "string" ? o.from.trim() : "";
  if (fromRaw.length > LIMITS.from) return { ok: false, error: `Der Absender darf höchstens ${LIMITS.from} Zeichen haben.` };

  const shape = o.shape === undefined ? undefined : normalizeShape(o.shape);
  return {
    ok: true,
    card: {
      color,
      message,
      ...(fromRaw ? { from: fromRaw } : {}),
      ...(shape && !isDefaultShape(shape) ? { shape } : {}),
    },
  };
}
