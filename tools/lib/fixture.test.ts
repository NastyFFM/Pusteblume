import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { analyzePetal, findBlobs, removeBackground } from "./blobs";
import { loadPng } from "./image";

/**
 * Prüft die Pipeline gegen das synthetische Blättersheet, dessen echte Basispunkte und
 * Drehwinkel beim Erzeugen (tools/make-fixture.cjs) mitgeschrieben wurden.
 */
const dir = join(__dirname, "..", "fixtures");

describe("Pipeline am Fixture", () => {
  const img = loadPng(join(dir, "petal-sheet.png"));
  const truth = JSON.parse(readFileSync(join(dir, "petal-sheet.json"), "utf8")) as { baseX: number; baseY: number; rot: number; h: number }[];
  removeBackground(img);
  const blobs = findBlobs(img, 300);

  it("findet jedes Blatt genau einmal", () => {
    expect(blobs).toHaveLength(truth.length);
  });

  it("setzt Pivot und Drehung für jedes Blatt richtig", () => {
    const failures: string[] = [];
    for (const t of truth) {
      // Blob, in dessen Box der echte Basispunkt liegt
      const blob = blobs.find((b) => t.baseX >= b.x && t.baseX < b.x + b.w && t.baseY >= b.y && t.baseY < b.y + b.h);
      expect(blob).toBeDefined();
      const g = analyzePetal(blob!, img);
      const pivotErr = Math.hypot(g.pivot.x - t.baseX, g.pivot.y - t.baseY);
      // Erwartete Rotation macht die Fixture-Drehung rückgängig
      let rotErr = Math.abs(g.rotation - -t.rot) % 360;
      rotErr = Math.min(rotErr, 360 - rotErr);
      if (pivotErr > t.h * 0.12 || rotErr > 12) failures.push(`Blatt bei (${t.baseX.toFixed(0)},${t.baseY.toFixed(0)}): Pivot-Fehler ${pivotErr.toFixed(1)}px, Winkel-Fehler ${rotErr.toFixed(1)}°`);
    }
    expect(failures, failures.join("\n")).toHaveLength(0);
  });
});
