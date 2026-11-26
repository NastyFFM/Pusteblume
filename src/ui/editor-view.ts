import { CARD_COLORS, COLOR_INFO, QUOTES, validateCard, type CardColor, type CardData } from "../../shared/card";
import { createCardLink } from "../api";
import { h } from "../dom";
import { petalImage } from "../petals/bed";
import { BlowStage } from "./blow-stage";
import { backButton, button, colorSwatch, copy, decor, header, logoTile, meter, panel, sendReadyIcon, stepper } from "./kit";

/**
 * Ersteller-Flow nach Figma: Start → Farbe → Nachricht → Probieren → Versenden.
 * Jeder Schritt ist ein eigener Bildschirm; die Navigation läuft über main.ts (Pfade), der
 * Entwurf (Farbe, Nachricht) wird über onChange gesichert und bei jedem Schritt übergeben.
 */

export type EditorStep = "start" | "color" | "message" | "try" | "send";

export const EDITOR_PATHS: Record<EditorStep, string> = {
  start: "/",
  color: "/farbe",
  message: "/nachricht",
  try: "/probieren",
  send: "/versenden",
};

export interface EditorDraft {
  color: CardColor;
  quote: number;
}

export const DEFAULT_DRAFT: EditorDraft = { color: "rosa", quote: 2 };

export interface EditorOptions {
  step: EditorStep;
  draft: EditorDraft;
  onChange(draft: EditorDraft): void;
  go(step: EditorStep): void;
}

function toCard(draft: EditorDraft): CardData {
  const v = validateCard({ color: draft.color, quote: draft.quote });
  if (!v.ok) throw new Error(v.error);
  return v.card;
}

export function mountEditorView(root: HTMLElement, opts: EditorOptions): { destroy(): void } {
  const draft: EditorDraft = { ...DEFAULT_DRAFT, ...opts.draft };
  let cleanup: (() => void) | null = null;

  const screen = (() => {
    switch (opts.step) {
      case "start":
        return startScreen(opts);
      case "color":
        return colorScreen(draft, opts);
      case "message":
        return messageScreen(draft, opts);
      case "try": {
        const r = tryScreen(toCard(draft), opts);
        cleanup = r.destroy;
        return r.el;
      }
      case "send":
        return sendScreen(toCard(draft), opts);
    }
  })();
  root.replaceChildren(screen);
  return { destroy: () => cleanup?.() };
}

// --- Start -------------------------------------------------------------------
function startScreen(opts: EditorOptions): HTMLElement {
  return h(
    "section",
    { class: "screen screen--start" },
    decor("start", "rosa"),
    h("div", { class: "screen__visual" }, logoTile()),
    copy("Sende eine Valentins-Nachricht", "Sende einem Lieblingsmensch eine besondere Nachricht. Wähle eine Farbe, eine Nachricht und versende Sie dann mit einem persönlichen Link an eine Person!"),
    h("div", { class: "screen__actions screen__actions--center" }, button("Jetzt loslegen", { class: "btn--wide", onClick: () => opts.go("color") })),
  );
}

// --- Farbe -------------------------------------------------------------------
function colorScreen(draft: EditorDraft, opts: EditorOptions): HTMLElement {
  const hero = h("img", { class: "hero__petal hero__petal--main", src: petalImage("a", draft.color), alt: "" });
  const label = h("p", { class: "choice__label" }, COLOR_INFO[draft.color].label);
  const swatches = CARD_COLORS.map((c) =>
    colorSwatch(c, c === draft.color, (color) => {
      draft.color = color;
      opts.onChange(draft);
      hero.src = petalImage("a", color);
      label.textContent = COLOR_INFO[color].label;
      for (const s of swatches) {
        const active = s.classList.contains(`swatch--${color}`);
        s.classList.toggle("is-active", active);
        s.setAttribute("aria-pressed", String(active));
      }
    }),
  );
  return h(
    "section",
    { class: "screen" },
    decor("color", "rosa"),
    header(),
    stepper(1),
    h(
      "div",
      { class: "screen__visual hero" },
      h("img", { class: "hero__petal hero__petal--left", src: petalImage("c", "white"), alt: "" }),
      h("img", { class: "hero__petal hero__petal--right", src: petalImage("b", "beige"), alt: "" }),
      hero,
    ),
    copy("Wähle eine Farbe", "Welche Farbe denkst du passt am aller besten für diesen Anlass?"),
    h("div", { class: "choice" }, h("div", { class: "choice__row" }, ...swatches), label),
    h("div", { class: "screen__actions" }, backButton(() => opts.go("start")), button("Weiter", { iconRight: "arrowRight", onClick: () => opts.go("message") })),
  );
}

// --- Nachricht ---------------------------------------------------------------
function messageScreen(draft: EditorDraft, opts: EditorOptions): HTMLElement {
  const text = h("p", { class: "quote__text" }, QUOTES[draft.quote]!.text);
  const author = h("footer", { class: "quote__author" }, QUOTES[draft.quote]!.author);
  const label = h("p", { class: "choice__label" }, `Nachricht ${draft.quote + 1}`);
  const options = QUOTES.map((_, i) =>
    h(
      "button",
      {
        type: "button",
        class: `option${i === draft.quote ? " is-active" : ""}`,
        "aria-label": `Nachricht ${i + 1}`,
        "aria-pressed": String(i === draft.quote),
        onClick: () => {
          draft.quote = i;
          opts.onChange(draft);
          text.textContent = QUOTES[i]!.text;
          author.textContent = QUOTES[i]!.author;
          label.textContent = `Nachricht ${i + 1}`;
          options.forEach((o, j) => {
            o.classList.toggle("is-active", j === i);
            o.setAttribute("aria-pressed", String(j === i));
          });
        },
      },
      String(i + 1),
    ),
  );
  return h(
    "section",
    { class: "screen screen--quote" },
    h("div", { class: "stage__corner stage__corner--tl", "aria-hidden": "true" }),
    h("div", { class: "stage__corner stage__corner--br", "aria-hidden": "true" }),
    h("div", { class: "quote" }, h("div", { class: "quote__paper" }), h("blockquote", { class: "quote__body" }, text, author)),
    decor("quote", draft.color),
    header(),
    stepper(2),
    h("div", { class: "screen__visual" }),
    copy("Wähle eine Nachricht", "Suche dir eine passende Nachricht aus den derzeitigen Vorschlägen aus."),
    h("div", { class: "choice" }, h("div", { class: "choice__row" }, ...options), label),
    h("div", { class: "screen__actions" }, backButton(() => opts.go("color")), button("Weiter", { iconRight: "arrowRight", onClick: () => opts.go("try") })),
  );
}

// --- Probieren ---------------------------------------------------------------
function tryScreen(card: CardData, opts: EditorOptions): { el: HTMLElement; destroy(): void } {
  const bar = meter();
  const title = h("h2", { class: "panel__title" }, "Probiere es erstmal selbst aus");
  const text = h("p", { class: "panel__text" }, "Puste in dein Mikrofon um zu sehen wie deine Nachricht ankommen wird.");
  const go = button("Okay los", { iconRight: "arrowRight" });
  const done = button("Fertig", { iconRight: "check", onClick: () => opts.go("send") });
  done.hidden = true;

  const stage = new BlowStage({
    color: card.color,
    message: card.message,
    author: card.from,
    onFrame: (_intensity, progress) => bar.set(progress),
    onReveal: () => {
      title.hidden = true;
      text.textContent = "So kommt deine Nachricht an. Zufrieden?";
      done.hidden = false;
    },
  });

  function started(mode: "mic" | "gesture") {
    go.hidden = true;
    title.hidden = true;
    text.textContent = mode === "mic" ? "Puste in dein Mikrofon um die Rosenblätter zu bewegen und deine persönliche Post frei zu legen." : "Ohne Mikrofon: Wische kräftig über die Blätter, um sie wegzupusten.";
  }
  go.addEventListener("click", async () => {
    go.disabled = true;
    started(await stage.start());
  });

  const el = h(
    "section",
    { class: "screen screen--stage" },
    stage.el,
    header(),
    stepper(3),
    panel(title, text, bar.el, h("div", { class: "panel__actions" }, backButton(() => opts.go("message")), go, done)),
  );
  exposeDebug(stage, el, () => {
    stage.beginGesture();
    started("gesture");
  });
  return { el, destroy: () => stage.destroy() };
}

// --- Versenden ---------------------------------------------------------------
function sendScreen(card: CardData, opts: EditorOptions): HTMLElement {
  const url = createCardLink(card);
  const copyBtn = button("Link kopieren", { iconLeft: "copy", class: "btn--wide" });
  const fallback = h("p", { class: "link-fallback", hidden: true }, url);
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(url);
      copyBtn.querySelector(".btn__label")!.textContent = "Kopiert ✓";
      setTimeout(() => (copyBtn.querySelector(".btn__label")!.textContent = "Link kopieren"), 1800);
    } catch {
      fallback.hidden = false;
    }
    // Wo vorhanden, zusätzlich das Teilen-Menü anbieten (Messenger, Mail).
    navigator.share?.({ title: "Eine Valentins-Nachricht für dich", url }).catch(() => {});
  });
  return h(
    "section",
    { class: "screen" },
    decor("send", card.color),
    header(),
    h("div", { class: "screen__visual" }, sendReadyIcon()),
    copy("Versende deinen Valentins-Gruß", "Kopiere deinen Link und sende Ihn an deinen Lieblingsmenschen via E-Mail oder einer Messenger Chat App deiner Wahl."),
    fallback,
    h(
      "div",
      { class: "screen__actions screen__actions--stack" },
      copyBtn,
      button("Neue Nachricht erstellen", { kind: "ghost", class: "btn--wide", onClick: () => opts.go("start") }),
    ),
  );
}

/** Debug-Haken für Playwright: window.__pusteblume (siehe CLAUDE.md). */
export function exposeDebug(stage: BlowStage, el: HTMLElement, begin: () => void = () => stage.beginGesture()) {
  (window as unknown as { __pusteblume?: unknown }).__pusteblume = {
    begin,
    blow: (strength: number) => stage.blow(strength),
    get progress() {
      return stage.progress;
    },
    get revealed() {
      return stage.revealed;
    },
    get mode() {
      return stage.activeMode;
    },
    el,
  };
}
