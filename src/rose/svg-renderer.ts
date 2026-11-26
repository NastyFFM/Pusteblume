import type { RoseColor } from "../../shared/card";
import { HEART_RING, PALETTES, type Petal, type RoseModel } from "./model";
import { discMatrix, lightFactor, petalMatrix, placePetal, project, type Camera, type Placement3D, type PetalTransform } from "./projection";

export interface PetalPose {
  /** Verschiebung des Pivots gegenüber der Ruhelage */
  dx: number;
  dy: number;
  /** zusätzliche Drehung in Grad */
  rot: number;
  scale: number;
  alpha: number;
  /** Bildschirm-Geschwindigkeit in Einheiten/s (für Bewegungsunschärfe); 0 = ruhend */
  vx?: number;
  vy?: number;
  /** Trudeln: Drehung um die Längsachse des Blatts in Grad (0 = flach zum Betrachter) */
  flip?: number;
}

const SVG_NS = "http://www.w3.org/2000/svg";
const VIEW = 150;

/** Ab dieser Bildschirm-Geschwindigkeit (Einheiten/s) bekommt ein fliegendes Blatt Bewegungsunschärfe. */
const MOTION_MIN_SPEED = 140;
/** Stufengrenzen und zugehörige Unschärfe (stdDeviation in viewBox-Einheiten) */
const MOTION_STEPS: { speed: number; sigma: number }[] = [
  { speed: 300, sigma: 0.9 },
  { speed: 460, sigma: 1.7 },
  { speed: Infinity, sigma: 2.5 },
];
/** Fliegende Blätter ab dieser Skalierung (kommen dem Betrachter entgegen) werden leicht unscharf. */
const NEAR_BLUR_SCALE = 1.3;

/**
 * Höchstzahl gleichzeitig gefilterter fliegender Blätter (Bewegungs- oder Nähe-Unschärfe).
 * Jeder Filter auf einem einzelnen Element kostet einen eigenen Offscreen-Durchlauf;
 * mehr als eine Handvoll fällt am Handy auf.
 */
const MAX_MOTION_BLUR = 8;

/** Tiefenschärfe-Stufe eines sitzenden Blatts: hinten leicht unscharf, Mitte normal, vorn scharf */
type DepthTier = "far" | "mid" | "near";
/** Filter je Stufe: nur die hinterste bekommt einen Blur (Filter kosten pro Element). */
const TIER_FILTER: Record<DepthTier, string> = { far: "url(#dof-far)", mid: "", near: "" };
/** Leichte Helligkeitsabstufung je Stufe als Tiefen-Hinweis (hinten etwas gedämpft, vorn minimal heller). */
const TIER_LIGHT: Record<DepthTier, number> = { far: 0.95, mid: 1, near: 1.03 };
/** Nähe-Unschärfe für fliegende Blätter, die dem Betrachter entgegenkommen */
const DOF_FAR = "url(#dof-far)";
/**
 * Toleranz (Modell-Einheiten) für die Tiefensortierung: solange die bestehende Reihenfolge
 * bis auf diese Abweichung tiefenrichtig ist, wird nichts im DOM umgehängt. Verhindert
 * Dauer-Umsortieren bei leicht zitternder Kamera (Lagesensor).
 */
const SORT_EPSILON = 1.5;

/** DOM-Knoten eines Blatts samt gecachtem Zustand, damit pro Frame nur geänderte Attribute geschrieben werden. */
interface PetalNode {
  /** äußere Gruppe ohne Transform: trägt den Filter (Unschärfe im Bildschirmraum) und die Deckkraft */
  g: SVGGElement;
  /** innere Gruppe mit der Projektionsmatrix */
  body: SVGGElement;
  /** dunkle bzw. helle Deckkopie in Blattform für die Beleuchtung */
  dark: SVGElement;
  light: SVGElement;
  /** true: Kopien sind Sprite-Bilder mit Blend-Modus, false: gefüllte Pfade */
  sprite: boolean;
  /** zuletzt gesetzter Filter-Wert ("" = keiner) */
  filter: string;
  /** Tiefenschärfe-Stufe (sitzende Blätter), geht in die Helligkeit ein */
  tier: DepthTier;
  /** zuletzt gesetzter Helligkeitsfaktor (quantisiert) */
  shade: number;
  /** -1 dunkle Kopie sichtbar, 1 helle, 0 keine */
  shadeMode: -1 | 0 | 1;
}

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
  private readonly petalNodes = new Map<number, PetalNode>();
  private readonly placements = new Map<number, Placement3D>();
  private readonly depths = new Map<number, number>();
  /** zuletzt gesetzte Pose je Blatt, damit ein Kamerawechsel sie neu projizieren kann */
  private readonly lastPose = new Map<number, { pose?: PetalPose; tremble: number }>();
  private readonly sepalGroups: { g: SVGGElement; placement: Placement3D; size: number }[] = [];
  private stemBody!: SVGPathElement;
  private stemLight!: SVGPathElement;
  private readonly defs: SVGDefsElement;
  private readonly petalLayer: SVGGElement;
  /** aktuelle DOM-Reihenfolge der Blattgruppen (IDs, hinten zuerst) */
  private order: number[] = [];
  /** fliegende Blätter, die gerade einen eigenen Filter tragen (Budget, s. MAX_MOTION_BLUR) */
  private readonly motionBlurred = new Set<number>();
  private backing!: SVGEllipseElement;
  private backingRadius = 0;
  /** weicher dunkler Verlauf über der Blütenmitte (über den Blättern) */
  private innerShade!: SVGEllipseElement;
  private innerShadeLift = 0;
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
    // Unschärfe-Filter sind farbunabhängig und werden nur einmal angelegt.
    this.el.appendChild(this.buildFilterDefs());

    this.backEl = el("svg", { viewBox: `${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`, class: "rose rose--back", "aria-hidden": "true" });
    const backDefs = el("defs");
    const stemGrad = el("linearGradient", { id: "stem-grad", x1: 0, y1: 0, x2: 1, y2: 0 });
    stemGrad.append(el("stop", { offset: 0, "stop-color": "#2e6228" }), el("stop", { offset: 0.5, "stop-color": "#4a8a3c" }), el("stop", { offset: 1, "stop-color": "#2a5a25" }));
    backDefs.appendChild(stemGrad);
    this.backEl.appendChild(backDefs);
    this.backEl.appendChild(this.buildStem());
    // Deckscheibe hinter den Blättern: verdeckt Lücken zwischen Sprites, blendet mit dem Fortschritt aus.
    // In der Schrägansicht etwas größer, weil die Blüte dort vertikal gestaucht erscheint.
    const backingR = model.backingRadius;
    this.backingRadius = backingR;
    this.backing = el("ellipse", { class: "rose__backing", cx: 0, cy: 0, rx: backingR, ry: backingR, fill: "url(#backing-grad)" });
    this.el.appendChild(this.backing);
    this.petalLayer = el("g", { class: "rose__petals" });
    this.el.appendChild(this.petalLayer);
    this.buildPetals();
    // Innere Verschattung: liegt über den Blättern, mit der Kamera als Ellipse projiziert.
    // Höhe etwa auf halber Höhe der inneren Blattbasen, damit sie in der Schrägansicht nicht "schwebt".
    const shadeR = model.radius * 0.45;
    this.innerShadeLift = Math.max(0, ...model.petals.map((p) => p.lift)) * 0.5;
    this.innerShade = el("ellipse", { class: "rose__shade", cx: 0, cy: 0, rx: shadeR, ry: shadeR, fill: "url(#shade-grad)", "pointer-events": "none" });
    this.el.appendChild(this.innerShade);
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
    this.innerShade.setAttribute("transform", discMatrix(this.camera, this.innerShadeLift));
    for (const { g, placement, size } of this.sepalGroups) g.setAttribute("transform", petalMatrix(placement, this.camera, size).matrix);
    this.updateStem();
    for (const petal of this.model.petals) {
      const last = this.lastPose.get(petal.id);
      if (last?.pose) this.setPose(petal, last.pose);
      else if (last?.tremble) this.setTremble(petal, last.tremble);
      else this.setPose(petal);
    }
    this.sortByDepth();
  }

  /**
   * Blattgruppen nach Tiefe ordnen: ferne zuerst, nahe zuletzt. Fliegende Blätter ganz oben.
   * Umgehängt wird nur, wenn die bestehende Reihenfolge nicht mehr (bis auf SORT_EPSILON)
   * tiefenrichtig ist; jedes appendChild lässt den Browser die Blattgruppe neu aufbauen.
   * Bei einer Neusortierung bekommen die sitzenden Blätter ihre Tiefenschärfe-Stufe
   * (Drittel nach Tiefe); Filter und Helligkeit ändern sich also nur bei echtem Kamerawechsel
   * bzw. wenn ein Blatt zu fliegen beginnt oder wieder sitzt.
   */
  private sortByDepth() {
    if (!this.sortDirty) return;
    this.sortDirty = false;
    if (this.orderStillValid()) return;
    const sorted = [...this.model.petals].sort((a, b) => {
      const da = this.depths.get(a.id) ?? 0;
      const db = this.depths.get(b.id) ?? 0;
      return da - db || b.ring - a.ring;
    });
    this.order = sorted.map((p) => p.id);
    const attached = sorted.filter((p) => this.lastPose.get(p.id)?.pose === undefined);
    const third = attached.length / 3;
    attached.forEach((petal, i) => {
      const node = this.petalNodes.get(petal.id);
      if (!node) return;
      const tier: DepthTier = i < third ? "far" : i < 2 * third ? "mid" : "near";
      if (tier !== node.tier) {
        node.tier = tier;
        node.shade = -1; // Helligkeit beim nächsten Frame neu setzen
      }
      this.applyFilter(node, TIER_FILTER[tier]);
    });
    for (const petal of sorted) {
      const node = this.petalNodes.get(petal.id);
      if (node) this.petalLayer.appendChild(node.g);
    }
  }

  /** Ist die aktuelle DOM-Reihenfolge noch (bis auf SORT_EPSILON) nach Tiefe aufsteigend? */
  private orderStillValid(): boolean {
    if (this.order.length !== this.petalNodes.size) return false;
    let max = -Infinity;
    for (const id of this.order) {
      const d = this.depths.get(id) ?? 0;
      if (d < max - SORT_EPSILON) return false;
      if (d > max) max = d;
    }
    return true;
  }

  /**
   * Filter-Attribut nur schreiben, wenn es sich ändert (Filterwechsel sind teuer).
   * Filter fliegender Blätter (`budget`) zählen gegen ein Budget: ist es ausgeschöpft, fliegt das Blatt ohne.
   */
  private applyFilter(node: PetalNode, filter: string, budget = false) {
    const id = Number(node.g.dataset.id);
    if (budget && filter && !this.motionBlurred.has(id)) {
      if (this.motionBlurred.size >= MAX_MOTION_BLUR) filter = "";
      else this.motionBlurred.add(id);
    }
    if (!budget || !filter) this.motionBlurred.delete(id);
    if (node.filter === filter) return;
    node.filter = filter;
    if (filter) node.g.setAttribute("filter", filter);
    else node.g.removeAttribute("filter");
  }

  /**
   * Filter eines fliegenden Blatts: Bewegungsunschärfe nach Richtung (horizontal, vertikal,
   * diagonal) und Tempo; unterhalb der Schwelle Nähe-Unschärfe, wenn es dem Betrachter nahe kommt; sonst "".
   */
  private flyingFilter(pose: PetalPose): string {
    const vx = pose.vx ?? 0, vy = pose.vy ?? 0;
    const speed = Math.hypot(vx, vy);
    if (speed < MOTION_MIN_SPEED) return pose.scale > NEAR_BLUR_SCALE ? DOF_FAR : "";
    let step = 1;
    while (step < MOTION_STEPS.length && speed >= MOTION_STEPS[step - 1]!.speed) step++;
    const ax = Math.abs(vx), ay = Math.abs(vy);
    const dirClass = ay < 0.42 * ax ? "h" : ax < 0.42 * ay ? "v" : "d";
    return `url(#mb-${dirClass}${step})`;
  }

  /**
   * Beleuchtung: Helligkeitsfaktor (ca. 0.72..1.08) auf die Deckkopie in Blattform übertragen.
   * Unter 1 wird die dunkle Kopie eingeblendet, über 1 die helle; nur eine ist je sichtbar.
   * Quantisiert in 0.02-Schritten, damit pro Frame meist kein DOM-Schreibzugriff nötig ist.
   */
  private applyShade(node: PetalNode, factor: number) {
    const q = Math.round(factor * 50) / 50;
    if (q === node.shade) return;
    node.shade = q;
    let mode: -1 | 0 | 1 = 0;
    if (q < 0.995) {
      mode = -1;
      // Sprite: Multiplikation des Bilds mit sich selbst dunkelt satte Kanäle nur schwach ab,
      // daher stärkere Deckkraft als beim schwarz gefüllten Pfad.
      const o = Math.min(1, (1 - q) * (node.sprite ? 3.2 : 1.1));
      node.dark.style.opacity = o.toFixed(2);
    } else if (q > 1.005) {
      mode = 1;
      const o = Math.min(1, (q - 1) * (node.sprite ? 7.5 : 1.3));
      node.light.style.opacity = o.toFixed(2);
    }
    if (mode !== node.shadeMode) {
      node.shadeMode = mode;
      node.dark.style.display = mode === -1 ? "" : "none";
      node.light.style.display = mode === 1 ? "" : "none";
    }
  }

  /** Projektionsmatrix und Beleuchtung eines Blatts setzen (gemeinsamer Teil von Pose, Ruhe und Zittern). */
  private applyTransform(node: PetalNode, t: PetalTransform, prefix = "") {
    node.body.setAttribute("transform", prefix + t.matrix);
    this.applyShade(node, lightFactor(t.normal, t.facing) * (prefix ? 1 : TIER_LIGHT[node.tier]));
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
    const node = this.petalNodes.get(petal.id);
    const placement = this.placements.get(petal.id);
    if (!node || !placement) return;
    const g = node.g;
    const wasFlying = this.lastPose.get(petal.id)?.pose !== undefined;
    this.lastPose.set(petal.id, { pose, tremble: 0 });
    if (!pose) {
      const t = petalMatrix(placement, this.camera, petal.size);
      this.applyTransform(node, t);
      g.style.opacity = "";
      g.style.display = "";
      this.depths.set(petal.id, t.depth);
      if (wasFlying) {
        this.sortDirty = true;
        this.sortByDepth();
      }
      return;
    }
    if (pose.alpha <= 0) {
      g.style.display = "none";
      this.applyFilter(node, "", true); // Budget freigeben
      return;
    }
    g.style.display = "";
    g.style.opacity = pose.alpha.toFixed(3);
    const t = petalMatrix(placement, this.camera, petal.size * pose.scale, pose.rot, pose.flip ?? 0);
    this.applyTransform(node, t, `translate(${pose.dx.toFixed(2)} ${pose.dy.toFixed(2)}) `);
    // Fliegende Blätter kommen dem Betrachter entgegen: immer vor den sitzenden zeichnen.
    this.depths.set(petal.id, t.depth + 1000);
    this.applyFilter(node, this.flyingFilter(pose), true);
    if (!wasFlying) this.sortDirty = true;
    this.sortByDepth();
  }

  /** Leichtes Zittern eines sitzenden Blatts (Feedback beim sanften Pusten). */
  setTremble(petal: Petal, degrees: number) {
    const node = this.petalNodes.get(petal.id);
    const placement = this.placements.get(petal.id);
    if (!node || !placement) return;
    const wasFlying = this.lastPose.get(petal.id)?.pose !== undefined;
    this.lastPose.set(petal.id, { tremble: degrees });
    const t = petalMatrix(placement, this.camera, petal.size, degrees);
    this.applyTransform(node, t);
    node.g.style.opacity = "";
    node.g.style.display = "";
    this.depths.set(petal.id, t.depth);
    if (wasFlying) {
      this.sortDirty = true;
      this.sortByDepth();
    }
  }

  /** Fortschritt 0..1 (Anteil gelöster Blätter): Deckscheibe gegen Ende ausblenden. */
  setProgress(progress: number) {
    // In der Schrägansicht verdeckt die Scheibe auch die Botschaft und bleibt daher länger.
    const threeD = this.model.defaultElevation < 90;
    const [from, to] = threeD ? [0.72, 0.97] : [0.55, 0.9];
    const o = 1 - Math.max(0, Math.min(1, (progress - from) / (to - from)));
    this.backing.style.opacity = o.toFixed(3);
    this.innerShade.style.opacity = o.toFixed(3);
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

    // Innere Verschattung: weicher dunkler Verlauf, zum Rand hin vollständig durchsichtig.
    const shade = el("radialGradient", { id: "shade-grad" });
    shade.append(
      el("stop", { offset: 0, "stop-color": pal.heart, "stop-opacity": 0.5 }),
      el("stop", { offset: 0.45, "stop-color": pal.heart, "stop-opacity": 0.28 }),
      el("stop", { offset: 1, "stop-color": pal.heart, "stop-opacity": 0 }),
    );

    this.defs.append(outer, inner, backing, shadow, shade);
    this.el.style.setProperty("--rim", pal.rim);
    this.el.style.setProperty("--deep", pal.deep);
  }

  /**
   * Vordefinierte Unschärfe-Filter (ohne Farbbezug): die Tiefenschärfe-Unschärfe der hintersten
   * Stufe (`dof-far`, dient zugleich fliegenden Blättern, die nah herankommen) und je drei Stärken
   * für horizontale, vertikale und diagonale Bewegungsunschärfe. Pro Blatt wird nur das
   * `filter`-Attribut gewechselt, nie ein Filter angelegt, und immer nur auf der einzelnen
   * Blattgruppe, nie auf Sammel-Ebenen (dort flackern Kinder beim Umsortieren).
   * Der Filter sitzt auf der äußeren, nicht transformierten Gruppe, damit stdDeviation
   * in Bildschirm-(viewBox-)Einheiten und achsenparallel zum Bildschirm wirkt.
   */
  private buildFilterDefs(): SVGDefsElement {
    const defs = el("defs");
    const blur = (id: string, sx: number, sy: number, margin: number) => {
      const f = el("filter", { id, x: `${-margin}%`, y: `${-margin}%`, width: `${100 + 2 * margin}%`, height: `${100 + 2 * margin}%`, "color-interpolation-filters": "sRGB" });
      f.appendChild(el("feGaussianBlur", { stdDeviation: `${sx} ${sy}` }));
      defs.appendChild(f);
    };
    // Ränder: mindestens 3 sigma, sonst schneidet die Filterregion das Blatt an; jede Region kostet Füllrate.
    blur("dof-far", 0.6, 0.6, 10);
    MOTION_STEPS.forEach(({ sigma }, i) => {
      const n = i + 1;
      const m = 12 + 4 * i;
      blur(`mb-h${n}`, sigma, sigma * 0.3, m);
      blur(`mb-v${n}`, sigma * 0.3, sigma, m);
      blur(`mb-d${n}`, sigma * 0.75, sigma * 0.75, m);
    });
    return defs;
  }

  private buildStem(): SVGGElement {
    const layer = el("g", { class: "rose__stem" });
    this.stemBody = el("path", { fill: "url(#stem-grad)", stroke: "#1f4a1e", "stroke-width": 0.8, "stroke-linejoin": "round" });
    this.stemLight = el("path", { fill: "none", stroke: "#a6d48a", "stroke-opacity": 0.55, "stroke-width": 1.2, "stroke-linecap": "round" });
    layer.append(this.stemBody, this.stemLight);
    for (const sepal of this.model.sepals) {
      const placement = placePetal(sepal.angle, sepal.radius, sepal.elevation, sepal.lift, sepal.tilt, sepal.length);
      const g = el("g");
      g.appendChild(el("path", { d: sepal.d, fill: "#3f7a33", stroke: "#1f4a1e", "stroke-width": 0.7, "stroke-linejoin": "round" }));
      this.sepalGroups.push({ g, placement, size: sepal.size });
      layer.appendChild(g);
    }
    return layer;
  }

  /** Stiel als leicht gebogenes, nach unten schmaler werdendes Band in Bildschirmkoordinaten. */
  private updateStem() {
    const { stem } = this.model;
    const base = { x: 0, y: stem.lift, z: 0 };
    const tip = { x: stem.dir.x * stem.length, y: stem.lift + stem.dir.y * stem.length, z: stem.dir.z * stem.length };
    const P0 = project(base, this.camera);
    const P1 = project(tip, this.camera);
    const dx = P1.x - P0.x, dy = P1.y - P0.y;
    const len = Math.hypot(dx, dy);
    if (len < 2) {
      this.stemBody.setAttribute("d", "");
      this.stemLight.setAttribute("d", "");
      return;
    }
    const nx = -dy / len, ny = dx / len; // Normale in der Bildebene
    const w0 = stem.width / 2, w1 = stem.width * 0.35;
    // leichte Biegung: Kontrollpunkt seitlich versetzt
    const bend = Math.min(10, len * 0.08);
    const cx = (P0.x + P1.x) / 2 + nx * bend, cy = (P0.y + P1.y) / 2 + ny * bend;
    const f = (v: number) => v.toFixed(2);
    this.stemBody.setAttribute(
      "d",
      `M ${f(P0.x + nx * w0)} ${f(P0.y + ny * w0)} Q ${f(cx + nx * (w0 + w1) / 2)} ${f(cy + ny * (w0 + w1) / 2)} ${f(P1.x + nx * w1)} ${f(P1.y + ny * w1)} ` +
        `L ${f(P1.x - nx * w1)} ${f(P1.y - ny * w1)} Q ${f(cx - nx * (w0 + w1) / 2)} ${f(cy - ny * (w0 + w1) / 2)} ${f(P0.x - nx * w0)} ${f(P0.y - ny * w0)} Z`,
    );
    this.stemLight.setAttribute(
      "d",
      `M ${f(P0.x + nx * w0 * 0.35)} ${f(P0.y + ny * w0 * 0.35 + 4)} Q ${f(cx + nx * w0 * 0.35)} ${f(cy + ny * w0 * 0.35)} ${f(P1.x + nx * w1 * 0.3)} ${f(P1.y + ny * w1 * 0.3 - 4)}`,
    );
  }

  private buildPetals() {
    // Äußere Ringe zuerst zeichnen, damit innere oben liegen.
    const sorted = [...this.model.petals].sort((a, b) => b.ring - a.ring);
    for (const petal of sorted) {
      // Äußere Gruppe: Filter und Deckkraft. Innere Gruppe: Projektionsmatrix (pro Frame).
      const g = el("g", { class: "petal", "data-id": petal.id });
      const body = el("g", { class: "petal__body" });
      const rotation = petal.shape.kind === "sprite" ? petal.shape.rotation : 0;
      const shapeGroup = el("g", { transform: `rotate(${rotation}) translate(${-petal.shape.pivot.x} ${-petal.shape.pivot.y})` });
      let dark: SVGElement, light: SVGElement;

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
        // Beleuchtung: schwarz bzw. weiß gefüllte Kopie des Umrisses, Deckkraft = Stärke.
        dark = el("path", { d: petal.shape.d, class: "petal__shade", fill: "#000", "pointer-events": "none" });
        light = el("path", { d: petal.shape.d, class: "petal__shade", fill: "#fff", "pointer-events": "none" });
        shapeGroup.append(dark, light);
      } else {
        // Sprite-Atlas: verschachteltes <svg> mit viewBox schneidet den Ausschnitt aus dem Atlasbild.
        const s = petal.shape;
        const crop = el("svg", { x: 0, y: 0, width: s.width, height: s.height, viewBox: `${s.x} ${s.y} ${s.width} ${s.height}`, overflow: "hidden" });
        const sprite = (cls: string) => {
          const img = el("image", { href: s.url, x: 0, y: 0, class: cls, preserveAspectRatio: "none" });
          img.setAttribute("width", String(this.atlasSize.width));
          img.setAttribute("height", String(this.atlasSize.height));
          return img;
        };
        crop.appendChild(sprite("petal__sprite"));
        // Beleuchtung ohne Filter: dieselbe Sprite-Kopie mit sich selbst multipliziert (dunkler)
        // bzw. per Screen addiert (heller). Die Kopie ist nur dort sichtbar, wo das Blatt ist,
        // und blendet nur mit dem direkt darunter liegenden, deckenden Blatt.
        dark = sprite("petal__sprite petal__shade");
        dark.style.mixBlendMode = "multiply";
        light = sprite("petal__sprite petal__shade");
        light.style.mixBlendMode = "screen";
        dark.setAttribute("pointer-events", "none");
        light.setAttribute("pointer-events", "none");
        crop.append(dark, light);
        shapeGroup.appendChild(crop);
      }
      dark.style.display = "none";
      light.style.display = "none";

      body.appendChild(shapeGroup);
      g.appendChild(body);
      this.petalLayer.appendChild(g);
      this.petalNodes.set(petal.id, { g, body, dark, light, sprite: petal.shape.kind === "sprite", filter: "", tier: "mid", shade: -1, shadeMode: 0 });
    }
  }
}
