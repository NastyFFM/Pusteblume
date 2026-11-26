import type { CardColor } from "../../shared/card";
import type { Petal } from "../rose/model";
import type { PetalPose } from "../rose/svg-renderer";

/**
 * Blütenbett: lose Rosenblätter (Fotos aus dem Figma-Design) liegen in mehreren Lagen über der
 * Botschaft und decken sie ab. Beim Pusten lösen sie sich und fliegen aus dem Bild
 * (Physik: RosePhysics, die nur `petals` mit Pivot und Reihenfolge braucht).
 *
 * Koordinaten: Modell-Einheiten wie bei der Rose, 200 Einheiten = Bühnenbreite, Ursprung in der
 * Bühnenmitte. Pro Frame wird je Blatt nur `transform`/`opacity` gesetzt (kein DOM-Umhängen,
 * keine Filter), siehe Flacker-Hinweise in CLAUDE.md.
 */

export const BED_UNITS = 200;
const VARIANTS = ["a", "b", "c"] as const;

export interface BedPetal extends Petal {
  /** Ruhelage in Modell-Einheiten (Bühnenmitte = 0/0) */
  x: number;
  y: number;
  /** Drehung in Ruhelage in Grad */
  rotation: number;
  /** Breite des Blatts in Einheiten */
  width: number;
  variant: (typeof VARIANTS)[number];
  /** 0 = unterste Lage */
  layer: number;
}

export interface BedModel {
  petals: BedPetal[];
}

/** Deterministischer Zufall, damit das Bett bei jedem Laden gleich aussieht. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function petalImage(variant: (typeof VARIANTS)[number], color: CardColor): string {
  return `/design/petal-${variant}-${color}.webp`;
}

/**
 * Blätter gleichmäßig über die Bühne verteilen (Jitter-Raster, damit keine Lücken bleiben).
 * `aspect` = Höhe/Breite der Bühne. Blätter in der Mitte lösen sich zuletzt, damit die
 * Botschaft als Letztes frei wird.
 */
export function createBedModel(count = 96, aspect = 2.1, seed = 11): BedModel {
  const rand = rng(seed);
  // Das Raster reicht etwas über die Bühne hinaus, damit die Ränder dicht bleiben (Blätter ragen über die Kanten).
  const halfW = (BED_UNITS / 2) * 1.08;
  const halfH = ((BED_UNITS * aspect) / 2) * 1.06;
  const cols = Math.max(4, Math.round(Math.sqrt(count / aspect)));
  const rows = Math.max(4, Math.ceil(count / cols));
  const petals: BedPetal[] = [];
  let id = 0;
  for (let layer = 0; layer < 2; layer++) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (petals.length >= count) break;
        // Zweite Lage um ein halbes Raster versetzt, damit die Fugen der ersten abgedeckt sind.
        const off = layer ? 0.5 : 0;
        const x = ((c + off + 0.15 + rand() * 0.7) / cols) * 2 * halfW - halfW;
        const y = ((r + off + 0.15 + rand() * 0.7) / rows) * 2 * halfH - halfH;
        const d = Math.min(1, Math.hypot(x / halfW, y / halfH));
        const width = 52 + rand() * 30; // Einheiten; ~100–160 px auf einem 393 px breiten Handy
        petals.push({
          id: id++,
          ring: Math.round((1 - d) * 5),
          angle: (Math.atan2(x, -y) * 180) / Math.PI,
          radius: Math.hypot(x, y),
          size: 1,
          tilt: 0,
          releaseAt: Math.min(0.999, 0.65 * (1 - d) + 0.35 * rand()),
          elevation: 0,
          lift: 0,
          length: width,
          shape: { kind: "path", d: "", pivot: { x: 0, y: 0 } },
          x,
          y,
          rotation: rand() * 360,
          width,
          variant: VARIANTS[Math.floor(rand() * VARIANTS.length)]!,
          layer,
        });
      }
    }
  }
  // Zeichenreihenfolge: untere Lage zuerst; innerhalb einer Lage zufällig, damit kein Raster sichtbar ist.
  petals.sort((a, b) => a.layer - b.layer || (a.id * 7919) % 97 - (b.id * 7919) % 97);
  return { petals };
}

/** DOM-Darstellung des Betts. */
export class PetalBed {
  readonly el: HTMLDivElement;
  private readonly nodes = new Map<number, HTMLImageElement>();
  /** Pixel je Modell-Einheit; wird bei Größenänderung der Bühne gemessen */
  private scale = 1;
  private readonly observer: ResizeObserver | null;

  constructor(
    readonly model: BedModel,
    private color: CardColor,
  ) {
    this.el = document.createElement("div");
    this.el.className = "bed";
    this.el.setAttribute("aria-hidden", "true");
    for (const p of model.petals) {
      const img = document.createElement("img");
      img.className = "bed__petal";
      img.alt = "";
      img.draggable = false;
      img.decoding = "async";
      img.src = petalImage(p.variant, color);
      img.style.width = `${((p.width / BED_UNITS) * 100).toFixed(2)}%`;
      img.style.left = `${(50 + (p.x / BED_UNITS) * 100).toFixed(2)}%`;
      // y relativ zur Breite, weil die Blätter im Modell quadratische Einheiten haben
      img.style.top = `calc(50% + ${((p.y / BED_UNITS) * 100).toFixed(2)}cqw)`;
      this.nodes.set(p.id, img);
      this.el.appendChild(img);
      this.setPose(p);
    }
    this.observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(([entry]) => {
            if (entry) this.scale = entry.contentRect.width / BED_UNITS;
          });
  }

  mount(stage: HTMLElement) {
    stage.appendChild(this.el);
    this.scale = (stage.clientWidth || 393) / BED_UNITS;
    this.observer?.observe(stage);
  }

  setColor(color: CardColor) {
    if (color === this.color) return;
    this.color = color;
    for (const p of this.model.petals) this.nodes.get(p.id)!.src = petalImage(p.variant, color);
  }

  /** Pose setzen; ohne `pose` liegt das Blatt in Ruhelage (optional mit Zittern in Grad). */
  setPose(petal: BedPetal, pose?: PetalPose, tremble = 0) {
    const node = this.nodes.get(petal.id)!;
    if (!pose) {
      node.style.transform = `translate(-50%, -50%) rotate(${(petal.rotation + tremble).toFixed(2)}deg)`;
      node.style.opacity = "1";
      return;
    }
    const flip = pose.flip ?? 0;
    // Trudeln: Blatt kippt um die Längsachse, als Stauchung der Höhe (kein 3D, keine Filter)
    const squash = 0.25 + 0.75 * Math.abs(Math.cos((flip * Math.PI) / 180));
    node.style.transform =
      `translate(-50%, -50%) translate(${(pose.dx * this.scale).toFixed(1)}px, ${(pose.dy * this.scale).toFixed(1)}px) ` +
      `rotate(${(petal.rotation + pose.rot).toFixed(2)}deg) scale(${pose.scale.toFixed(3)}, ${(pose.scale * squash).toFixed(3)})`;
    node.style.opacity = pose.alpha.toFixed(3);
  }

  reset() {
    for (const p of this.model.petals) this.setPose(p);
  }

  destroy() {
    this.observer?.disconnect();
    this.el.remove();
  }
}
