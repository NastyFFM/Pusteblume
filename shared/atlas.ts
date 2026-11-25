/**
 * Beschreibung eines Sprite-Atlas mit Blütenblättern.
 * Wird vom Pipeline-Tool erzeugt (tools/build-atlas.ts) und vom Renderer gelesen.
 */
export interface AtlasSprite {
  /** Ausschnitt im Atlas in Pixeln */
  x: number;
  y: number;
  w: number;
  h: number;
  /** Pivot (Blattbasis) in Pixeln relativ zum Ausschnitt */
  pivot: { x: number; y: number };
  /** Drehung in Grad, damit die Spitze nach oben (-y) zeigt */
  rotation: number;
  /** Länge Basis bis Spitze in Pixeln */
  length: number;
  /** Breite quer zur Achse in Pixeln */
  width: number;
}

export interface PetalAtlas {
  /** Atlas-Bilder je Farbe, relativ zur JSON-Datei */
  images: Record<string, string>;
  width: number;
  height: number;
  sprites: AtlasSprite[];
}
