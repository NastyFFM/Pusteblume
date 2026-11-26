import { DEFAULT_SHAPE, type RoseColor, type RoseShape } from "../../shared/card";

/**
 * Datenmodell der Rose. Bewusst renderer-neutral gehalten:
 * Heute liefert `shape` einen SVG-Pfad, später einen Ausschnitt aus einem
 * Sprite-Atlas (mit per Blob-Detection ermitteltem Pivot). Physik und
 * Interaktion arbeiten nur mit Pivot, Winkel, Radius und Größe.
 */

export interface Point {
  x: number;
  y: number;
}

export type PetalShape =
  | {
      kind: "path";
      /** Pfad in lokalen Koordinaten; der Pivot (Ansatz am Blütenboden) liegt bei (0,0), die Spitze zeigt nach -y. */
      d: string;
      /** Optionale Glanzkante am oberen Rand. */
      rim?: string;
      pivot: Point;
    }
  | {
      kind: "sprite";
      url: string;
      /** Ausschnitt im Atlas in Pixeln. */
      x: number;
      y: number;
      width: number;
      height: number;
      /** Pivot in Pixeln relativ zum Ausschnitt. */
      pivot: Point;
      /** Drehung in Grad, damit die Spitze nach -y zeigt. */
      rotation: number;
    };

export interface Petal {
  id: number;
  /** 0 = innerster Ring */
  ring: number;
  /** Position um die Blütenmitte in Grad; 0 = oben, im Uhrzeigersinn */
  angle: number;
  /** Abstand des Pivots von der Mitte */
  radius: number;
  /** Skalierung des Blatts */
  size: number;
  /** Zusätzliche Drehung um den Pivot in Grad */
  tilt: number;
  /** Reihenfolge beim Wegfliegen, 0..1 (außen zuerst) */
  releaseAt: number;
  /** Neigung gegen die Horizontale in Grad (90 = senkrecht stehend), für die 3D-Ansicht */
  elevation: number;
  /** Höhe der Basis über dem Blütenboden, für die 3D-Ansicht */
  lift: number;
  /** Blattlänge in Modell-Einheiten */
  length: number;
  shape: PetalShape;
}

export interface Leaf {
  angle: number;
  radius: number;
  size: number;
  tilt: number;
  d: string;
  vein: string;
}

export interface RoseModel {
  /** Blüten-Radius in Modell-Einheiten (viewBox ist -150..150) */
  radius: number;
  /** Standard-Kamera: Höhenwinkel in Grad (90 = von oben) */
  defaultElevation: number;
  petals: Petal[];
  leaves: Leaf[];
}

export interface Palette {
  deep: string;
  base: string;
  mid: string;
  tip: string;
  rim: string;
  /** Farbe für die Blütenmitte */
  heart: string;
}

export const PALETTES: Record<RoseColor, Palette> = {
  red: { deep: "#5a0716", base: "#a30f2a", mid: "#d61f42", tip: "#ef5a74", rim: "#ffb7c4", heart: "#3f0410" },
  white: { deep: "#b9a784", base: "#dccfb5", mid: "#f3ecdc", tip: "#fffdf7", rim: "#ffffff", heart: "#c9b891" },
  yellow: { deep: "#9a5200", base: "#dc9400", mid: "#f6c121", tip: "#ffde6b", rim: "#fff6c2", heart: "#7a4100" },
};

/** Deterministischer Zufall, damit Vorschau und Karte dieselbe Rose zeigen. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Blütenblatt-Pfad. `openness` 0 = schmal und eingerollt (innen), 1 = breit entfaltet (außen).
 * Basis bei (0,0), Spitze bei (0,-h).
 */
function petalPath(h: number, openness: number): { d: string; rim: string } {
  const w = h * (0.62 + openness * 0.5);
  const notch = 0.86 + (1 - openness) * 0.1; // innere Blätter haben kaum Kerbe
  const bulge = 0.5 + openness * 0.12;
  const d = [
    `M 0 0`,
    `C ${-w * 0.5} ${-h * 0.04}, ${-w * 0.66} ${-h * bulge}, ${-w * 0.45} ${-h * 0.84}`,
    `C ${-w * 0.33} ${-h * 1.02}, ${-w * 0.12} ${-h * 1.0}, 0 ${-h * notch}`,
    `C ${w * 0.12} ${-h * 1.0}, ${w * 0.33} ${-h * 1.02}, ${w * 0.45} ${-h * 0.84}`,
    `C ${w * 0.66} ${-h * bulge}, ${w * 0.5} ${-h * 0.04}, 0 0`,
    `Z`,
  ].join(" ");
  const rim = `M ${-w * 0.4} ${-h * 0.8} C ${-w * 0.25} ${-h * 0.93}, ${w * 0.25} ${-h * 0.93}, ${w * 0.4} ${-h * 0.8}`;
  return { d, rim };
}

function leafPath(len: number): { d: string; vein: string } {
  const w = len * 0.42;
  const d = [
    `M 0 0`,
    `C ${-w * 0.9} ${-len * 0.15}, ${-w * 1.1} ${-len * 0.62}, 0 ${-len}`,
    `C ${w * 1.1} ${-len * 0.62}, ${w * 0.9} ${-len * 0.15}, 0 0 Z`,
  ].join(" ");
  const vein = `M 0 ${-len * 0.05} L 0 ${-len * 0.92}`;
  return { d, vein };
}

export interface RingSpec {
  count: number;
  radius: number;
  height: number;
  openness: number;
  tilt: number;
  /** Neigung der Blätter gegen die Horizontale in Grad (3D-Ansicht); 0 = flach liegend */
  elevation?: number;
  /** Höhe der Blattbasis (3D-Ansicht) */
  lift?: number;
}

/** Ringe von innen nach außen (SVG-Rose). */
export const SVG_RINGS: RingSpec[] = [
  { count: 4, radius: 3, height: 17, openness: 0, tilt: 58 },
  { count: 5, radius: 7, height: 25, openness: 0.08, tilt: 48 },
  { count: 6, radius: 13, height: 33, openness: 0.22, tilt: 34 },
  { count: 8, radius: 22, height: 43, openness: 0.42, tilt: 22 },
  { count: 10, radius: 34, height: 53, openness: 0.62, tilt: 13 },
  { count: 12, radius: 48, height: 61, openness: 0.84, tilt: 7 },
  { count: 14, radius: 64, height: 66, openness: 1, tilt: 3 },
];

/** Ring-Index der Herzscheibe: liegt über Ring 2, unter Ring 0 und 1. */
export const HEART_RING = 1.5;

/**
 * Blütenform auf die Ringe anwenden.
 * - petals: Blattzahl proportional auf die Ringe verteilt (innen mindestens 3)
 * - openness: Radius und (3D) Neigung; 0 = eng stehende Knospe, 1 = weit aufgeklappt
 * - spread: Radius-Skalierung
 * - twist: Stärke der spiraligen Drehung
 */
export function applyShape(rings: RingSpec[], shape: RoseShape): RingSpec[] {
  const baseTotal = rings.reduce((n, r) => n + r.count, 0);
  const factor = shape.petals / baseTotal;
  const o = shape.openness;
  return rings.map((r, i) => {
    const count = Math.max(i === 0 ? 3 : 2, Math.round(r.count * factor));
    // Bei wenigen Blättern deutlich größere, damit die Blüte geschlossen bleibt.
    const height = r.height * (factor < 1 ? 1 + (1 - factor) * 0.5 : 1);
    const radius = r.radius * (0.55 + 0.9 * o) * shape.spread;
    const elevation = r.elevation === undefined ? undefined : Math.max(4, Math.min(102, r.elevation + (0.5 - o) * 56));
    const tilt = r.tilt * (shape.twist * 2);
    return { ...r, count, height, radius, elevation, tilt };
  });
}

export function createRoseModel(seed = 7, baseRings: RingSpec[] = SVG_RINGS, defaultElevation = 90, shape: RoseShape = DEFAULT_SHAPE): RoseModel {
  let RINGS = applyShape(baseRings, shape);
  // Gesamtgröße begrenzen: Die Blüte muss in den Zeichenbereich (Radius 150) passen.
  const outerRing = RINGS[RINGS.length - 1]!;
  const outerRadius = outerRing.radius + outerRing.height * 0.95;
  if (outerRadius > 140) {
    const k = 140 / outerRadius;
    RINGS = RINGS.map((r) => ({ ...r, radius: r.radius * k, height: r.height * k }));
  }
  const rnd = mulberry32(seed);
  const petals: Petal[] = [];
  let id = 0;

  RINGS.forEach((ring, ringIndex) => {
    const offset = rnd() * 360;
    for (let i = 0; i < ring.count; i++) {
      const jitter = (rnd() - 0.5) * (360 / ring.count) * 0.35;
      const { d, rim } = petalPath(ring.height, ring.openness * (0.8 + 0.2 * shape.openness));
      petals.push({
        id: id++,
        ring: ringIndex,
        angle: (offset + (360 / ring.count) * i + jitter) % 360,
        radius: ring.radius * (0.92 + rnd() * 0.16),
        size: 0.94 + rnd() * 0.12,
        // Alle Blätter drehen in dieselbe Richtung: ergibt die typische Rosen-Spirale.
        tilt: ring.tilt + (rnd() - 0.5) * 8,
        releaseAt: 0, // wird unten gesetzt
        elevation: ring.elevation ?? 0,
        lift: ring.lift ?? 0,
        length: ring.height,
        shape: { kind: "path", d, rim, pivot: { x: 0, y: 0 } },
      });
    }
  });

  // Herzscheibe: deckt die Mitte ab, fliegt als Letztes.
  const heartR = 11;
  petals.push({
    id: id++,
    ring: HEART_RING,
    angle: 0,
    radius: 0,
    size: 1,
    tilt: 0,
    releaseAt: 1,
    elevation: 0,
    lift: RINGS[0]?.lift ?? 0,
    length: heartR * 2,
    shape: {
      kind: "path",
      d: `M ${-heartR} 0 a ${heartR} ${heartR} 0 1 0 ${heartR * 2} 0 a ${heartR} ${heartR} 0 1 0 ${-heartR * 2} 0 Z`,
      pivot: { x: 0, y: 0 },
    },
  });

  // Reihenfolge: äußere Ringe zuerst, innerhalb eines Rings zufällig; Herz zuletzt.
  const order = petals.filter((p) => p.ring !== HEART_RING).sort((a, b) => b.ring - a.ring || rnd() - 0.5);
  order.forEach((p, i) => (p.releaseAt = (i + 1) / (order.length + 1)));

  const leaves: Leaf[] = [52, 128, 205, 290, 340].map((angle, i) => {
    const len = 78 + ((i * 37) % 23);
    return { angle: angle + (rnd() - 0.5) * 10, radius: 46, size: 1, tilt: (rnd() - 0.5) * 14, ...leafPath(len) };
  });

  const outer = RINGS[RINGS.length - 1]!;
  return { radius: outer.radius + outer.height * 0.95, defaultElevation, petals, leaves };
}

/** Weltposition des Pivots eines Blatts (Blütenmitte = Ursprung, Winkel 0 = oben). */
export function petalPivotWorld(p: Pick<Petal, "angle" | "radius">): Point {
  const a = ((p.angle - 90) * Math.PI) / 180;
  return { x: Math.cos(a) * p.radius, y: Math.sin(a) * p.radius };
}
