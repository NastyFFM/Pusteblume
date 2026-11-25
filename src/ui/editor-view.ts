import { LIMITS, ROSE_COLORS, validateCard, type CardData, type RoseColor } from "../../shared/card";
import { createCardLink } from "../api";
import { h } from "../dom";
import { createRoseModel } from "../rose/model";
import { RoseSvg } from "../rose/svg-renderer";

const COLOR_LABELS: Record<RoseColor, string> = { red: "Rot", white: "Weiß", yellow: "Gelb" };

export interface EditorOptions {
  initial?: Partial<CardData>;
  onPreview(card: CardData): void;
}

export function mountEditorView(root: HTMLElement, opts: EditorOptions) {
  const state: CardData = {
    color: opts.initial?.color ?? "red",
    message: opts.initial?.message ?? "",
    from: opts.initial?.from ?? "",
  };

  const model = createRoseModel();
  const rose = new RoseSvg(model, state.color);

  const swatches = ROSE_COLORS.map((color) =>
    h(
      "button",
      {
        type: "button",
        class: `swatch swatch--${color}${color === state.color ? " is-active" : ""}`,
        "aria-label": `Rose ${COLOR_LABELS[color]}`,
        "aria-pressed": String(color === state.color),
        onClick: () => {
          state.color = color;
          rose.setColor(color);
          preview.className = `editor__preview card--${color}`;
          for (const s of swatches) {
            const active = s.classList.contains(`swatch--${color}`);
            s.classList.toggle("is-active", active);
            s.setAttribute("aria-pressed", String(active));
          }
        },
      },
      h("span", { class: "swatch__label" }, COLOR_LABELS[color]),
    ),
  );

  const counter = h("span", { class: "field__counter" }, `0 / ${LIMITS.message}`);
  const message = h("textarea", {
    id: "message",
    class: "field__input",
    rows: 5,
    maxlength: LIMITS.message,
    placeholder: "Alles Liebe zum Geburtstag! Ich denke an dich …",
  }) as HTMLTextAreaElement;
  message.value = state.message;
  message.addEventListener("input", () => {
    state.message = message.value;
    counter.textContent = `${message.value.length} / ${LIMITS.message}`;
  });
  counter.textContent = `${message.value.length} / ${LIMITS.message}`;

  const from = h("input", { id: "from", class: "field__input", type: "text", maxlength: LIMITS.from, placeholder: "Dein Name (optional)" }) as HTMLInputElement;
  from.value = state.from ?? "";
  from.addEventListener("input", () => (state.from = from.value));

  const error = h("p", { class: "form__error", role: "alert", hidden: true });

  const previewBtn = h("button", { type: "button", class: "btn btn--ghost" }, "Vorschau: Karte testen");
  const submitBtn = h("button", { type: "submit", class: "btn btn--primary" }, "Link erstellen");

  const resultLink = h("a", { class: "result__link", href: "#", target: "_blank", rel: "noopener" });
  const copyBtn = h("button", { type: "button", class: "btn btn--ghost" }, "Link kopieren");
  const shareBtn = h("button", { type: "button", class: "btn btn--primary" }, "Teilen");
  const resultNote = h("p", { class: "result__note", hidden: true });
  const result = h(
    "div",
    { class: "result", hidden: true },
    h("h2", { class: "result__title" }, "Deine Karte ist fertig 🌹"),
    h("p", {}, "Schick diesen Link per WhatsApp, Mail oder Nachricht. Am Handy pusten, fertig."),
    resultLink,
    resultNote,
    h("div", { class: "row" }, copyBtn, shareBtn),
  );

  function getValidated(): CardData | null {
    const v = validateCard(state);
    if (!v.ok) {
      error.hidden = false;
      error.textContent = v.error;
      return null;
    }
    error.hidden = true;
    return v.card;
  }

  previewBtn.addEventListener("click", () => {
    const card = getValidated();
    if (card) opts.onPreview(card);
  });

  const form = h(
    "form",
    {
      class: "editor__form",
      onSubmit: async (e: Event) => {
        e.preventDefault();
        const card = getValidated();
        if (!card) return;
        submitBtn.disabled = true;
        submitBtn.textContent = "Wird erstellt …";
        try {
          const { url, note } = await createCardLink(card);
          resultNote.hidden = !note;
          resultNote.textContent = note ?? "";
          resultLink.textContent = url;
          resultLink.setAttribute("href", url);
          result.hidden = false;
          result.scrollIntoView({ behavior: "smooth", block: "nearest" });
          shareBtn.hidden = !("share" in navigator);
        } catch (err) {
          error.hidden = false;
          error.textContent = err instanceof Error ? err.message : "Der Link konnte nicht erstellt werden.";
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = "Link erstellen";
        }
      },
    },
    h("fieldset", { class: "field" }, h("legend", { class: "field__label" }, "Welche Rose?"), h("div", { class: "swatches" }, ...swatches)),
    h("div", { class: "field" }, h("label", { class: "field__label", for: "message" }, "Deine Botschaft"), message, counter),
    h("div", { class: "field" }, h("label", { class: "field__label", for: "from" }, "Von"), from),
    error,
    h("div", { class: "row" }, previewBtn, submitBtn),
    result,
  );

  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(resultLink.textContent ?? "");
      copyBtn.textContent = "Kopiert ✓";
      setTimeout(() => (copyBtn.textContent = "Link kopieren"), 1800);
    } catch {
      copyBtn.textContent = "Bitte manuell kopieren";
    }
  });
  shareBtn.addEventListener("click", () => {
    navigator.share?.({ title: "Eine Rose für dich", text: "Puste ins Handy und schau, was passiert 🌹", url: resultLink.textContent ?? "" }).catch(() => {});
  });

  const preview = h("div", { class: `editor__preview card--${state.color}` }, rose.backEl, rose.el);

  const view = h(
    "section",
    { class: "editor" },
    h("header", { class: "editor__head" },
      h("p", { class: "eyebrow" }, "Pusteblume"),
      h("h1", { class: "editor__title" }, "Eine Rose, die sich öffnet, wenn man pustet."),
      h("p", { class: "editor__lead" }, "Wähle die Farbe, schreib deine Botschaft und verschick den Link. Der Empfänger pustet ins Handy, die Blätter fliegen davon und deine Worte kommen zum Vorschein."),
    ),
    preview,
    form,
  );
  root.replaceChildren(view);
}
