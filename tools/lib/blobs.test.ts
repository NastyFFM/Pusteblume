import { describe, expect, it } from "vitest";
import { analyzePetal, findBlobs, removeBackground } from "./blobs";
import { createImage, type Image } from "./image";

/** Zeichnet ein Dreieck (schmale Basis unten/oben je nach Parameter) als opake Fläche. */
function paintTriangle(img: Image, cx: number, baseY: number, tipY: number, halfWidthAtTip: number, color = [200, 30, 60]) {
  const dir = Math.sign(tipY - baseY);
  for (let y = baseY; y !== tipY + dir; y += dir) {
    const t = Math.abs(y - baseY) / Math.abs(tipY - baseY);
    const hw = Math.max(1, Math.round(halfWidthAtTip * t));
    for (let x = cx - hw; x <= cx + hw; x++) {
      const i = (y * img.width + x) * 4;
      img.data[i] = color[0]!; img.data[i + 1] = color[1]!; img.data[i + 2] = color[2]!; img.data[i + 3] = 255;
    }
  }
}

function whiteImage(w: number, h: number): Image {
  const img = createImage(w, h);
  img.data.fill(255);
  return img;
}

describe("Blob-Pipeline", () => {
  it("entfernt weißen Hintergrund und findet getrennte Blätter", () => {
    const img = whiteImage(200, 120);
    paintTriangle(img, 50, 100, 20, 30);  // Basis unten (schmal), Spitze oben (breit)
    paintTriangle(img, 150, 20, 100, 30); // Basis oben, Spitze unten
    removeBackground(img);
    const blobs = findBlobs(img, 50);
    expect(blobs).toHaveLength(2);
    expect(blobs[0]!.area).toBeGreaterThan(1000);
  });

  it("legt den Pivot an die schmale Basis und richtet die Spitze nach oben aus", () => {
    const img = whiteImage(200, 120);
    paintTriangle(img, 50, 100, 20, 30);
    paintTriangle(img, 150, 20, 100, 30);
    removeBackground(img);
    const [a, b] = findBlobs(img, 50);

    const ga = analyzePetal(a!, img.width);
    expect(ga.pivot.y).toBeGreaterThan(90); // Basis ist unten
    expect(Math.abs(ga.rotation)).toBeLessThan(5); // zeigt schon nach oben

    const gb = analyzePetal(b!, img.width);
    expect(gb.pivot.y).toBeLessThan(30); // Basis ist oben
    expect(Math.abs(Math.abs(gb.rotation) - 180)).toBeLessThan(5); // muss um 180° gedreht werden
    expect(gb.length).toBeGreaterThan(70);
  });

  it("erkennt ein um 90° liegendes Blatt", () => {
    const img = whiteImage(200, 120);
    // Basis links (schmal), Spitze rechts (breit)
    for (let x = 20; x <= 150; x++) {
      const hw = Math.max(1, Math.round(((x - 20) / 130) * 30));
      for (let y = 60 - hw; y <= 60 + hw; y++) {
        const i = (y * img.width + x) * 4;
        img.data[i] = 200; img.data[i + 1] = 30; img.data[i + 2] = 60; img.data[i + 3] = 255;
      }
    }
    removeBackground(img);
    const [blob] = findBlobs(img, 50);
    const g = analyzePetal(blob!, img.width);
    expect(g.pivot.x).toBeLessThan(35);
    // Richtung Basis->Spitze ist +x (0°); nach oben braucht es -90°
    expect(Math.abs(g.rotation + 90)).toBeLessThan(5);
  });
});
