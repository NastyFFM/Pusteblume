import type { CardData } from "../shared/card";
import { fetchCard } from "./api";
import { h } from "./dom";
import { mountCardView } from "./ui/card-view";
import { mountEditorView } from "./ui/editor-view";

const app = document.getElementById("app")!;
const PREVIEW_KEY = "pusteblume:preview";

let activeView: { destroy(): void } | null = null;

function showEditor(initial?: Partial<CardData>) {
  activeView?.destroy();
  activeView = null;
  document.title = "Pusteblume · Interaktive Grußkarte";
  mountEditorView(app, {
    initial,
    onPreview(card) {
      sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(card));
      history.pushState({}, "", "/preview");
      route();
    },
  });
}

function showCard(card: CardData, opts?: { preview?: boolean }) {
  activeView?.destroy();
  document.title = "Eine Rose für dich 🌹";
  activeView = mountCardView(app, card, {
    onBack: opts?.preview
      ? () => {
          history.pushState({}, "", "/");
          route();
        }
      : undefined,
    backLabel: "← Zurück zum Editor",
  });
}

function showError(text: string) {
  activeView?.destroy();
  activeView = null;
  app.replaceChildren(
    h("section", { class: "notice" },
      h("p", { class: "eyebrow" }, "Pusteblume"),
      h("h1", { class: "notice__title" }, "Hoppla"),
      h("p", { class: "notice__text" }, text),
      h("a", { class: "btn btn--primary", href: "/" }, "Eigene Karte erstellen"),
    ),
  );
}

function showLoading() {
  app.replaceChildren(h("section", { class: "notice" }, h("p", { class: "notice__text" }, "Deine Rose wird gepflückt …")));
}

async function route() {
  const path = location.pathname.replace(/\/+$/, "") || "/";

  if (path === "/") return showEditor();

  if (path === "/preview") {
    const raw = sessionStorage.getItem(PREVIEW_KEY);
    if (!raw) return showEditor();
    return showCard(JSON.parse(raw) as CardData, { preview: true });
  }

  const match = /^\/c\/([^/]+)$/.exec(path);
  if (match) {
    showLoading();
    try {
      const card = await fetchCard(match[1]!);
      showCard(card);
    } catch (e) {
      showError(e instanceof Error ? e.message : "Diese Karte konnte nicht geladen werden.");
    }
    return;
  }

  showError("Diese Seite gibt es nicht.");
}

window.addEventListener("popstate", route);
void route();
