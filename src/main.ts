import type { CardData } from "../shared/card";
import { h } from "./dom";
import { decodeCard } from "../shared/link";
import { mountCardView } from "./ui/card-view";
import { mountEditorView } from "./ui/editor-view";
import { loadAtlas } from "./rose/sprite-model";
import type { RoseStyle } from "./rose/factory";

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

/** Standard-Atlas; ?rose=<name> wählt einen anderen, ?rose=svg die gezeichnete Rose. */
const DEFAULT_ROSE = "rose2";

/** Rosen-Darstellung aus der URL. Fällt auf SVG zurück, wenn der Atlas nicht lädt. */
let roseStyle: RoseStyle = { kind: "svg" };
let roseStyleLoaded: Promise<void> | null = null;

function ensureRoseStyle(): Promise<void> {
  roseStyleLoaded ??= (async () => {
    const name = new URLSearchParams(location.search).get("rose") ?? DEFAULT_ROSE;
    if (name === "svg" || !/^[a-z0-9-]+$/i.test(name)) return;
    try {
      const { atlas, baseUrl } = await loadAtlas(name);
      roseStyle = { kind: "sprite", atlas, baseUrl };
    } catch (e) {
      console.warn("Sprite-Atlas konnte nicht geladen werden, nutze SVG-Rose.", e);
    }
  })();
  return roseStyleLoaded;
}

/** Hängt den ?rose-Parameter an interne Navigationen an, damit die Darstellung erhalten bleibt. */
function withStyle(path: string): string {
  return path + location.search;
}

function showEditor() {
  activeView?.destroy();
  activeView = null;
  document.title = "Pusteblume · Interaktive Grußkarte";
  mountEditorView(app, {
    style: roseStyle,
    // Entwurf wiederherstellen: nach Vorschau, Zurück-Navigation oder Neuladen.
    initial: readJson<Partial<CardData>>(DRAFT_KEY) ?? undefined,
    onChange(draft) {
      writeJson(DRAFT_KEY, draft);
    },
    onPreview(card) {
      writeJson(PREVIEW_KEY, card);
      history.pushState({}, "", withStyle("/preview"));
      void route();
    },
  });
}

function showCard(card: CardData, opts?: { preview?: boolean }) {
  activeView?.destroy();
  document.title = "Eine Rose für dich 🌹";
  activeView = mountCardView(app, card, {
    style: roseStyle,
    onBack: opts?.preview
      ? () => {
          history.pushState({}, "", withStyle("/"));
          void route();
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

async function route() {
  await ensureRoseStyle();
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

window.addEventListener("popstate", () => void route());
void route();
