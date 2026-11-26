import { COLOR_INFO, type CardColor } from "../../shared/card";
import { h } from "../dom";
import { petalImage } from "../petals/bed";

/**
 * Bausteine der Bildschirme nach dem Figma-Design (Valentines App): Kopfzeile mit Logo,
 * Schritt-Anzeige, Buttons, Panel, Zitatkarte und Deko-Blätter.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** Icons aus dem Design (24×24, Strich 2, Farbe über currentColor). */
const ICON_PATHS = {
  arrowLeft: "M12 19L5 12L12 5M19 12H5",
  arrowRight: "M5 12H19M12 5L19 12L12 19",
  check: "M20 6L9 17L4 12",
  copy: "M10 8H20C21.1 8 22 8.9 22 10V20C22 21.1 21.1 22 20 22H10C8.9 22 8 21.1 8 20V10C8 8.9 8.9 8 10 8ZM4 16C2.9 16 2 15.1 2 14V4C2 2.9 2.9 2 4 2H14C15.1 2 16 2.9 16 4",
} as const;
export type IconName = keyof typeof ICON_PATHS;

export function icon(name: IconName): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("icon");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", ICON_PATHS[name]);
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "2");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-linejoin", "round");
  svg.appendChild(path);
  return svg;
}

/** Umschlag mit Haken („Send Ready“) vom Versenden-Bildschirm. */
export function sendReadyIcon(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 176 123");
  svg.setAttribute("class", "send-ready");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML =
    '<g fill="none" stroke="#8D1D32" stroke-width="6" stroke-linecap="round" stroke-linejoin="round">' +
    '<path fill="#FFECEF" d="M143.7 3H18.6C10 3 3 8.8 3 16v77.8c0 7.1 7 13 15.6 13h125.1c8.7 0 15.7-5.9 15.7-13V16c0-7.2-7-13-15.7-13Z"/>' +
    '<path d="M159.4 23.1 89.1 59.4a18.4 18.4 0 0 1-15.7 0L3 23.1"/>' +
    '<circle cx="141.6" cy="88.9" r="31" fill="#FFECEF"/>' +
    '<path d="m154 80.4-17.6 17-8-7.7"/></g>';
  return svg;
}

/** Kopfzeile: Logo mittig (64 px hoch). */
export function header(): HTMLElement {
  return h("header", { class: "head" }, h("img", { class: "head__logo", src: "/design/logo.svg", alt: "Pandora", width: 119, height: 24 }));
}

/** Schritt-Anzeige mit drei Segmenten; `step` 1..3 ist hervorgehoben. */
export function stepper(step: 1 | 2 | 3): HTMLElement {
  return h(
    "div",
    { class: "stepper", role: "progressbar", "aria-valuemin": 1, "aria-valuemax": 3, "aria-valuenow": step, "aria-label": `Schritt ${step} von 3` },
    ...[1, 2, 3].map((i) => h("span", { class: `stepper__seg${i === step ? " is-active" : ""}` })),
  );
}

export type ButtonKind = "primary" | "ghost";

export interface ButtonOptions {
  kind?: ButtonKind;
  /** Icon rechts (Pfeil, Haken) oder links (Kopieren) vom Text */
  iconLeft?: IconName;
  iconRight?: IconName;
  onClick?: (e: Event) => void;
  class?: string;
  type?: "button" | "submit";
}

export function button(label: string, opts: ButtonOptions = {}): HTMLButtonElement {
  const btn = h(
    "button",
    { type: opts.type ?? "button", class: `btn btn--${opts.kind ?? "primary"}${opts.class ? ` ${opts.class}` : ""}` },
    opts.iconLeft ? icon(opts.iconLeft) : null,
    h("span", { class: "btn__label" }, label),
    opts.iconRight ? icon(opts.iconRight) : null,
  );
  if (opts.onClick) btn.addEventListener("click", opts.onClick);
  return btn;
}

/** Runder Zurück-Button (52 px, Rahmen). */
export function backButton(onClick: () => void, label = "Zurück"): HTMLButtonElement {
  return h("button", { type: "button", class: "btn btn--icon", "aria-label": label, onClick }, icon("arrowLeft"));
}

/** Überschrift + Fließtext, zentriert (Inter Bold 18 / Medium 16). */
export function copy(title: string, text: string): HTMLElement {
  return h("div", { class: "copy" }, h("h1", { class: "copy__title" }, title), h("p", { class: "copy__text" }, text));
}

/** Halbtransparentes Panel am unteren Rand. */
export function panel(...children: (Node | null)[]): HTMLElement {
  return h("div", { class: "panel" }, ...children);
}

/** Fortschrittsbalken des Pustens (120×8). */
export function meter(): { el: HTMLElement; set(value: number): void } {
  const fill = h("span", { class: "meter__fill" });
  const el = h("div", { class: "meter", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": 0 }, fill);
  return {
    el,
    set(value: number) {
      const v = Math.max(0, Math.min(1, value));
      fill.style.transform = `scaleX(${v.toFixed(3)})`;
      el.setAttribute("aria-valuenow", String(Math.round(v * 100)));
    },
  };
}

/** Logo-Kachel der Startbildschirme (340×340, Verlauf). */
export function logoTile(): HTMLElement {
  return h("div", { class: "tile" }, h("img", { class: "tile__logo", src: "/design/logo.svg", alt: "Pandora", width: 208, height: 42 }));
}

/** Zitatkarte: Papierstruktur mit Text in Instrument Serif und Autor. */
export function quoteCard(text: string, author?: string): HTMLElement {
  return h(
    "div",
    { class: "quote" },
    h("div", { class: "quote__paper" }),
    h("blockquote", { class: "quote__body" }, h("p", { class: "quote__text" }, text), author ? h("footer", { class: "quote__author" }, author) : null),
  );
}

/**
 * Deko-Blätter am Rand, Lagen wie im Figma (inset in % des 393×852-Rahmens, Drehung in Grad).
 * Die Blätter liegen außerhalb des Inhalts und sind rein dekorativ.
 */
export type DecorPreset = "start" | "color" | "send" | "quote";
const DECOR: Record<DecorPreset, { inset: [number, number, number, number]; rot: number; variant?: "a" | "b" | "c" }[]> = {
  start: [
    { inset: [35.3, -20, 47, 80.6], rot: 23 },
    { inset: [40.6, -1.3, 40.6, 60], rot: 147 },
    { inset: [41.2, -17.8, 41.7, 82.2], rot: 105 },
    { inset: [73.6, 84.4, 7.3, -26.1], rot: -38 },
    { inset: [91.4, -25.5, -10.5, 83.7], rot: -38 },
    { inset: [-13.9, -9.8, 95.2, 70.2], rot: 62 },
    { inset: [10.7, 80, 70.4, -20.3], rot: 121 },
  ],
  color: [{ inset: [-13.9, -9.8, 95.2, 70.2], rot: 62 }],
  send: [
    { inset: [-13.9, -9.8, 95.2, 70.2], rot: 62 },
    { inset: [73.6, 84.4, 7.3, -26.1], rot: -38 },
    { inset: [10.7, 80, 70.4, -20.3], rot: 121 },
    { inset: [35.9, -20.1, 46, 79.9], rot: 153 },
    { inset: [91.4, -25.5, -10.5, 83.7], rot: -38 },
  ],
  quote: [
    { inset: [10.2, 75.3, 77.9, 0], rot: 74 },
    { inset: [33.8, 84.5, 49.1, -22.9], rot: 19 },
    { inset: [48.1, -0.4, 40.3, 76.6], rot: 83 },
    { inset: [55, -11.4, 27.8, 73], rot: 19 },
    { inset: [-13.9, -9.8, 95.2, 70.2], rot: 62 },
  ],
};

export function decor(preset: DecorPreset, color: CardColor): HTMLElement {
  const layer = h("div", { class: "decor", "aria-hidden": "true" });
  for (const d of DECOR[preset]) {
    const img = h("img", { class: "decor__petal", src: petalImage(d.variant ?? "a", color), alt: "", draggable: false });
    // Ersetzte Elemente dehnen sich nicht über inset; Kasten daher aus den Figma-Insets berechnen.
    const [top, right, bottom, left] = d.inset;
    img.style.left = `${left}%`;
    img.style.top = `${top}%`;
    img.style.width = `${100 - left - right}%`;
    img.style.height = `${100 - top - bottom}%`;
    img.style.transform = `rotate(${d.rot}deg)`;
    layer.appendChild(img);
  }
  return layer;
}

/** Farbkreise des Farb-Schritts. */
export function colorSwatch(color: CardColor, active: boolean, onSelect: (c: CardColor) => void): HTMLButtonElement {
  const btn = h("button", {
    type: "button",
    class: `swatch swatch--${color}${active ? " is-active" : ""}`,
    "aria-label": COLOR_INFO[color].label,
    "aria-pressed": String(active),
    onClick: () => onSelect(color),
  });
  btn.style.setProperty("--swatch", COLOR_INFO[color].hex);
  return btn;
}
