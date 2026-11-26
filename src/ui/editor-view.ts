import { DEFAULT_SHAPE, LIMITS, ROSE_COLORS, SHAPE_LIMITS, normalizeShape, validateCard, type CardData, type RoseColor, type RoseShape } from "../../shared/card";
import { createCardLink } from "../api";
import { h } from "../dom";
import { createRose, type RoseStyle } from "../rose/factory";

const COLOR_LABELS: Record<RoseColor, string> = { red: "Rot", white: "Weiß", yellow: "Gelb" };

export interface EditorOptions {
  initial?: Partial<CardData>;
  onPreview(card: CardData): void;
  /** Wird bei jeder Eingabe aufgerufen, um den Entwurf zu sichern. */
  onChange?(draft: CardData): void;
  style?: RoseStyle;
}

export function mountEditorView(root: HTMLElement, opts: EditorOptions) {
  const state: CardData & { shape: RoseShape } = {
    color: opts.initial?.color ?? "red",
    message: opts.initial?.message ?? "",
    from: opts.initial?.from ?? "",
    shape: normalizeShape(opts.initial?.shape ?? DEFAULT_SHAPE),
  };

  // Die Vorschau-Rose wird bei Formänderungen neu aufgebaut.
  let instance = createRose(state.color, opts.style, state.shape);
  const preview = h("div", { class: `editor__preview card--${state.color}` }, instance.rose.backEl, instance.rose.el);
  function rebuildPreview() {
    instance = createRose(state.color, opts.style, state.shape);
    preview.replaceChildren(instance.rose.backEl, instance.rose.el);
  }

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
          instance.rose.setColor(color, instance.spriteUrlFor(color));
          opts.onChange?.(state);
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
    opts.onChange?.(state);
    counter.textContent = `${message.value.length} / ${LIMITS.message}`;
  });
  counter.textContent = `${message.value.length} / ${LIMITS.message}`;

  const from = h("input", { id: "from", class: "field__input", type: "text", maxlength: LIMITS.from, placeholder: "Dein Name (optional)" }) as HTMLInputElement;
  from.value = state.from ?? "";
  from.addEventListener("input", () => {
    state.from = from.value;
    opts.onChange?.(state);
  });

  const error = h("p", { class: "form__error", role: "alert", hidden: true });

  // --- Blütenform -------------------------------------------------------------
  type ShapeKey = keyof RoseShape;
  const SLIDERS: { key: ShapeKey; label: string; format: (v: number) => string }[] = [
    { key: "petals", label: "Blätter", format: (v) => `${Math.round(v)}` },
    { key: "openness", label: "Öffnung", format: (v) => (v < 0.2 ? "Knospe" : v < 0.45 ? "halb offen" : v < 0.75 ? "offen" : "voll erblüht") },
    { key: "spread", label: "Breite", format: (v) => `${Math.round(v * 100)} %` },
    { key: "twist", label: "Drehung", format: (v) => `${Math.round(v * 100)} %` },
  ];
  const sliderInputs = new Map<ShapeKey, { input: HTMLInputElement; value: HTMLElement }>();
  const sliderRows = SLIDERS.map(({ key, label, format }) => {
    const lim = SHAPE_LIMITS[key];
    const value = h("span", { class: "slider__value" }, format(state.shape[key]));
    const input = h("input", { type: "range", class: "slider__input", id: `shape-${key}`, min: lim.min, max: lim.max, step: lim.step }) as HTMLInputElement;
    input.value = String(state.shape[key]);
    input.addEventListener("input", () => {
      state.shape = normalizeShape({ ...state.shape, [key]: Number(input.value) });
      value.textContent = format(state.shape[key]);
      rebuildPreview();
      opts.onChange?.(state);
    });
    sliderInputs.set(key, { input, value });
    return h("label", { class: "slider", for: `shape-${key}` }, h("span", { class: "slider__label" }, label), input, value);
  });
  const resetShape = h("button", { type: "button", class: "btn btn--link" }, "Form zurücksetzen");
  resetShape.addEventListener("click", () => {
    state.shape = { ...DEFAULT_SHAPE };
    for (const { key, format } of SLIDERS) {
      const s = sliderInputs.get(key)!;
      s.input.value = String(state.shape[key]);
      s.value.textContent = format(state.shape[key]);
    }
    rebuildPreview();
    opts.onChange?.(state);
  });

  const previewBtn = h("button", { type: "button", class: "btn btn--ghost" }, "Vorschau: Karte testen");
  const submitBtn = h("button", { type: "submit", class: "btn btn--primary" }, "Link erstellen");

  const resultLink = h("a", { class: "result__link", href: "#", target: "_blank", rel: "noopener" });
  const copyBtn = h("button", { type: "button", class: "btn btn--ghost" }, "Link kopieren");
  const shareBtn = h("button", { type: "button", class: "btn btn--primary" }, "Teilen");
  const result = h(
    "div",
    { class: "result", hidden: true },
    h("h2", { class: "result__title" }, "Deine Karte ist fertig 🌹"),
    h("p", {}, "Schick diesen Link per WhatsApp, Mail oder Nachricht. Am Handy pusten, fertig."),
    resultLink,
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
      onSubmit: (e: Event) => {
        e.preventDefault();
        const card = getValidated();
        if (!card) return;
        const url = createCardLink(card);
        resultLink.textContent = url;
        resultLink.setAttribute("href", url);
        result.hidden = false;
        result.scrollIntoView({ behavior: "smooth", block: "nearest" });
        shareBtn.hidden = !("share" in navigator);
      },
    },
    h("fieldset", { class: "field" }, h("legend", { class: "field__label" }, "Welche Rose?"), h("div", { class: "swatches" }, ...swatches)),
    h("div", { class: "field" }, h("label", { class: "field__label", for: "message" }, "Deine Botschaft"), message, counter),
    h("div", { class: "field" }, h("label", { class: "field__label", for: "from" }, "Von"), from),
    h("fieldset", { class: "field" }, h("legend", { class: "field__label" }, "Blütenform"), ...sliderRows, resetShape),
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
