import type { CardData } from "../shared/card";
import { h } from "./dom";
import { decodeCard } from "../shared/link";
import { mountCardView } from "./ui/card-view";
import { mountEditorView } from "./ui/editor-view";

const app = document.getElementById("app")!;
const PREVIEW_KEY = "pusteblume:preview";
const DRAFT_KEY = "pusteblume:draft";

function readJson<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeJson(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Speicher nicht verfügbar (z. B. privater Modus): Entwurf geht dann beim Neuladen verloren.
  }
}

let activeView: { destroy(): void } | null = null;

function showEditor() {
  activeView?.destroy();
  activeView = null;
  document.title = "Pusteblume · Interaktive Grußkarte";
  mountEditorView(app, {
    // Entwurf wiederherstellen: nach Vorschau, Zurück-Navigation oder Neuladen.
    initial: readJson<Partial<CardData>>(DRAFT_KEY) ?? undefined,
    onChange(draft) {
      writeJson(DRAFT_KEY, draft);
    },
    onPreview(card) {
      writeJson(PREVIEW_KEY, card);
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

function route() {
  const path = location.pathname.replace(/\/+$/, "") || "/";

  if (path === "/") return showEditor();

  if (path === "/preview") {
    const card = readJson<CardData>(PREVIEW_KEY);
    if (!card) return showEditor();
    return showCard(card, { preview: true });
  }

  // Frontend-Link: Karte steckt vollständig in der URL.
  const encoded = /^\/v\/([^/]+)$/.exec(path);
  if (encoded) {
    const card = decodeCard(encoded[1]!);
    if (!card) return showError("Dieser Link ist unvollständig oder beschädigt.");
    return showCard(card);
  }

  showError("Diese Seite gibt es nicht.");
}

window.addEventListener("popstate", route);
route();
