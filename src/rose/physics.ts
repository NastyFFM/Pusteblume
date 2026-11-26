import { petalPivotWorld, type Petal, type RoseModel } from "./model";
import type { PetalPose } from "./svg-renderer";

type PetalState =
  | { kind: "attached" }
  | {
      kind: "flying";
      x: number;
      y: number;
      vx: number;
      vy: number;
      /** Drehung in der Bildebene (rad) */
      rot: number;
      vrot: number;
      /** Trudeln: Drehung um die Längsachse des Blatts in Grad; läuft frei weiter (Renderer nutzt cos). */
      flip: number;
      /** Winkelgeschwindigkeit des Trudelns in Grad/s, klingt durch Luftwiderstand ab */
      vflip: number;
      scale: number;
      alpha: number;
      t: number;
    }
  | { kind: "gone" };

export interface PhysicsEvents {
  /** Ein Blatt hat sich gelöst (für Sound/Haptik). */
  onRelease?(petal: Petal, intensity: number): void;
  /** Alle Blätter sind weg. */
  onReveal?(): void;
}

/** Wie viele Sekunden volles Pusten nötig sind, bis die letzte Blüte fällt. */
const FULL_BLOW_SECONDS = 2.4;

/** Ab dieser Intensität gilt das Pusten als kräftig: Blätter starten schneller und drehen wilder. */
const WILD_BLOW = 0.7;

/** Trudel-Geschwindigkeit beim Lösen in Grad/s (bei Intensität 0 bzw. 1). */
const FLIP_SPEED_MIN = 90;
const FLIP_SPEED_MAX = 420;

/** Flattern: kleine Sinus-Modulation des Trudelwinkels (Amplitude in Grad, Frequenz in rad/s). */
const FLUTTER_AMP = 10;
const FLUTTER_FREQ = 9;

/**
 * 0 bei sanftem Pusten, 1 bei voller Intensität oberhalb von WILD_BLOW.
 * Bis WILD_BLOW bleibt das Verhalten wie bisher, darüber wird es spürbar wilder.
 */
function wildness(blow: number): number {
  return Math.max(0, Math.min(1, (blow - WILD_BLOW) / (1 - WILD_BLOW)));
}

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
    this.states.clear();
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
    // Ungültige Eingaben (NaN, negative Zeit) dürfen den Zustand nicht verseuchen.
    dt = Number.isFinite(dt) ? Math.max(0, Math.min(dt, 0.05)) : 0;
    this.time += dt;
    const blow = Number.isFinite(intensity) ? Math.max(0, Math.min(1, intensity)) : 0;

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
      // Trudeln um die Längsachse: Winkel läuft frei weiter, Tempo klingt langsam ab.
      s.flip += s.vflip * dt;
      s.vflip *= Math.exp(-0.5 * dt);
      s.scale = Math.min(1.7, s.scale + 0.5 * dt); // kommt dem Betrachter entgegen
      s.t += dt;

      const outOfView = Math.abs(pivot.x + s.x) > 260 || Math.abs(pivot.y + s.y) > 260;
      if (s.t > 1.3 || outOfView) s.alpha = Math.max(0, s.alpha - dt / 0.7);

      if (s.alpha <= 0) {
        this.states.set(petal.id, { kind: "gone" });
        apply(petal, { dx: 0, dy: 0, rot: 0, scale: 1, alpha: 0 }, 0);
        continue;
      }
      // Leichtes Flattern: kleine Sinus-Modulation über die Flugzeit, je Blatt phasenverschoben.
      const flutter = FLUTTER_AMP * Math.sin(s.t * FLUTTER_FREQ + petal.id * 0.9);
      apply(
        petal,
        {
          dx: s.x,
          dy: s.y,
          rot: (s.rot * 180) / Math.PI,
          scale: s.scale,
          alpha: s.alpha,
          vx: s.vx,
          vy: s.vy,
          flip: s.flip + flutter,
        },
        0,
      );
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

    // Kräftiges Pusten (über WILD_BLOW): bis zu 30 % schneller und doppelt so viel Drehung.
    const wild = wildness(blow);
    const speed = (160 + 420 * blow + Math.random() * 60) * (1 + 0.3 * wild);
    const vrot = (Math.random() - 0.5) * (4 + 8 * blow) * (1 + 1.0 * wild);

    // Trudeln: Tempo nach Pust-Intensität mit etwas Streuung, zufälliges Vorzeichen,
    // deterministisch auf FLIP_SPEED_MIN..FLIP_SPEED_MAX begrenzt.
    const flipBase = FLIP_SPEED_MIN + (FLIP_SPEED_MAX - FLIP_SPEED_MIN) * blow + (Math.random() - 0.5) * 60;
    const flipSpeed = Math.max(FLIP_SPEED_MIN, Math.min(FLIP_SPEED_MAX, flipBase));
    const vflip = (Math.random() < 0.5 ? -1 : 1) * flipSpeed;

    this.states.set(petal.id, {
      kind: "flying",
      x: 0,
      y: 0,
      vx: dx * speed,
      vy: dy * speed,
      rot: 0,
      vrot,
      flip: 0,
      vflip,
      scale: 1,
      alpha: 1,
      t: 0,
    });
    this.events.onRelease?.(petal, blow);
  }
}
