import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzePetal, findBlobs, removeBackground } from "./blobs";
import { loadPng } from "./image";

/**
 * ChatGPT-Blättersheet (4x4, Alphakanal). Laut Prompt zeigt bei jedem Blatt die Basis
 * nach unten, die Spitze nach oben. Erwartet: Rotation nahe 0°, Pivot im unteren Blattbereich.
 */
describe.each(["chatgpt-rose-petals.png", "chatgpt-rose-inner.png"])("Pipeline am KI-Bild %s", (file) => {
  const img = loadPng(join(__dirname, "..", "fixtures", "ai", file));
  removeBackground(img);
  const blobs = findBlobs(img, 300);

  it("findet 16 Blätter", () => {
    expect(blobs).toHaveLength(16);
  });

  it("legt bei jedem Blatt den Pivot unten an und richtet es aufrecht aus", () => {
    const failures: string[] = [];
    for (const [i, b] of blobs.entries()) {
      const g = analyzePetal(b, img);
      const rel = (g.pivot.y - b.y) / b.h; // 0 = oben, 1 = unten
      let rotErr = Math.abs(g.rotation) % 360;
      rotErr = Math.min(rotErr, 360 - rotErr);
      if (rel < 0.8 || rotErr > 20) failures.push(`Blatt #${i}: Pivot bei ${(rel * 100).toFixed(0)} % Höhe, Winkel ${g.rotation.toFixed(1)}°`);
    }
    expect(failures, failures.join("\n")).toHaveLength(0);
  });
});
