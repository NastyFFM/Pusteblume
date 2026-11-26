import type { PetalAtlas } from "../../shared/atlas";
import type { RoseColor } from "../../shared/card";
import { createRoseModel, type Petal, type RingSpec, type RoseModel } from "./model";

/**
 * Ringe für Sprite-Rosen. Innen mehr und größere Blätter als beim SVG-Modell, weil echte
 * Innenblätter eingerollt und schmal sind und sich in der Mitte überlappen müssen.
 */
const SPRITE_RINGS: RingSpec[] = [
  // Die innersten Blätter lehnen leicht über die Mitte (Neigung > 90°), wie bei einer echten Rose.
  { count: 8, radius: 5, height: 36, openness: 0, tilt: 30, elevation: 96, lift: 10 },
  { count: 9, radius: 9, height: 42, openness: 0.08, tilt: 26, elevation: 86, lift: 8 },
  { count: 10, radius: 15, height: 48, openness: 0.22, tilt: 20, elevation: 74, lift: 6 },
  { count: 10, radius: 23, height: 54, openness: 0.42, tilt: 14, elevation: 60, lift: 4 },
  { count: 11, radius: 33, height: 58, openness: 0.62, tilt: 9, elevation: 46, lift: 2 },
  { count: 12, radius: 45, height: 62, openness: 0.84, tilt: 5, elevation: 32, lift: 0 },
  { count: 14, radius: 58, height: 66, openness: 1, tilt: 3, elevation: 18, lift: -2 },
];

/** Dreiviertel-Ansicht als Standard für Sprite-Rosen */
const SPRITE_ELEVATION = 48;

/**
 * Rosenmodell mit Sprite-Blättern aus einem Atlas.
 * Ringe, Winkel, Radien und Reihenfolge kommen aus dem SVG-Modell; nur die Form
 * jedes Blatts wird durch einen Atlas-Ausschnitt ersetzt. Die Blattlänge im Modell
 * ergibt sich aus Ring-Höhe / Sprite-Länge, damit innen kleine und außen große
 * Blätter liegen.
 */
export function createSpriteRoseModel(atlas: PetalAtlas, baseUrl: string, color: RoseColor, seed = 7): RoseModel {
  const base = createRoseModel(seed, SPRITE_RINGS, SPRITE_ELEVATION);
  const url = baseUrl + (atlas.images[color] ?? atlas.images.red ?? "");
  // Sprites sortieren: schmale, eingerollte (hohe Länge/Breite) nach innen, breite offene nach außen.
  const sorted = [...atlas.sprites].sort((a, b) => b.length / Math.max(1, b.width) - a.length / Math.max(1, a.width) || a.length - b.length);
  const rings = Math.max(...base.petals.map((p) => p.ring)) + 1;

  const petals: Petal[] = base.petals.map((p) => {
    if (p.shape.kind !== "path" || p.radius === 0) return p; // Herzscheibe bleibt SVG
    // Ringposition 0..1 auf Sprite-Index abbilden, mit etwas Streuung innerhalb der Nachbarn
    const t = p.ring / Math.max(1, rings - 1);
    const idx = Math.min(sorted.length - 1, Math.max(0, Math.round(t * (sorted.length - 1) + ((p.id * 7) % 3) - 1)));
    const sprite = sorted[idx]!;
    const targetLength = SPRITE_RINGS[p.ring]?.height ?? 60;
    return {
      ...p,
      size: (targetLength / sprite.length) * p.size,
      shape: {
        kind: "sprite",
        url,
        x: sprite.x,
        y: sprite.y,
        width: sprite.w,
        height: sprite.h,
        pivot: sprite.pivot,
        rotation: sprite.rotation,
      },
    };
  });
  return { ...base, petals };
}

export async function loadAtlas(name: string): Promise<{ atlas: PetalAtlas; baseUrl: string }> {
  const baseUrl = `/rose/${name}/`;
  const res = await fetch(`${baseUrl}petals.json`);
  if (!res.ok) throw new Error(`Atlas "${name}" nicht gefunden.`);
  return { atlas: (await res.json()) as PetalAtlas, baseUrl };
}
