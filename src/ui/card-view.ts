import { DEFAULT_SHAPE, type CardData } from "../../shared/card";
import { BlowDetector, GestureBlow } from "../blow/detector";
import { h } from "../dom";
import { RosePhysics } from "../rose/physics";
import { createRose, type RoseStyle } from "../rose/factory";
import { TiltCamera } from "../view/tilt";
import { Ambience, glowMessage } from "../view/ambience";

export interface CardViewOptions {
  /** Zurück-Aktion (z. B. im Vorschau-Modus) */
  onBack?: () => void;
  backLabel?: string;
  /** Darstellung der Rose: SVG (Standard) oder Sprite-Atlas */
  style?: RoseStyle;
}

/** Schriftgröße der Botschaft an die Länge anpassen, damit sie unter der Blüte Platz findet. */
function messageSizeClass(message: string) {
  const n = message.length;
  if (n <= 40) return "msg--xl";
  if (n <= 110) return "msg--l";
  if (n <= 220) return "msg--m";
  return "msg--s";
}

export function mountCardView(root: HTMLElement, card: CardData, opts: CardViewOptions = {}) {
  const { model, rose } = createRose(card.color, opts.style, card.shape ?? DEFAULT_SHAPE);
  const threeD = model.defaultElevation < 90;
  const tilt = new TiltCamera(rose.getCamera());
  const mic = new BlowDetector();
  const gesture = new GestureBlow();

  const message = h(
    "div",
    { class: `card__message ${messageSizeClass(card.message)}` },
    h("p", { class: "card__text" }, ...card.message.split("\n").flatMap((line, i) => (i ? [h("br"), line] : [line]))),
    card.from ? h("p", { class: "card__from" }, `– ${card.from}`) : null,
  );

  // Atmosphäre: Schatten hinter dem Stiel, Pollen und Lichtpunkte über der Blüte
  const ambience = new Ambience(model);
  const stage = h("div", { class: "card__stage" }, ambience.shadowEl, rose.backEl, message, rose.el, ambience.motesEl, ambience.glowsEl);
  // Botschaft an die tatsächliche Blütengröße anpassen (kleine Knospe = kleinere Scheibe)
  stage.style.setProperty("--rose-scale", (model.radius / 150).toFixed(3));
  const meter = h("div", { class: "meter" }, h("div", { class: "meter__fill" }));
  const hint = h("p", { class: "card__hint" }, "Puste sanft oder kräftig ins Mikrofon …");

  const startMic = h("button", { class: "btn btn--primary" }, "Mikrofon erlauben & pusten");
  const startGesture = h("button", { class: "btn btn--ghost" }, "Ohne Mikrofon: über die Blume wischen");
  const intro = h(
    "div",
    { class: "overlay" },
    h("div", { class: "overlay__box" },
      h("p", { class: "overlay__eyebrow" }, "Jemand hat dir eine Rose geschickt"),
      h("h1", { class: "overlay__title" }, "Puste in dein Handy"),
      h("p", { class: "overlay__text" }, "Die Blütenblätter fliegen davon und geben die Botschaft frei. Je kräftiger du pustest, desto wilder."),
      startMic,
      startGesture,
      h("p", { class: "overlay__error", hidden: true }),
    ),
  );

  const again = h("button", { class: "btn btn--ghost" }, "Noch einmal");
  const create = h("a", { class: "btn btn--primary", href: "/" }, "Eigene Karte verschicken");
  const done = h("div", { class: "card__done", hidden: true }, again, create);

  const back = opts.onBack ? h("button", { class: "btn btn--link card__back", onClick: () => opts.onBack?.() }, opts.backLabel ?? "Zurück") : null;

  const view = h("section", { class: `card card--${card.color}${threeD ? " card--3d" : ""}` }, back, stage, hint, meter, done, intro);
  root.replaceChildren(view);

  // --- Interaktion -----------------------------------------------------------
  let mode: "idle" | "mic" | "gesture" = "idle";
  let last = performance.now();
  let raf = 0;

  const physics = new RosePhysics(model, {
    onRelease: (petal, blow) => {
      ambience.release(petal, rose.getCamera(), blow);
      if (blow > 0.75 && "vibrate" in navigator) navigator.vibrate?.(8);
    },
    onReveal: () => {
      view.classList.add("card--revealed");
      glowMessage(message);
      hint.textContent = "";
      done.hidden = false;
      if (mode === "mic") mic.stop();
    },
  });

  const meterFill = meter.firstElementChild as HTMLElement;
  ambience.update(rose.getCamera(), 0);

  function frame(now: number) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let intensity = 0;
    if (mode === "mic") {
      mic.update(dt);
      intensity = mic.intensity;
    }
    gesture.update(dt);
    intensity = Math.max(intensity, gesture.intensity);

    meterFill.style.transform = `scaleX(${intensity.toFixed(3)})`;
    stage.style.setProperty("--blow", intensity.toFixed(3));

    if (threeD && tilt.update(dt)) rose.setCamera(tilt.camera);

    physics.step(dt, intensity, (petal, pose, tremble) => {
      if (pose) rose.setPose(petal, pose);
      else if (Math.abs(tremble) > 0.01) rose.setTremble(petal, tremble);
      else rose.setPose(petal);
    });
    rose.setProgress(physics.progress);
    ambience.update(rose.getCamera(), physics.progress);
    raf = requestAnimationFrame(frame);
  }

  function begin(next: "mic" | "gesture") {
    mode = next;
    intro.remove();
    view.classList.add("card--active");
    gesture.attach(stage);
    if (threeD) {
      tilt.attach(stage);
      void tilt.requestPermission();
    }
    if (next === "gesture") hint.textContent = "Wische kräftig über die Blume …";
    last = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(frame);
  }

  startMic.addEventListener("click", async () => {
    const err = intro.querySelector<HTMLElement>(".overlay__error")!;
    err.hidden = true;
    startMic.disabled = true;
    startMic.textContent = "Einen Moment …";
    try {
      if (!BlowDetector.supported) throw new Error("Dein Browser unterstützt kein Mikrofon im Web.");
      await mic.start();
      begin("mic");
    } catch (e) {
      startMic.disabled = false;
      startMic.textContent = "Mikrofon erlauben & pusten";
      err.hidden = false;
      err.textContent =
        e instanceof Error && e.name === "NotAllowedError"
          ? "Mikrofon wurde nicht erlaubt. Du kannst stattdessen über die Blume wischen."
          : `Mikrofon nicht verfügbar: ${e instanceof Error ? e.message : String(e)}`;
    }
  });
  startGesture.addEventListener("click", () => begin("gesture"));

  again.addEventListener("click", async () => {
    tilt.recalibrate();
    physics.reset();
    for (const p of model.petals) rose.setPose(p);
    rose.setProgress(0);
    ambience.reset();
    ambience.update(rose.getCamera(), 0);
    view.classList.remove("card--revealed");
    done.hidden = true;
    if (mode === "mic") {
      try {
        await mic.start();
      } catch {
        mode = "gesture";
      }
    }
    hint.textContent = mode === "mic" ? "Puste sanft oder kräftig ins Mikrofon …" : "Wische kräftig über die Blume …";
  });

  // Tastatur (Desktop): Leertaste pustet.
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && mode !== "idle") {
      e.preventDefault();
      gesture.pulse(0.85);
    }
  });

  // Test-/Debug-Haken
  (window as unknown as { __pusteblume?: unknown }).__pusteblume = {
    begin,
    blow: (strength: number) => gesture.pulse(strength),
    get progress() {
      return physics.progress;
    },
    get revealed() {
      return physics.isRevealed;
    },
    get micLevel() {
      return mic.levelDb;
    },
    setView: (elevation: number, azimuth: number) => {
      tilt.set({ elevation, azimuth });
      rose.setCamera({ elevation, azimuth });
      ambience.update(rose.getCamera(), physics.progress);
    },
  };

  return {
    destroy() {
      cancelAnimationFrame(raf);
      mic.stop();
    },
  };
}
