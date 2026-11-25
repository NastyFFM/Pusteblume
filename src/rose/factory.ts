import type { PetalAtlas } from "../../shared/atlas";
import type { RoseColor } from "../../shared/card";
import { createRoseModel, type RoseModel } from "./model";
import { createSpriteRoseModel } from "./sprite-model";
import { RoseSvg } from "./svg-renderer";

/** Darstellung der Rose: prozedurales SVG oder Sprite-Atlas aus der Pipeline. */
export type RoseStyle = { kind: "svg" } | { kind: "sprite"; atlas: PetalAtlas; baseUrl: string };

export interface RoseInstance {
  model: RoseModel;
  rose: RoseSvg;
  /** Atlasbild für eine Farbe (undefined im SVG-Modus) */
  spriteUrlFor(color: RoseColor): string | undefined;
}

export function createRose(color: RoseColor, style: RoseStyle = { kind: "svg" }): RoseInstance {
  if (style.kind === "sprite") {
    const model = createSpriteRoseModel(style.atlas, style.baseUrl, color);
    const rose = new RoseSvg(model, color, { width: style.atlas.width, height: style.atlas.height });
    return { model, rose, spriteUrlFor: (c) => style.baseUrl + (style.atlas.images[c] ?? style.atlas.images.red ?? "") };
  }
  const model = createRoseModel();
  return { model, rose: new RoseSvg(model, color), spriteUrlFor: () => undefined };
}
