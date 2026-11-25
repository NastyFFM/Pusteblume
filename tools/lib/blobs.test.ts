import { describe, expect, it } from "vitest";
import { analyzePetal, findBlobs, removeBackground } from "./blobs";
import { createImage, type Image } from "./image";

/**
 * Tropfenform: spitze Basis, runde breite Spitze. `dir` = Richtung Basis -> Spitze in Grad
 * (0 = nach rechts, -90 = nach oben). Einfarbig, prüft also den Form-Rückfall ohne Farbhinweis.
 */
function paintTeardrop(img: Image, cx: number, cy: number, length: number, dir: number, color = [200, 30, 60]) {
  const a = (dir * Math.PI) / 180;
  const ax = Math.cos(a), ay = Math.sin(a);
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const dx = x - cx, dy = y - cy;
      const t = (dx * ax + dy * ay) / length + 0.5; // 0 = Basis, 1 = Spitze
      const u = -dx * ay + dy * ax;
      if (t < 0 || t > 1) continue;
      const halfWidth = length * 0.45 * Math.pow(t, 0.9) * Math.sqrt(Math.max(0, 1 - t * t * t)); // schmal an der Basis, rund an der Spitze
      if (Math.abs(u) <= halfWidth) {
        const i = (y * img.width + x) * 4;
        img.data[i] = color[0]!; img.data[i + 1] = color[1]!; img.data[i + 2] = color[2]!; img.data[i + 3] = 255;
      }
    }
  }
}

function whiteImage(w: number, h: number): Image {
  const img = createImage(w, h);
  img.data.fill(255);
  return img;
}

function rotErr(actual: number, expected: number) {
  const d = Math.abs(actual - expected) % 360;
  return Math.min(d, 360 - d);
}

describe("Blob-Pipeline", () => {
  it("entfernt weißen Hintergrund und findet getrennte Blätter", () => {
    const img = whiteImage(260, 140);
    paintTeardrop(img, 60, 70, 100, -90);
    paintTeardrop(img, 190, 70, 100, 90);
    removeBackground(img);
    const blobs = findBlobs(img, 50);
    expect(blobs).toHaveLength(2);
    expect(blobs[0]!.area).toBeGreaterThan(1500);
  });

  it("legt den Pivot an die schmale Basis und richtet die Spitze nach oben aus", () => {
    const img = whiteImage(260, 140);
    paintTeardrop(img, 60, 70, 100, -90); // Spitze oben, Basis unten
    paintTeardrop(img, 190, 70, 100, 90); // Spitze unten, Basis oben
    removeBackground(img);
    const [a, b] = findBlobs(img, 50);

    const ga = analyzePetal(a!, img);
    expect(ga.pivot.y).toBeGreaterThan(105);
    expect(rotErr(ga.rotation, 0)).toBeLessThan(8);

    const gb = analyzePetal(b!, img);
    expect(gb.pivot.y).toBeLessThan(35);
    expect(rotErr(gb.rotation, 180)).toBeLessThan(8);
    expect(gb.length).toBeGreaterThan(85);
  });

  it("erkennt ein liegendes und ein schräges Blatt", () => {
    const img = whiteImage(300, 200);
    paintTeardrop(img, 80, 100, 110, 0); // Basis links, Spitze rechts
    paintTeardrop(img, 220, 100, 110, 40); // schräg nach rechts unten
    removeBackground(img);
    const blobs = findBlobs(img, 50);
    const flat = blobs.find((b) => b.x < 150);
    const tilted = blobs.find((b) => b.x >= 150);
    const gf = analyzePetal(flat!, img);
    expect(gf.pivot.x).toBeLessThan(40);
    expect(rotErr(gf.rotation, -90)).toBeLessThan(8);
    const gt = analyzePetal(tilted!, img);
    expect(rotErr(gt.rotation, -130)).toBeLessThan(8);
  });
});
