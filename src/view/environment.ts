import type { Camera } from "../rose/projection";

/**
 * Umgebung aus einem equirektangularen Panorama (360° × 180°), vorab weichgezeichnet.
 * Statt echter Kugelprojektion wird das Bild als umlaufender Streifen hinter die Bühne
 * gelegt und nach Kamerawinkel verschoben: Azimut läuft horizontal um (360° = eine
 * Bildbreite), der Höhenwinkel schiebt vertikal. Durch die Unschärfe wirkt das wie ein
 * Blick in die Kugel, kostet aber nur eine GPU-Transformation pro Frame.
 */
export class Environment {
  readonly el: HTMLDivElement;
  private readonly strip: HTMLDivElement;
  private lastKey = "";

  constructor(
    url: string,
    /** Höhenwinkel, bei dem der Horizont des Bildes auf der Bühnenmitte liegt */
    private readonly baseElevation = 48,
  ) {
    this.el = document.createElement("div");
    this.el.className = "environment";
    this.el.setAttribute("aria-hidden", "true");
    this.strip = document.createElement("div");
    this.strip.className = "environment__strip";
    this.strip.style.backgroundImage = `url(${url})`;
    this.el.appendChild(this.strip);
  }

  update(camera: Camera) {
    const key = `${camera.elevation.toFixed(1)}|${camera.azimuth.toFixed(1)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;
    // Maße in vh, passend zu den CSS-Werten (--env-h = Bildhöhe, Breite = 2 × Höhe)
    const h = this.el.clientHeight || window.innerHeight;
    const tileH = h * 1.5;
    const tileW = tileH * 2;
    // Horizontal: positiver Azimut dreht die Rose gegen den Uhrzeigersinn, der Blick wandert nach links.
    let tx = ((camera.azimuth / 360) * tileW) % tileW;
    if (tx > 0) tx -= tileW; // immer im Bereich (-tileW, 0], der Streifen ist 3 Kacheln breit
    // Vertikal: höherer Winkel = Blick von oben = mehr Boden, Bild wandert nach oben.
    const ty = (h - tileH) / 2 - ((camera.elevation - this.baseElevation) / 180) * tileH;
    this.strip.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0)`;
  }
}
