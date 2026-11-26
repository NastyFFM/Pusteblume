import { h } from "./dom";
import { decodeCard } from "../shared/link";
import { mountCardView } from "./ui/card-view";
import { DEFAULT_DRAFT, EDITOR_PATHS, mountEditorView, type EditorDraft, type EditorStep } from "./ui/editor-view";

const app = document.getElementById("app")!;
const DRAFT_KEY = "pusteblume:draft";

function readDraft(): EditorDraft {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? { ...DEFAULT_DRAFT, ...(JSON.parse(raw) as Partial<EditorDraft>) } : { ...DEFAULT_DRAFT };
  } catch {
    return { ...DEFAULT_DRAFT };
  }
}

function writeDraft(draft: EditorDraft | null) {
  try {
    if (draft) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
    else sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    // Speicher nicht verfügbar (z. B. privater Modus): Entwurf geht dann beim Neuladen verloren.
  }
}

let activeView: { destroy(): void } | null = null;

// ?fx=off schaltet Hintergrund-Unschärfe des Panels ab (zum Eingrenzen von Darstellungsproblemen am Handy)
document.documentElement.dataset.fx = new URLSearchParams(location.search).get("fx") ?? "";

/** Interne Navigation; der Query-String (z. B. ?fx=off) bleibt erhalten. */
function navigate(path: string) {
  history.pushState({}, "", path + location.search);
  void route();
}

function showEditor(step: EditorStep) {
  activeView?.destroy();
  document.title = "Valentins-Nachricht erstellen";
  activeView = mountEditorView(app, {
    step,
    draft: readDraft(),
    onChange: writeDraft,
    go(next) {
      if (next === "start" && step === "send") writeDraft(null);
      navigate(EDITOR_PATHS[next]);
    },
  });
}

function showError(text: string) {
  activeView?.destroy();
  activeView = null;
  app.replaceChildren(
    h("section", { class: "screen screen--start" },
      h("div", { class: "screen__visual" }),
      h("div", { class: "copy" }, h("h1", { class: "copy__title" }, "Hoppla"), h("p", { class: "copy__text" }, text)),
      h("div", { class: "screen__actions screen__actions--center" }, h("a", { class: "btn btn--primary btn--wide", href: "/" }, h("span", { class: "btn__label" }, "Eigene Nachricht erstellen"))),
    ),
  );
}

async function route() {
  const path = location.pathname.replace(/\/+$/, "") || "/";

  const step = (Object.keys(EDITOR_PATHS) as EditorStep[]).find((s) => EDITOR_PATHS[s] === path);
  if (step) return showEditor(step);

  // Frontend-Link: Karte steckt vollständig in der URL.
  const encoded = /^\/v\/([^/]+)$/.exec(path);
  if (encoded) {
    const card = decodeCard(encoded[1]!);
    if (!card) return showError("Dieser Link ist unvollständig oder beschädigt.");
    activeView?.destroy();
    document.title = "Jemand hat an dich gedacht 🌹";
    activeView = mountCardView(app, card, { onCreateOwn: () => navigate("/") });
    return;
  }

  showError("Diese Seite gibt es nicht.");
}

window.addEventListener("popstate", () => void route());
void route();
