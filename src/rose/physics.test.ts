import { describe, expect, it } from "vitest";
import { createRoseModel, type Petal } from "./model";
import { RosePhysics } from "./physics";
import type { PetalPose } from "./svg-renderer";

const DT = 1 / 60;

/** Lässt die Physik `seconds` lang mit voller Intensität laufen und sammelt die fliegenden Posen je Blatt. */
function run(physics: RosePhysics, seconds: number, intensity = 1) {
  const flying = new Map<number, PetalPose[]>();
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    physics.step(DT, intensity, (petal: Petal, pose) => {
      if (pose && pose.alpha > 0) {
        const list = flying.get(petal.id) ?? [];
        list.push(pose);
        flying.set(petal.id, list);
      }
    });
  }
  return flying;
}

describe("RosePhysics", () => {
  it("feuert onReveal nach einigen Sekunden vollem Pusten", () => {
    const model = createRoseModel();
    let revealed = 0;
    let released = 0;
    const physics = new RosePhysics(model, { onReveal: () => revealed++, onRelease: () => released++ });
    run(physics, 6);
    expect(revealed).toBe(1);
    expect(released).toBe(model.petals.length);
    expect(physics.isRevealed).toBe(true);
    expect(physics.progress).toBe(1);
  });

  it("liefert fliegenden Blättern endliche vx/vy/flip, wobei flip sich mit der Zeit ändert", () => {
    const model = createRoseModel();
    const physics = new RosePhysics(model);
    const flying = run(physics, 6);
    expect(flying.size).toBe(model.petals.length);

    for (const poses of flying.values()) {
      // Jedes Blatt fliegt mehrere Frames lang sichtbar.
      expect(poses.length).toBeGreaterThan(10);
      for (const pose of poses) {
        for (const key of ["dx", "dy", "rot", "scale", "alpha", "vx", "vy", "flip"] as const) {
          expect(Number.isFinite(pose[key])).toBe(true);
        }
      }
      // Trudeln: der Flip-Winkel wandert spürbar weiter (mindestens 90°/s über die ersten Frames).
      const first = poses[0]!.flip!;
      const later = poses[Math.min(poses.length - 1, 30)]!.flip!;
      expect(Math.abs(later - first)).toBeGreaterThan(20);
      // Alle Werte unterscheiden sich: kein Stillstand.
      const distinct = new Set(poses.map((p) => p.flip));
      expect(distinct.size).toBeGreaterThan(poses.length / 2);
    }
  });

  it("startet bei kräftigem Pusten schneller und mit mehr Drehung als bei sanftem", () => {
    const model = createRoseModel();
    const firstSpeed = (intensity: number) => {
      const speeds: number[] = [];
      const rots: number[] = [];
      for (let trial = 0; trial < 20; trial++) {
        const physics = new RosePhysics(model);
        const seen = new Set<number>();
        // Genug Zeit, dass sich alle Blätter lösen.
        for (let i = 0; i < 60 * 8; i++) {
          physics.step(DT, intensity, (petal, pose) => {
            if (pose && pose.alpha > 0 && !seen.has(petal.id)) {
              seen.add(petal.id);
              speeds.push(Math.hypot(pose.vx!, pose.vy!));
              rots.push(Math.abs(pose.rot));
            }
          });
        }
      }
      const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
      return { speed: avg(speeds), rot: avg(rots) };
    };
    const soft = firstSpeed(0.5);
    const hard = firstSpeed(1);
    expect(hard.speed).toBeGreaterThan(soft.speed * 1.2);
    expect(hard.rot).toBeGreaterThan(soft.rot * 1.3);
  });

  it("setzt mit reset() alle Blätter wieder an die Blüte", () => {
    const model = createRoseModel();
    const physics = new RosePhysics(model);
    run(physics, 6);
    expect(physics.progress).toBe(1);

    physics.reset();
    expect(physics.progress).toBe(0);
    expect(physics.isRevealed).toBe(false);

    // Ohne Pusten bleibt alles in Ruhelage.
    let flyingPoses = 0;
    physics.step(DT, 0, (_petal, pose) => {
      if (pose) flyingPoses++;
    });
    expect(flyingPoses).toBe(0);
    expect(physics.progress).toBe(0);
  });

  it("bleibt bei ungültigen Eingaben (NaN) stabil", () => {
    const model = createRoseModel();
    const physics = new RosePhysics(model);
    run(physics, 1);
    physics.step(Number.NaN, Number.NaN, () => {});
    const flying = run(physics, 1);
    for (const poses of flying.values()) {
      for (const pose of poses) {
        expect(Number.isFinite(pose.dx)).toBe(true);
        expect(Number.isFinite(pose.flip)).toBe(true);
      }
    }
  });
});
