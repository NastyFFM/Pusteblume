import type { Petal, RoseModel } from "../rose/model";
import { placePetal, project, type Camera } from "../rose/projection";

/**
 * Atmosphäre der Kartenansicht: Schlagschatten auf dem Untergrund, schwebende
 * Pollen und kurze Lichtpunkte, wenn sich ein Blatt löst.
 *
 * Alles liegt als eigene Ebenen in der Bühne (.card__stage). Pro Frame werden nur
 * transform und opacity gesetzt; Größen und Positionen sind als Bruchteile der
 * Bühnenbreite (CSS-Variable --size) ausgedrückt, damit nichts gemessen werden muss.
 * Modellkoordinaten (viewBox -150..150) entsprechen 1/300 der Bühne je Einheit.
 */

/** Modell-Einheiten -> Anteil der Bühnenbreite */
const UNIT = 1 / 300;
/** Anzahl der vorgehaltenen Lichtpunkte (werden zyklisch wiederverwendet) */
const GLOW_POOL = 6;
/** Anzahl der Pollen */
const MOTES = 14;

function div(className: string): HTMLDivElement {
  const node = document.createElement("div");
  node.className = className;
  return node;
}

/** Bruchteil der Bühne als CSS-Länge */
function stageLength(fraction: number): string {
  return `calc(${fraction.toFixed(4)} * var(--size))`;
}

/** Deterministischer Zufall, damit die Pollen bei jedem Laden gleich verteilt sind. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Ambience {
  /** Schattenfläche; gehört vor rose.backEl in die Bühne */
  readonly shadowEl: HTMLDivElement;
  /** Pollen-Ebene; gehört über die Blüte */
  readonly motesEl: HTMLDivElement;
  /** Lichtpunkt-Ebene; gehört über die Blüte */
  readonly glowsEl: HTMLDivElement;

  private readonly glows: { outer: HTMLDivElement; inner: HTMLDivElement }[] = [];
  private glowIndex = 0;
  private lastShadowKey = "";
  /** Radius der Schattenfläche in Modell-Einheiten */
  private readonly shadowRadius: number;
  /** Höhe des Untergrunds unter dem Blütenboden in Modell-Einheiten */
  private readonly groundDepth: number;

  constructor(private readonly model: RoseModel) {
    const r = model.radius;
    this.shadowRadius = r * 1.02;
    this.groundDepth = r * 0.55;

    this.shadowEl = div("stage-shadow");
    const d = stageLength(this.shadowRadius * 2 * UNIT);
    this.shadowEl.style.width = d;
    this.shadowEl.style.height = d;

    this.motesEl = div("motes");
    this.buildMotes();

    this.glowsEl = div("glows");
    const glowSize = stageLength(Math.max(0.16, r * 0.9 * UNIT));
    for (let i = 0; i < GLOW_POOL; i++) {
      const outer = div("glow");
      const inner = div("glow__light");
      outer.style.width = glowSize;
      outer.style.height = glowSize;
      outer.appendChild(inner);
      this.glowsEl.appendChild(outer);
      this.glows.push({ outer, inner });
    }
  }

  /** Pollen: Startposition, Driftweg und Tempo je Korn als CSS-Variablen. */
  private buildMotes() {
    const rnd = rng(0x5eed);
    for (let i = 0; i < MOTES; i++) {
      const m = div("mote");
      const size = 2.5 + rnd() * 3.5;
      m.style.width = `${size.toFixed(1)}px`;
      m.style.height = m.style.width;
      m.style.left = `${(4 + rnd() * 92).toFixed(1)}%`;
      m.style.top = `${(4 + rnd() * 92).toFixed(1)}%`;
      m.style.setProperty("--dx", `${((rnd() - 0.5) * 60).toFixed(1)}px`);
      m.style.setProperty("--dy", `${(-10 - rnd() * 40).toFixed(1)}px`);
      m.style.setProperty("--dur", `${(9 + rnd() * 9).toFixed(1)}s`);
      m.style.setProperty("--delay", `${(-rnd() * 18).toFixed(1)}s`);
      m.style.setProperty("--alpha", (0.3 + rnd() * 0.35).toFixed(2));
      this.motesEl.appendChild(m);
    }
  }

  /**
   * Schatten an Kamera und Fortschritt anpassen. Der Schatten ist eine Scheibe auf dem
   * Untergrund unter der Blüte: von oben gesehen rund und direkt darunter, bei flacher
   * Kamera gestaucht und nach unten versetzt. Ein leichter seitlicher Versatz der
   * Lichtquelle wandert mit dem Azimut.
   */
  update(camera: Camera, progress: number) {
    const p = Math.max(0, Math.min(1, progress));
    const key = `${camera.elevation.toFixed(1)}|${camera.azimuth.toFixed(1)}|${p.toFixed(3)}`;
    if (key === this.lastShadowKey) return;
    this.lastShadowKey = key;

    const r = this.model.radius;
    // Schattenmitte im Raum: unter dem Blütenboden, etwas seitlich und nach vorn versetzt
    const centre = project({ x: r * 0.14, y: -this.groundDepth, z: r * 0.12 }, camera);
    const squash = Math.max(0.14, Math.sin((camera.elevation * Math.PI) / 180));
    // Mit dem Wegfliegen schrumpft der Schatten; äußere Blätter gehen zuerst.
    const shrink = 1 - 0.8 * p;
    const x = stageLength(centre.x * UNIT);
    const y = stageLength(centre.y * UNIT);
    this.shadowEl.style.transform = `translate(-50%, -50%) translate(${x}, ${y}) scale(${shrink.toFixed(3)}, ${(shrink * squash).toFixed(3)})`;
    // Flache Kamera: Schatten wird länger und blasser, als läge er weiter hinten.
    const fade = 0.75 + 0.25 * squash;
    this.shadowEl.style.opacity = (fade * Math.pow(1 - p, 1.4)).toFixed(3);
  }

  /** Kurzer warmer Lichtpunkt an der Bildschirmposition eines Blatts, das sich gerade löst. */
  release(petal: Petal, camera: Camera, intensity: number) {
    const placement = placePetal(petal.angle, petal.radius, petal.elevation, petal.lift, petal.tilt, petal.length);
    // Blattmitte statt Basis: dort sitzt der Lichtpunkt optisch auf dem Blatt
    const half = placement.length * 0.5;
    const centre = project(
      { x: placement.pivot.x + placement.dir.x * half, y: placement.pivot.y + placement.dir.y * half, z: placement.pivot.z + placement.dir.z * half },
      camera,
    );
    const { outer, inner } = this.glows[this.glowIndex]!;
    this.glowIndex = (this.glowIndex + 1) % this.glows.length;
    outer.style.transform = `translate(-50%, -50%) translate(${stageLength(centre.x * UNIT)}, ${stageLength(centre.y * UNIT)})`;

    const peak = 0.55 + 0.35 * Math.max(0, Math.min(1, intensity));
    if (typeof inner.animate === "function") {
      inner.animate(
        [
          { transform: "scale(0.35)", opacity: 0 },
          { transform: "scale(1)", opacity: peak, offset: 0.35 },
          { transform: "scale(1.35)", opacity: 0 },
        ],
        { duration: 520, easing: "ease-out" },
      );
    } else {
      // Ältere Browser ohne Web Animations: CSS-Animation per Klasse neu starten.
      inner.classList.remove("is-lit");
      void inner.offsetWidth;
      inner.classList.add("is-lit");
    }
  }

  /** Zurück in den Ausgangszustand (z. B. "Noch einmal"). */
  reset() {
    this.lastShadowKey = "";
  }
}

/**
 * Sanftes Aufglühen der Botschaftskarte beim Freilegen. Die Klasse löst eine einmalige
 * CSS-Animation aus und wird danach wieder entfernt, damit kein Dauerglow bleibt.
 */
export function glowMessage(message: HTMLElement) {
  message.classList.remove("is-glowing");
  void message.offsetWidth;
  message.classList.add("is-glowing");
  const end = () => {
    message.classList.remove("is-glowing");
    message.removeEventListener("animationend", end);
  };
  message.addEventListener("animationend", end);
}
