/**
 * Pseudo-3D für die Rose.
 *
 * Weltkoordinaten: x nach rechts, y nach oben (Blütenachse), z zum Betrachter.
 * Jedes Blatt ist eine flache Fläche mit Pivot P (Blattbasis), Richtung d (Basis -> Spitze)
 * und Breitenachse w. Eine orthografische Kamera mit Höhenwinkel (90° = von oben,
 * 0° = von der Seite) und Azimut projiziert sie auf eine 2D-Affinabbildung, die als
 * SVG-matrix() direkt auf die Blattgruppe gesetzt wird.
 */

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Camera {
  /** Höhenwinkel in Grad: 90 = senkrecht von oben, 0 = von der Seite */
  elevation: number;
  /** Drehung um die Blütenachse in Grad */
  azimuth: number;
}

export interface Projected {
  x: number;
  y: number;
  /** Abstand zur Kamera; größer = näher */
  depth: number;
}

export interface Placement3D {
  pivot: Vec3;
  /** Einheitsvektor Basis -> Spitze */
  dir: Vec3;
  /** Einheitsvektor quer dazu (in der Blattebene) */
  width: Vec3;
  /** Länge in Modell-Einheiten (für Tiefensortierung) */
  length: number;
}

const DEG = Math.PI / 180;

export function project(v: Vec3, cam: Camera): Projected {
  const th = cam.azimuth * DEG;
  const ph = cam.elevation * DEG;
  const x1 = v.x * Math.cos(th) + v.z * Math.sin(th);
  const z1 = -v.x * Math.sin(th) + v.z * Math.cos(th);
  const y1 = v.y;
  return {
    x: x1,
    y: z1 * Math.sin(ph) - y1 * Math.cos(ph),
    depth: y1 * Math.sin(ph) + z1 * Math.cos(ph),
  };
}

/**
 * Platzierung eines Blatts aus Ringparametern:
 * `angle` = Azimut um die Achse (0 = hinten, im Uhrzeigersinn von oben gesehen),
 * `radius` = Abstand der Basis von der Achse, `elevation` = Neigung des Blatts gegen die
 * Horizontale (90 = senkrecht stehend), `lift` = Höhe der Basis, `tilt` = Drehung in der Blattebene.
 */
export function placePetal(angle: number, radius: number, elevation: number, lift: number, tilt: number, length: number): Placement3D {
  const a = angle * DEG;
  const e = elevation * DEG;
  const out: Vec3 = { x: Math.sin(a), y: 0, z: -Math.cos(a) };
  const tangent: Vec3 = { x: Math.cos(a), y: 0, z: Math.sin(a) };
  const up: Vec3 = { x: 0, y: 1, z: 0 };
  let dir: Vec3 = { x: out.x * Math.cos(e) + up.x * Math.sin(e), y: out.y * Math.cos(e) + up.y * Math.sin(e), z: out.z * Math.cos(e) + up.z * Math.sin(e) };
  let width: Vec3 = tangent;
  // Drehung in der Blattebene (Spiral-Optik)
  const t = tilt * DEG;
  const d2: Vec3 = { x: dir.x * Math.cos(t) + width.x * Math.sin(t), y: dir.y * Math.cos(t) + width.y * Math.sin(t), z: dir.z * Math.cos(t) + width.z * Math.sin(t) };
  const w2: Vec3 = { x: -dir.x * Math.sin(t) + width.x * Math.cos(t), y: -dir.y * Math.sin(t) + width.y * Math.cos(t), z: -dir.z * Math.sin(t) + width.z * Math.cos(t) };
  dir = d2;
  width = w2;
  return { pivot: { x: out.x * radius, y: lift, z: out.z * radius }, dir, width, length };
}

/** Kreuzprodukt a × b */
function cross(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

/**
 * Feste Lichtrichtung im Raum (Einheitsvektor zur Lichtquelle): von vorn-oben-links.
 * Sie dreht nicht mit der Kamera mit; die Rose steht fest im Raum, das Licht auch.
 */
const LIGHT: Vec3 = (() => {
  const v = { x: -0.42, y: 0.72, z: 0.56 };
  const n = Math.hypot(v.x, v.y, v.z);
  return { x: v.x / n, y: v.y / n, z: v.z / n };
})();

/** Spanne des Helligkeitsfaktors: abgewandt .. zugewandt */
export const LIGHT_MIN = 0.72;
export const LIGHT_MAX = 1.08;

/**
 * Helligkeitsfaktor eines Blatts aus seiner Flächennormale (Lambert, beidseitig):
 * `facing` ist die Normalkomponente zur Kamera (project(n).depth); zeigt die Normale
 * von der Kamera weg, sehen wir die Rückseite und spiegeln sie. Bei fast kantiger
 * Lage (|facing| klein, z. B. beim Trudeln) wird das Blatt zusätzlich etwas dunkler.
 */
export function lightFactor(normal: Vec3, facing: number): number {
  const sign = facing < 0 ? -1 : 1;
  const lambert = Math.max(0, sign * (normal.x * LIGHT.x + normal.y * LIGHT.y + normal.z * LIGHT.z));
  // Weiche Kurve: Halbschatten bleibt sichtbar, nur klar abgewandte Flächen werden dunkel.
  const lit = Math.pow(lambert, 0.8);
  const edge = Math.abs(facing);
  const edgeDarken = edge < 0.35 ? 1 - 0.15 * (1 - edge / 0.35) : 1;
  return (LIGHT_MIN + (LIGHT_MAX - LIGHT_MIN) * lit) * edgeDarken;
}

export interface PetalTransform {
  matrix: string;
  depth: number;
  /** Flächennormale (dir × width) nach Zusatzdrehung und Trudeln, im Raum */
  normal: Vec3;
  /** Normalkomponente zur Kamera: > 0 Vorderseite, < 0 Rückseite, ~0 kantig */
  facing: number;
}

/**
 * SVG-matrix() für eine Blattgruppe: lokale Koordinaten (Pivot bei 0/0, Spitze bei -y)
 * werden in Bildschirmkoordinaten abgebildet. `extraRot` dreht zusätzlich in der Blattebene,
 * `scale` skaliert um den Pivot. `flip` (Grad) dreht das Blatt um seine Längsachse
 * (Trudeln): die Breitenachse wird um cos(flip) gestaucht, bei cos < 0 ist die Rückseite zu sehen.
 */
export function petalMatrix(p: Placement3D, cam: Camera, scale: number, extraRot = 0, flip = 0): PetalTransform {
  let dir = p.dir;
  let width = p.width;
  if (extraRot) {
    const t = extraRot * DEG;
    dir = { x: p.dir.x * Math.cos(t) + p.width.x * Math.sin(t), y: p.dir.y * Math.cos(t) + p.width.y * Math.sin(t), z: p.dir.z * Math.cos(t) + p.width.z * Math.sin(t) };
    width = { x: -p.dir.x * Math.sin(t) + p.width.x * Math.cos(t), y: -p.dir.y * Math.sin(t) + p.width.y * Math.cos(t), z: -p.dir.z * Math.sin(t) + p.width.z * Math.cos(t) };
  }
  let normal = cross(dir, width);
  if (flip) {
    // Drehung der Breitenachse um die Längsachse: w' = w·cos + n·sin, n' = n·cos − w·sin.
    const f = flip * DEG;
    const cf = Math.cos(f), sf = Math.sin(f);
    const w2 = { x: width.x * cf + normal.x * sf, y: width.y * cf + normal.y * sf, z: width.z * cf + normal.z * sf };
    normal = { x: normal.x * cf - width.x * sf, y: normal.y * cf - width.y * sf, z: normal.z * cf - width.z * sf };
    width = w2;
  }
  const P = project(p.pivot, cam);
  const D = project(dir, cam);
  const W = project(width, cam);
  const a = scale * W.x, b = scale * W.y;
  const c = -scale * D.x, d = -scale * D.y;
  const centre = project({ x: p.pivot.x + p.dir.x * p.length * 0.5, y: p.pivot.y + p.dir.y * p.length * 0.5, z: p.pivot.z + p.dir.z * p.length * 0.5 }, cam);
  const facing = project(normal, cam).depth;
  return { matrix: `matrix(${a.toFixed(4)} ${b.toFixed(4)} ${c.toFixed(4)} ${d.toFixed(4)} ${P.x.toFixed(2)} ${P.y.toFixed(2)})`, depth: centre.depth, normal, facing };
}

/** Matrix für eine flache Scheibe in der Ebene y = lift (z. B. Deckscheibe, Blütenboden). */
export function discMatrix(cam: Camera, lift = 0): string {
  const flat = placePetal(0, 0, 0, lift, 0, 1); // dir zeigt nach hinten, width nach rechts
  return petalMatrix(flat, cam, 1).matrix;
}
