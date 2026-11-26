import type { RoseColor } from "../../shared/card";
import { HEART_RING, PALETTES, type Petal, type RoseModel } from "./model";
import { discMatrix, petalMatrix, placePetal, type Camera, type Placement3D } from "./projection";

export interface PetalPose {
  /** Verschiebung des Pivots gegenüber der Ruhelage */
  dx: number;
  dy: number;
  /** zusätzliche Drehung in Grad */
  rot: number;
  scale: number;
  alpha: number;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const VIEW = 150;

function el<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/**
 * Zeichnet das Rosenmodell als SVG. Jedes Blatt ist eine eigene Gruppe, deren
 * Transform pro Frame von der Physik gesetzt wird.
 */
export class RoseSvg {
  /** Blüte (liegt über der Botschaft) */
  readonly el: SVGSVGElement;
  /** Blätter (liegen hinter der Botschaft) */
  readonly backEl: SVGSVGElement;
  private readonly petalGroups = new Map<number, SVGGElement>();
  private readonly placements = new Map<number, Placement3D>();
  private readonly depths = new Map<number, number>();
  /** zuletzt gesetzte Pose je Blatt, damit ein Kamerawechsel sie neu projizieren kann */
  private readonly lastPose = new Map<number, { pose?: PetalPose; tremble: number }>();
  private readonly leafGroups: { g: SVGGElement; placement: Placement3D; size: number }[] = [];
  private readonly defs: SVGDefsElement;
  private readonly petalLayer: SVGGElement;
  private backing!: SVGEllipseElement;
  private backingRadius = 0;
  private color: RoseColor;
  private camera: Camera;
  private sortDirty = true;

  constructor(
    private readonly model: RoseModel,
    color: RoseColor,
    /** Pixelmaße des Atlasbilds (nur für Sprite-Modelle nötig) */
    private readonly atlasSize: { width: number; height: number } = { width: 0, height: 0 },
  ) {
    this.color = color;
    this.camera = { elevation: model.defaultElevation, azimuth: 0 };
    for (const petal of model.petals) {
      this.placements.set(petal.id, placePetal(petal.angle, petal.radius, petal.elevation, petal.lift, petal.tilt, petal.length));
    }
    this.el = el("svg", {
      viewBox: `${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`,
      class: "rose",
      role: "img",
      "aria-label": "Eine Rose",
    });
    this.defs = el("defs");
    this.el.appendChild(this.defs);
    this.buildDefs();

    this.backEl = el("svg", { viewBox: `${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`, class: "rose rose--back", "aria-hidden": "true" });
    this.backEl.appendChild(this.buildLeaves());
    // Deckscheibe hinter den Blättern: verdeckt Lücken zwischen Sprites, blendet mit dem Fortschritt aus.
    // In der Schrägansicht etwas größer, weil die Blüte dort vertikal gestaucht erscheint.
    const backingR = model.backingRadius;
    this.backingRadius = backingR;
    this.backing = el("ellipse", { class: "rose__backing", cx: 0, cy: 0, rx: backingR, ry: backingR, fill: "url(#backing-grad)" });
    this.el.appendChild(this.backing);
    this.petalLayer = el("g", { class: "rose__petals" });
    this.el.appendChild(this.petalLayer);
    this.buildPetals();
    this.applyCamera();
  }

  /** Aktuelle Kamera (Höhenwinkel, Azimut). */
  getCamera(): Camera {
    return { ...this.camera };
  }

  /** Kamera setzen und alle Blätter, Blätter und Scheiben neu projizieren. */
  setCamera(camera: Camera) {
    if (camera.elevation === this.camera.elevation && camera.azimuth === this.camera.azimuth) return;
    this.camera = { elevation: camera.elevation, azimuth: camera.azimuth };
    this.sortDirty = true;
    this.applyCamera();
  }

  private applyCamera() {
    this.backing.setAttribute("transform", discMatrix(this.camera, 1));
    for (const { g, placement, size } of this.leafGroups) g.setAttribute("transform", petalMatrix(placement, this.camera, size).matrix);
    for (const petal of this.model.petals) {
      const last = this.lastPose.get(petal.id);
      if (last?.pose) this.setPose(petal, last.pose);
      else if (last?.tremble) this.setTremble(petal, last.tremble);
      else this.setPose(petal);
    }
    this.sortByDepth();
  }

  /** Blattgruppen nach Tiefe ordnen: ferne zuerst, nahe zuletzt. Fliegende Blätter ganz oben. */
  private sortByDepth() {
    if (!this.sortDirty) return;
    this.sortDirty = false;
    const order = [...this.model.petals].sort((a, b) => {
      const da = this.depths.get(a.id) ?? 0;
      const db = this.depths.get(b.id) ?? 0;
      return da - db || b.ring - a.ring;
    });
    for (const petal of order) {
      const g = this.petalGroups.get(petal.id);
      if (g) this.petalLayer.appendChild(g);
    }
  }

  setColor(color: RoseColor, spriteUrl?: string) {
    if (color === this.color && !spriteUrl) return;
    this.color = color;
    this.buildDefs();
    if (spriteUrl) {
      for (const img of this.el.querySelectorAll<SVGImageElement>("image.petal__sprite")) img.setAttribute("href", spriteUrl);
    }
  }

  /** Pose eines Blatts setzen; `pose` undefined = Ruhelage. */
  setPose(petal: Petal, pose?: PetalPose) {
    const g = this.petalGroups.get(petal.id);
    const placement = this.placements.get(petal.id);
    if (!g || !placement) return;
    const wasFlying = this.lastPose.get(petal.id)?.pose !== undefined;
    this.lastPose.set(petal.id, { pose, tremble: 0 });
    if (!pose) {
      const { matrix, depth } = petalMatrix(placement, this.camera, petal.size);
      g.setAttribute("transform", matrix);
      g.style.opacity = "";
      g.style.display = "";
      this.depths.set(petal.id, depth);
      if (wasFlying) this.sortDirty = true;
      return;
    }
    if (pose.alpha <= 0) {
      g.style.display = "none";
      return;
    }
    g.style.display = "";
    g.style.opacity = pose.alpha.toFixed(3);
    const { matrix, depth } = petalMatrix(placement, this.camera, petal.size * pose.scale, pose.rot);
    g.setAttribute("transform", `translate(${pose.dx.toFixed(2)} ${pose.dy.toFixed(2)}) ${matrix}`);
    // Fliegende Blätter kommen dem Betrachter entgegen: immer vor den sitzenden zeichnen.
    this.depths.set(petal.id, depth + 1000);
    if (!wasFlying) this.sortDirty = true;
    this.sortByDepth();
  }

  /** Leichtes Zittern eines sitzenden Blatts (Feedback beim sanften Pusten). */
  setTremble(petal: Petal, degrees: number) {
    const g = this.petalGroups.get(petal.id);
    const placement = this.placements.get(petal.id);
    if (!g || !placement) return;
    const wasFlying = this.lastPose.get(petal.id)?.pose !== undefined;
    this.lastPose.set(petal.id, { tremble: degrees });
    const { matrix, depth } = petalMatrix(placement, this.camera, petal.size, degrees);
    g.setAttribute("transform", matrix);
    g.style.opacity = "";
    g.style.display = "";
    this.depths.set(petal.id, depth);
    if (wasFlying) this.sortDirty = true;
  }

  /** Fortschritt 0..1 (Anteil gelöster Blätter): Deckscheibe gegen Ende ausblenden. */
  setProgress(progress: number) {
    // In der Schrägansicht verdeckt die Scheibe auch die Botschaft und bleibt daher länger.
    const threeD = this.model.defaultElevation < 90;
    const [from, to] = threeD ? [0.72, 0.97] : [0.55, 0.9];
    const o = 1 - Math.max(0, Math.min(1, (progress - from) / (to - from)));
    this.backing.style.opacity = o.toFixed(3);
    if (threeD) {
      // Scheibe schrumpft mit der verbleibenden Blütenmasse (äußere Blätter gehen zuerst).
      const r = this.backingRadius * (1 - 0.6 * Math.max(0, Math.min(1, progress)));
      this.backing.setAttribute("rx", r.toFixed(1));
      this.backing.setAttribute("ry", r.toFixed(1));
    }
  }

  private buildDefs() {
    const pal = PALETTES[this.color];
    this.defs.replaceChildren();

    // Blattverlauf: dunkel am Ansatz (unten im lokalen System), hell zur Spitze.
    const outer = el("linearGradient", { id: "petal-outer", x1: 0, y1: 1, x2: 0, y2: 0 });
    outer.append(
      el("stop", { offset: 0, "stop-color": pal.deep }),
      el("stop", { offset: 0.35, "stop-color": pal.base }),
      el("stop", { offset: 0.75, "stop-color": pal.mid }),
      el("stop", { offset: 1, "stop-color": pal.tip }),
    );
    const inner = el("linearGradient", { id: "petal-inner", x1: 0, y1: 1, x2: 0, y2: 0 });
    inner.append(
      el("stop", { offset: 0, "stop-color": pal.heart }),
      el("stop", { offset: 0.5, "stop-color": pal.deep }),
      el("stop", { offset: 1, "stop-color": pal.base }),
    );
    const leaf = el("linearGradient", { id: "leaf-grad", x1: 0, y1: 1, x2: 0, y2: 0 });
    leaf.append(el("stop", { offset: 0, "stop-color": "#1d4a24" }), el("stop", { offset: 1, "stop-color": "#4f8a3e" }));

    // Deckscheibe: dunkle Mitte, zum Rand hin Blattfarbe, damit sie durch Lücken wie Blütenmasse wirkt.
    const backing = el("radialGradient", { id: "backing-grad" });
    backing.append(
      el("stop", { offset: 0, "stop-color": pal.heart }),
      el("stop", { offset: 0.45, "stop-color": pal.deep }),
      el("stop", { offset: 0.85, "stop-color": pal.base }),
      el("stop", { offset: 1, "stop-color": pal.base, "stop-opacity": 0 }),
    );

    const shadow = el("filter", { id: "petal-shadow", x: "-30%", y: "-30%", width: "160%", height: "160%" });
    shadow.append(el("feDropShadow", { dx: 0, dy: 1.2, stdDeviation: 1.4, "flood-color": pal.heart, "flood-opacity": 0.45 }));

    this.defs.append(outer, inner, leaf, backing, shadow);
    this.el.style.setProperty("--rim", pal.rim);
    this.el.style.setProperty("--deep", pal.deep);
  }

  private buildLeaves(): SVGGElement {
    const layer = el("g", { class: "rose__leaves" });
    for (const leaf of this.model.leaves) {
      // Blätter liegen leicht hängend um den Blütenboden.
      const placement = placePetal(leaf.angle, leaf.radius, -8, -6, leaf.tilt, 80);
      const g = el("g", { transform: petalMatrix(placement, this.camera, leaf.size).matrix });
      this.leafGroups.push({ g, placement, size: leaf.size });
      g.append(
        el("path", { d: leaf.d, fill: "#2f6b2f", stroke: "#163a1c", "stroke-width": 1.2, "stroke-linejoin": "round" }),
        el("path", { d: leaf.vein, stroke: "#9cc77f", "stroke-width": 1, "stroke-opacity": 0.6, fill: "none" }),
      );
      layer.appendChild(g);
    }
    return layer;
  }

  private buildPetals() {
    // Äußere Ringe zuerst zeichnen, damit innere oben liegen.
    const sorted = [...this.model.petals].sort((a, b) => b.ring - a.ring);
    for (const petal of sorted) {
      const g = el("g", { class: "petal", "data-id": petal.id });
      const rotation = petal.shape.kind === "sprite" ? petal.shape.rotation : 0;
      const shapeGroup = el("g", { transform: `rotate(${rotation}) translate(${-petal.shape.pivot.x} ${-petal.shape.pivot.y})` });

      if (petal.shape.kind === "path") {
        const innerRing = petal.ring <= HEART_RING;
        shapeGroup.appendChild(
          el("path", {
            d: petal.shape.d,
            fill: innerRing ? "url(#petal-inner)" : "url(#petal-outer)",
            stroke: "var(--deep)",
            "stroke-opacity": 0.35,
            "stroke-width": 0.8,
            "stroke-linejoin": "round",
            filter: "url(#petal-shadow)",
          }),
        );
        if (petal.shape.rim && petal.ring > HEART_RING) {
          shapeGroup.appendChild(
            el("path", {
              d: petal.shape.rim,
              fill: "none",
              stroke: "var(--rim)",
              "stroke-opacity": 0.55,
              "stroke-width": 1.6,
              "stroke-linecap": "round",
            }),
          );
        }
      } else {
        // Sprite-Atlas: verschachteltes <svg> mit viewBox schneidet den Ausschnitt aus dem Atlasbild.
        const s = petal.shape;
        const crop = el("svg", { x: 0, y: 0, width: s.width, height: s.height, viewBox: `${s.x} ${s.y} ${s.width} ${s.height}`, overflow: "hidden" });
        const img = el("image", { href: s.url, x: 0, y: 0, class: "petal__sprite", preserveAspectRatio: "none" });
        img.setAttribute("width", String(this.atlasSize.width));
        img.setAttribute("height", String(this.atlasSize.height));
        crop.appendChild(img);
        shapeGroup.appendChild(crop);
      }

      g.appendChild(shapeGroup);
      this.petalLayer.appendChild(g);
      this.petalGroups.set(petal.id, g);
    }
  }
}
