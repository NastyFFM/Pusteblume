import type { CardData } from "../../shared/card";
import { h } from "../dom";
import { BlowStage } from "./blow-stage";
import { exposeDebug } from "./editor-view";
import { button, copy, decor, header, logoTile, meter, panel } from "./kit";

/**
 * Empfänger-Flow nach Figma: Start („Jemand hat an dich gedacht!“) → Pusten → Botschaft frei →
 * „Wunderschön!“ mit Einladung, selbst eine Nachricht zu erstellen.
 */

export interface CardViewOptions {
  onCreateOwn(): void;
}

export function mountCardView(root: HTMLElement, card: CardData, opts: CardViewOptions): { destroy(): void } {
  let stage: BlowStage | null = null;

  const start = h(
    "section",
    { class: "screen screen--start" },
    decor("start", card.color),
    h("div", { class: "screen__visual" }, logoTile()),
    copy("Jemand hat an dich gedacht!", "Entdecke die Nachricht, die dir gesendet wurde, indem du die Rosenblätter nach und nach aus der Schachtel Pustest."),
    h("div", { class: "screen__actions screen__actions--center" }, button("Entdecke die Nachricht", { class: "btn--wide", onClick: () => void showStage() })),
  );
  root.replaceChildren(start);

  async function showStage() {
    const bar = meter();
    const text = h("p", { class: "panel__text" }, "Puste in dein Mikrofon um die Rosenblätter zu bewegen und deine persönliche Post frei zu legen.");
    const blowPanel = panel(text, bar.el);
    const donePanel = panel(
      h("h2", { class: "panel__title" }, "Wunderschön!"),
      h("p", { class: "panel__text" }, "Möchtest du jetzt auch eine eigene Nachricht erstellen?"),
      button("Eigene Nachricht erstellen", { onClick: () => opts.onCreateOwn() }),
    );
    donePanel.hidden = true;

    stage = new BlowStage({
      color: card.color,
      message: card.message,
      author: card.from,
      onFrame: (_intensity, progress) => bar.set(progress),
      onReveal: () => {
        // Die freigelegte Botschaft kurz wirken lassen, dann die Einladung einblenden.
        blowPanel.classList.add("is-leaving");
        setTimeout(() => {
          blowPanel.hidden = true;
          donePanel.hidden = false;
        }, 1800);
      },
    });
    const el = h("section", { class: "screen screen--stage" }, stage.el, header(), blowPanel, donePanel);
    exposeDebug(stage, el);
    root.replaceChildren(el);
    // Mikrofon aus der Nutzergeste (Klick auf „Entdecke die Nachricht“) heraus anfragen.
    const mode = await stage.start();
    if (mode === "gesture") text.textContent = "Ohne Mikrofon: Wische kräftig über die Blätter, um sie wegzupusten und deine persönliche Post frei zu legen.";
  }

  return {
    destroy() {
      stage?.destroy();
    },
  };
}
