import type { CardColor } from "../../shared/card";
import { BlowDetector, GestureBlow } from "../blow/detector";
import { h } from "../dom";
import { createBedModel, PetalBed } from "../petals/bed";
import { RosePhysics } from "../rose/physics";
import { quoteCard } from "./kit";

/**
 * Bühne zum Pusten: Zitatkarte unter einem Bett aus Rosenblättern, umrahmt von der
 * „Schachtel“ (Tiefenkanten wie im Figma-Design). Wird vom Ersteller (Schritt „Probieren“)
 * und vom Empfänger gleich benutzt.
 *
 * Pust-Quelle: Mikrofon (BlowDetector), Rückfall Wischen/Tippen (GestureBlow), Leertaste am Desktop.
 * Neigung des Handys verschiebt das Blätterbett leicht (Parallaxe), ohne die Karte zu bewegen.
 */

export type BlowMode = "idle" | "mic" | "gesture";

export interface BlowStageOptions {
  color: CardColor;
  message: string;
  author?: string;
  /** Alle Blätter sind weg, die Botschaft ist frei. */
  onReveal?: () => void;
  /** Pro Frame: Pust-Intensität 0..1 und Anteil der gelösten Blätter 0..1 */
  onFrame?: (intensity: number, progress: number) => void;
}

/** Höhe/Breite der Bühne, für die Verteilung der Blätter (Handy-Hochformat). */
const STAGE_ASPECT = 2.3;
/** Parallaxe des Betts in Prozent der Bühnenbreite bei voller Neigung */
const PARALLAX = 2.5;

export class BlowStage {
  readonly el: HTMLElement;
  private readonly bed: PetalBed;
  private readonly physics: RosePhysics;
  private readonly mic = new BlowDetector();
  private readonly gesture = new GestureBlow();
  private readonly layer: HTMLElement;
  private mode: BlowMode = "idle";
  private raf = 0;
  private last = 0;
  private tilt = { x: 0, y: 0 };
  private tiltTarget = { x: 0, y: 0 };
  private readonly onKey = (e: KeyboardEvent) => {
    if (e.code === "Space" && this.mode !== "idle") {
      e.preventDefault();
      this.gesture.pulse(0.85);
    }
  };
  private readonly onOrientation = (e: DeviceOrientationEvent) => {
    if (e.beta === null || e.gamma === null) return;
    // Handy aufrecht ≈ beta 60..90; Abweichung davon und seitliches Kippen verschieben das Bett.
    this.tiltTarget = { x: clamp(e.gamma / 30, -1, 1), y: clamp((e.beta - 70) / 35, -1, 1) };
  };
  private readonly onPointer = (e: PointerEvent) => {
    if (e.pointerType !== "mouse") return;
    const r = this.el.getBoundingClientRect();
    this.tiltTarget = { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: ((e.clientY - r.top) / r.height) * 2 - 1 };
  };

  constructor(private readonly opts: BlowStageOptions) {
    this.bed = new PetalBed(createBedModel(108, STAGE_ASPECT), opts.color);
    this.physics = new RosePhysics(this.bed.model, {
      onRelease: (_petal, blow) => {
        if (blow > 0.75 && "vibrate" in navigator) navigator.vibrate?.(8);
      },
      onReveal: () => {
        this.el.classList.add("is-revealed");
        if (this.mode === "mic") this.mic.stop();
        this.opts.onReveal?.();
      },
    });

    this.layer = h("div", { class: "stage__bed" });
    this.el = h(
      "div",
      { class: `stage stage--${opts.color}` },
      h("div", { class: "stage__corner stage__corner--tl", "aria-hidden": "true" }),
      h("div", { class: "stage__corner stage__corner--br", "aria-hidden": "true" }),
      quoteCard(opts.message, opts.author),
      h("div", { class: "box", "aria-hidden": "true" }, h("i", { class: "box__l" }), h("i", { class: "box__r" }), h("i", { class: "box__t" }), h("i", { class: "box__b" })),
      this.layer,
    );
    this.bed.mount(this.layer);
  }

  get progress() {
    return this.physics.progress;
  }

  get revealed() {
    return this.physics.isRevealed;
  }

  get activeMode() {
    return this.mode;
  }

  /**
   * Pusten starten. Versucht das Mikrofon (muss aus einer Nutzergeste kommen); schlägt das fehl,
   * reagiert die Bühne auf Wischen. Gibt den tatsächlichen Modus zurück.
   */
  async start(): Promise<Exclude<BlowMode, "idle">> {
    if (this.mode !== "idle") return this.mode;
    let mode: Exclude<BlowMode, "idle"> = "gesture";
    try {
      if (!BlowDetector.supported) throw new Error("kein Mikrofon");
      await this.mic.start();
      mode = "mic";
    } catch {
      mode = "gesture";
    }
    this.begin(mode);
    return mode;
  }

  /** Ohne Mikrofon starten (Tests, bewusster Verzicht). */
  beginGesture() {
    if (this.mode === "idle") this.begin("gesture");
  }

  private begin(mode: Exclude<BlowMode, "idle">) {
    this.mode = mode;
    this.el.classList.add("is-active");
    this.gesture.attach(this.el);
    window.addEventListener("keydown", this.onKey);
    window.addEventListener("deviceorientation", this.onOrientation);
    this.el.addEventListener("pointermove", this.onPointer);
    void requestOrientationPermission();
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
  }

  private readonly frame = (now: number) => {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    let intensity = 0;
    if (this.mode === "mic") {
      this.mic.update(dt);
      intensity = this.mic.intensity;
    }
    this.gesture.update(dt);
    intensity = Math.max(intensity, this.gesture.intensity);

    this.physics.step(dt, intensity, (petal, pose, tremble) => {
      this.bed.setPose(petal as never, pose, tremble);
    });

    // Parallaxe weich nachführen (nur eine Ebene, nur transform)
    const k = Math.min(1, dt * 5);
    this.tilt.x += (this.tiltTarget.x - this.tilt.x) * k;
    this.tilt.y += (this.tiltTarget.y - this.tilt.y) * k;
    this.layer.style.transform = `translate(${(this.tilt.x * PARALLAX).toFixed(2)}%, ${(this.tilt.y * PARALLAX * 0.6).toFixed(2)}%)`;

    this.opts.onFrame?.(intensity, this.physics.progress);
    this.raf = requestAnimationFrame(this.frame);
  };

  /** Blätter zurücklegen und erneut pusten lassen. */
  async reset() {
    this.physics.reset();
    this.bed.reset();
    this.el.classList.remove("is-revealed");
    if (this.mode === "mic") {
      try {
        await this.mic.start();
      } catch {
        this.mode = "gesture";
      }
    }
  }

  /** Künstlicher Windstoß (Tests, Tastatur). */
  blow(strength: number) {
    this.gesture.pulse(strength);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.mic.stop();
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("deviceorientation", this.onOrientation);
    this.bed.destroy();
    this.el.remove();
  }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** iOS verlangt eine Erlaubnis für die Lagesensoren, aus einer Nutzergeste heraus. */
async function requestOrientationPermission() {
  const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
  if (DOE?.requestPermission) {
    try {
      await DOE.requestPermission();
    } catch {
      // abgelehnt: dann eben ohne Parallaxe
    }
  }
}
