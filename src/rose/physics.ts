import { petalPivotWorld, type Petal, type RoseModel } from "./model";
import type { PetalPose } from "./svg-renderer";

type PetalState =
  | { kind: "attached" }
  | { kind: "flying"; x: number; y: number; vx: number; vy: number; rot: number; vrot: number; scale: number; alpha: number; t: number }
  | { kind: "gone" };

export interface PhysicsEvents {
  /** Ein Blatt hat sich gelöst (für Sound/Haptik). */
  onRelease?(petal: Petal, intensity: number): void;
  /** Alle Blätter sind weg. */
  onReveal?(): void;
}

/** Wie viele Sekunden volles Pusten nötig sind, bis die letzte Blüte fällt. */
const FULL_BLOW_SECONDS = 2.4;

/**
 * Pust-Physik. Pro Frame wird die aktuelle Pust-Intensität (0..1) übergeben.
 * Intensität sammelt sich als "Energie" an; jedes Blatt löst sich, sobald die
 * Energie seinen Schwellwert erreicht. Stärke des Pustens bestimmt sowohl das
 * Tempo der Freigabe als auch die Abfluggeschwindigkeit.
 */
export class RosePhysics {
  private states = new Map<number, PetalState>();
  private energy = 0;
  private revealed = false;
  private time = 0;
  private readonly order: Petal[];

  constructor(
    private readonly model: RoseModel,
    private readonly events: PhysicsEvents = {},
  ) {
    this.order = [...model.petals].sort((a, b) => a.releaseAt - b.releaseAt);
    this.reset();
  }

  reset() {
    this.energy = 0;
    this.revealed = false;
    this.time = 0;
    for (const p of this.model.petals) this.states.set(p.id, { kind: "attached" });
  }

  /** Anteil der bereits gelösten Blätter 0..1 */
  get progress(): number {
    let gone = 0;
    for (const s of this.states.values()) if (s.kind !== "attached") gone++;
    return gone / this.model.petals.length;
  }

  get isRevealed() {
    return this.revealed;
  }

  /** Einen Frame rechnen. Gibt für jedes Blatt die Pose zurück (undefined = Ruhelage). */
  step(dt: number, intensity: number, apply: (petal: Petal, pose: PetalPose | undefined, tremble: number) => void) {
    dt = Math.min(dt, 0.05);
    this.time += dt;
    const blow = Math.max(0, Math.min(1, intensity));

    // Energie sammeln (leicht überlinear, damit kräftiges Pusten spürbar mehr bringt).
    if (blow > 0.04) this.energy += Math.pow(blow, 1.35) * (dt / FULL_BLOW_SECONDS);

    // Blätter freigeben, deren Schwelle erreicht ist. Nur solange gepustet wird.
    if (blow > 0.04) {
      for (const petal of this.order) {
        const s = this.states.get(petal.id)!;
        if (s.kind !== "attached") continue;
        if (petal.releaseAt > this.energy) break;
        this.release(petal, blow);
      }
    }

    let attachedCount = 0;
    for (const petal of this.model.petals) {
      const s = this.states.get(petal.id)!;
      if (s.kind === "attached") {
        attachedCount++;
        // Zittern: äußere Blätter reagieren stärker als innere.
        const outerness = petal.ring / 5;
        const amp = blow * (2 + 5 * outerness);
        const tremble = amp * Math.sin(this.time * 38 + petal.id * 1.7);
        apply(petal, undefined, tremble);
        continue;
      }
      if (s.kind === "gone") continue;

      // Flugphase
      const pivot = petalPivotWorld(petal);
      const dist = Math.hypot(pivot.x, pivot.y) || 1;
      const outX = pivot.x / dist;
      const outY = pivot.y / dist;

      // Wind drückt weiter nach außen/oben, solange gepustet wird.
      s.vx += outX * blow * 260 * dt;
      s.vy += (outY * 0.6 - 0.9) * blow * 260 * dt;
      // Luftwiderstand und etwas Schwerkraft
      const drag = Math.exp(-1.6 * dt);
      s.vx *= drag;
      s.vy = s.vy * drag + 70 * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.rot += s.vrot * dt;
      s.vrot *= Math.exp(-0.4 * dt);
      s.scale = Math.min(1.7, s.scale + 0.5 * dt); // kommt dem Betrachter entgegen
      s.t += dt;

      const outOfView = Math.abs(pivot.x + s.x) > 260 || Math.abs(pivot.y + s.y) > 260;
      if (s.t > 1.3 || outOfView) s.alpha = Math.max(0, s.alpha - dt / 0.7);

      if (s.alpha <= 0) {
        this.states.set(petal.id, { kind: "gone" });
        apply(petal, { dx: 0, dy: 0, rot: 0, scale: 1, alpha: 0 }, 0);
        continue;
      }
      apply(petal, { dx: s.x, dy: s.y, rot: (s.rot * 180) / Math.PI, scale: s.scale, alpha: s.alpha }, 0);
    }

    if (attachedCount === 0 && !this.revealed) {
      this.revealed = true;
      this.events.onReveal?.();
    }
  }

  private release(petal: Petal, blow: number) {
    const pivot = petalPivotWorld(petal);
    const dist = Math.hypot(pivot.x, pivot.y) || 1;
    // Richtung: nach außen plus deutlich nach oben (Handy wird aufrecht gehalten), etwas Streuung.
    let dx = (pivot.x / dist) * 0.9 + (Math.random() - 0.5) * 0.8;
    let dy = (pivot.y / dist) * 0.5 - 1.0 + (Math.random() - 0.5) * 0.5;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const speed = 160 + 420 * blow + Math.random() * 60;
    this.states.set(petal.id, {
      kind: "flying",
      x: 0,
      y: 0,
      vx: dx * speed,
      vy: dy * speed,
      rot: 0,
      vrot: (Math.random() - 0.5) * (4 + 8 * blow),
      scale: 1,
      alpha: 1,
      t: 0,
    });
    this.events.onRelease?.(petal, blow);
  }
}
