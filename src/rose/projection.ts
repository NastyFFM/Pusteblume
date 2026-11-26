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

/**
 * SVG-matrix() für eine Blattgruppe: lokale Koordinaten (Pivot bei 0/0, Spitze bei -y)
 * werden in Bildschirmkoordinaten abgebildet. `extraRot` dreht zusätzlich in der Blattebene,
 * `scale` skaliert um den Pivot.
 */
export function petalMatrix(p: Placement3D, cam: Camera, scale: number, extraRot = 0): { matrix: string; depth: number } {
  let dir = p.dir;
  let width = p.width;
  if (extraRot) {
    const t = extraRot * DEG;
    dir = { x: p.dir.x * Math.cos(t) + p.width.x * Math.sin(t), y: p.dir.y * Math.cos(t) + p.width.y * Math.sin(t), z: p.dir.z * Math.cos(t) + p.width.z * Math.sin(t) };
    width = { x: -p.dir.x * Math.sin(t) + p.width.x * Math.cos(t), y: -p.dir.y * Math.sin(t) + p.width.y * Math.cos(t), z: -p.dir.z * Math.sin(t) + p.width.z * Math.cos(t) };
  }
  const P = project(p.pivot, cam);
  const D = project(dir, cam);
  const W = project(width, cam);
  const a = scale * W.x, b = scale * W.y;
  const c = -scale * D.x, d = -scale * D.y;
  const centre = project({ x: p.pivot.x + p.dir.x * p.length * 0.5, y: p.pivot.y + p.dir.y * p.length * 0.5, z: p.pivot.z + p.dir.z * p.length * 0.5 }, cam);
  return { matrix: `matrix(${a.toFixed(4)} ${b.toFixed(4)} ${c.toFixed(4)} ${d.toFixed(4)} ${P.x.toFixed(2)} ${P.y.toFixed(2)})`, depth: centre.depth };
}

/** Matrix für eine flache Scheibe in der Ebene y = lift (z. B. Deckscheibe, Blütenboden). */
export function discMatrix(cam: Camera, lift = 0): string {
  const flat = placePetal(0, 0, 0, lift, 0, 1); // dir zeigt nach hinten, width nach rechts
  return petalMatrix(flat, cam, 1).matrix;
}
