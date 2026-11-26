/**
 * Pipeline: Blätter-Bild -> freigestellte Einzelblätter -> Sprite-Atlas + Pivots.
 *
 *   npx tsx tools/build-atlas.ts <eingabe.png> [weitere.png ...] <name> [--min-area 300] [--tolerance 40] [--scale 1]
 *
 * Erzeugt public/rose/<name>/petals.json sowie atlas-red.png, atlas-white.png, atlas-yellow.png.
 * Eingabe: ein oder mehrere Bilder mit Blütenblättern auf einfarbigem Hintergrund (oder mit Alphakanal),
 * z. B. ein Sheet mit offenen Außenblättern und eines mit eingerollten Innenblättern.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AtlasSprite, PetalAtlas } from "../shared/atlas";
import { analyzePetal, findBlobs, removeBackground } from "./lib/blobs";
import { blit, createImage, downscale, loadPng, savePng } from "./lib/image";
import { packShelves } from "./lib/pack";
import { recolor, type RoseTint } from "./lib/recolor";

export interface BuildOptions {
  minArea?: number;
  tolerance?: number;
  padding?: number;
  maxWidth?: number;
  /** Quellbilder vorab verkleinern (0..1), z. B. 0.7 für kleinere Atlanten */
  scale?: number;
}

export function buildAtlas(inputPaths: string | string[], outDir: string, opts: BuildOptions = {}): PetalAtlas {
  const { minArea = 300, tolerance = 40, padding = 4, maxWidth = 2048, scale = 1 } = opts;
  const paths = Array.isArray(inputPaths) ? inputPaths : [inputPaths];

  // Blobs aller Eingabebilder einsammeln; jeder Blob merkt sich sein Quellbild.
  const entries: { blob: ReturnType<typeof findBlobs>[number]; src: ReturnType<typeof loadPng> }[] = [];
  for (const path of paths) {
    let src = loadPng(path);
    removeBackground(src, tolerance);
    if (scale < 1) src = downscale(src, scale);
    const found = findBlobs(src, Math.round(minArea * scale * scale));
    if (found.length === 0) throw new Error(`Keine Blütenblätter in ${path} gefunden. Hintergrund zu unruhig oder Toleranz zu klein?`);
    for (const blob of found) entries.push({ blob, src });
  }
  const blobs = entries.map((e) => e.blob);

  const { placed, width, height } = packShelves(
    blobs.map((b) => ({ w: b.w + padding * 2, h: b.h + padding * 2 })),
    maxWidth,
    padding,
  );

  const atlas = createImage(width, height);
  const sprites: AtlasSprite[] = entries.map(({ blob, src }, i) => {
    const slot = placed[i]!;
    // Nur die Pixel dieses Blobs kopieren, damit sich überlappende Bounding-Boxen nicht stören.
    for (const p of blob.pixels) {
      const x = p % src.width;
      const y = (p - x) / src.width;
      const si = p * 4;
      const di = ((slot.y + padding + (y - blob.y)) * atlas.width + (slot.x + padding + (x - blob.x))) * 4;
      atlas.data[di] = src.data[si]!;
      atlas.data[di + 1] = src.data[si + 1]!;
      atlas.data[di + 2] = src.data[si + 2]!;
      atlas.data[di + 3] = src.data[si + 3]!;
    }
    const geo = analyzePetal(blob, src);
    return {
      x: slot.x,
      y: slot.y,
      w: slot.w,
      h: slot.h,
      pivot: { x: geo.pivot.x - blob.x + padding, y: geo.pivot.y - blob.y + padding },
      rotation: Math.round(geo.rotation * 10) / 10,
      length: Math.round(geo.length),
      width: Math.round(geo.width),
    };
  });

  // Verschmolzene Blätter erkennen: deutlich länger als der Median
  const lengths = sprites.map((s) => s.length).sort((a, b) => a - b);
  const median = lengths[Math.floor(lengths.length / 2)] ?? 0;
  const suspicious = sprites.map((s, i) => (s.length > median * 1.8 ? i : -1)).filter((i) => i >= 0);
  if (suspicious.length) {
    console.warn(`Warnung: Blätter ${suspicious.map((i) => "#" + i).join(", ")} sind ungewöhnlich lang. Vermutlich berühren sich dort zwei Blätter im Quellbild.`);
  }

  mkdirSync(outDir, { recursive: true });
  savePng(join(outDir, "atlas-debug.png"), debugImage(atlas, sprites));
  const images: Record<string, string> = {};
  for (const tint of ["red", "white", "yellow"] as RoseTint[]) {
    const file = `atlas-${tint}.png`;
    savePng(join(outDir, file), recolor(atlas, tint));
    images[tint] = file;
  }
  const result: PetalAtlas = { images, width, height, sprites };
  writeFileSync(join(outDir, "petals.json"), JSON.stringify(result, null, 2));
  return result;
}

/** Debug-Ansicht: Pivot als Kreuz, Richtung Basis->Spitze als Linie. */
function debugImage(atlas: ReturnType<typeof createImage>, sprites: AtlasSprite[]) {
  const img = createImage(atlas.width, atlas.height);
  img.data.set(atlas.data);
  const put = (x: number, y: number, r: number, g: number, b: number) => {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= img.width || y >= img.height) return;
    const i = (y * img.width + x) * 4;
    img.data[i] = r;
    img.data[i + 1] = g;
    img.data[i + 2] = b;
    img.data[i + 3] = 255;
  };
  for (const s of sprites) {
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) put(s.x + s.w - 1 + dx, s.y + dy, 0, 0, 0);
    // Rahmen
    for (let x = s.x; x < s.x + s.w; x++) { put(x, s.y, 120, 120, 120); put(x, s.y + s.h - 1, 120, 120, 120); }
    for (let y = s.y; y < s.y + s.h; y++) { put(s.x, y, 120, 120, 120); put(s.x + s.w - 1, y, 120, 120, 120); }
    // Pivot-Kreuz
    const px = s.x + s.pivot.x, py = s.y + s.pivot.y;
    for (let d = -6; d <= 6; d++) { put(px + d, py, 0, 200, 255); put(px, py + d, 0, 200, 255); }
    // Richtung Basis->Spitze: Rotation macht sie zu "oben", also ist die Richtung = rotate(-rotation) * (0,-1)
    const a = (-s.rotation * Math.PI) / 180;
    const dirX = Math.sin(a), dirY = -Math.cos(a);
    for (let t = 0; t < s.length * 0.9; t++) put(px + dirX * t, py + dirY * t, 255, 255, 0);
  }
  return img;
}

// CLI
if (process.argv[1] && /build-atlas\.ts$/.test(process.argv[1])) {
  const args = process.argv.slice(2);
  const flagStart = args.findIndex((a) => a.startsWith("--"));
  const positional = flagStart >= 0 ? args.slice(0, flagStart) : args;
  const rest = flagStart >= 0 ? args.slice(flagStart) : [];
  const name = positional[positional.length - 1];
  const inputs = positional.slice(0, -1);
  if (inputs.length === 0 || !name) {
    console.error("Aufruf: npx tsx tools/build-atlas.ts <eingabe.png> [weitere.png ...] <name> [--min-area N] [--tolerance N]");
    process.exit(1);
  }
  const opt = (flag: string) => {
    const i = rest.indexOf(flag);
    return i >= 0 ? Number(rest[i + 1]) : undefined;
  };
  const outDir = join("public", "rose", name);
  const atlas = buildAtlas(inputs, outDir, { minArea: opt("--min-area"), tolerance: opt("--tolerance"), scale: opt("--scale") });
  console.log(`${atlas.sprites.length} Blätter -> ${outDir} (${atlas.width}x${atlas.height})`);
  for (const [i, s] of atlas.sprites.entries()) {
    console.log(`  #${i}: ${s.w}x${s.h} Länge ${s.length} Breite ${s.width} Pivot (${s.pivot.x.toFixed(0)},${s.pivot.y.toFixed(0)}) Rotation ${s.rotation}°`);
  }
}

// Unbenutzte Importe vermeiden, wenn als Modul geladen
void blit;
