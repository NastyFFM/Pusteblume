import type { Image } from "./image";

/**
 * Hintergrund freistellen.
 * Hat das Bild bereits einen echten Alphakanal, wird er übernommen. Sonst wird die
 * Hintergrundfarbe aus den Bildecken bestimmt und per Flood-Fill von den Rändern
 * her entfernt. Dadurch bleiben helle Flächen im Inneren eines Blatts erhalten.
 */
export function removeBackground(img: Image, tolerance = 40): void {
  const { width, height, data } = img;
  let hasAlpha = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i]! < 250) {
      hasAlpha = true;
      break;
    }
  }
  if (hasAlpha) return;

  // Hintergrundfarbe: Mittelwert der vier Ecken
  const corners = [0, (width - 1) * 4, (height - 1) * width * 4, ((height - 1) * width + width - 1) * 4];
  const bg = [0, 1, 2].map((c) => corners.reduce((s, i) => s + data[i + c]!, 0) / 4);

  const dist = (i: number) => Math.hypot(data[i]! - bg[0]!, data[i + 1]! - bg[1]!, data[i + 2]! - bg[2]!);
  const visited = new Uint8Array(width * height);
  const stack: number[] = [];
  const push = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const p = y * width + x;
    if (visited[p]) return;
    visited[p] = 1;
    if (dist(p * 4) <= tolerance) stack.push(p);
  };
  for (let x = 0; x < width; x++) {
    push(x, 0);
    push(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    push(0, y);
    push(width - 1, y);
  }
  while (stack.length) {
    const p = stack.pop()!;
    const x = p % width;
    const y = (p - x) / width;
    data[p * 4 + 3] = 0;
    push(x + 1, y);
    push(x - 1, y);
    push(x, y + 1);
    push(x, y - 1);
  }
  // Weiche Kante: Pixel nahe der Hintergrundfarbe am Rand teilweise transparent machen
  for (let p = 0; p < width * height; p++) {
    if (data[p * 4 + 3] === 0) continue;
    const d = dist(p * 4);
    if (d < tolerance * 1.5) {
      const x = p % width;
      const y = (p - x) / width;
      const nearBg =
        (x > 0 && data[(p - 1) * 4 + 3] === 0) ||
        (x < width - 1 && data[(p + 1) * 4 + 3] === 0) ||
        (y > 0 && data[(p - width) * 4 + 3] === 0) ||
        (y < height - 1 && data[(p + width) * 4 + 3] === 0);
      if (nearBg) {
        const a = Math.min(1, d / (tolerance * 1.5));
        data[p * 4 + 3] = Math.round(255 * a);
        // Entmischen: Pixel = a * Blattfarbe + (1 - a) * Hintergrund  =>  Blattfarbe zurückrechnen
        if (a > 0.05) {
          for (let c = 0; c < 3; c++) {
            const v = (data[p * 4 + c]! - bg[c]! * (1 - a)) / a;
            data[p * 4 + c] = Math.max(0, Math.min(255, Math.round(v)));
          }
        }
      }
    }
  }
}

export interface Blob {
  /** Bounding Box im Quellbild */
  x: number;
  y: number;
  w: number;
  h: number;
  area: number;
  /** Pixelindizes (y * width + x) */
  pixels: Int32Array;
}

/** Zusammenhängende, nicht transparente Flächen finden (4er-Nachbarschaft). */
export function findBlobs(img: Image, minArea = 200, alphaThreshold = 96): Blob[] {
  const { width, height, data } = img;
  const label = new Int32Array(width * height).fill(-1);
  const blobs: Blob[] = [];
  const stack: number[] = [];

  for (let start = 0; start < width * height; start++) {
    if (label[start] !== -1 || data[start * 4 + 3]! < alphaThreshold) continue;
    const id = blobs.length;
    const pixels: number[] = [];
    let minX = width, minY = height, maxX = 0, maxY = 0;
    label[start] = id;
    stack.push(start);
    while (stack.length) {
      const p = stack.pop()!;
      pixels.push(p);
      const x = p % width;
      const y = (p - x) / width;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      const neighbours = [x > 0 ? p - 1 : -1, x < width - 1 ? p + 1 : -1, y > 0 ? p - width : -1, y < height - 1 ? p + width : -1];
      for (const n of neighbours) {
        if (n < 0 || label[n] !== -1 || data[n * 4 + 3]! < alphaThreshold) continue;
        label[n] = id;
        stack.push(n);
      }
    }
    if (pixels.length >= minArea) {
      blobs.push({ x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1, area: pixels.length, pixels: Int32Array.from(pixels) });
    } else {
      for (const p of pixels) data[p * 4 + 3] = 0; // Krümel entfernen
    }
  }
  return blobs.sort((a, b) => a.y - b.y || a.x - b.x);
}

export interface PetalGeometry {
  /** Pivot (Blattbasis) in Bildkoordinaten */
  pivot: { x: number; y: number };
  /** Drehung in Grad, die die Achse Basis→Spitze auf "nach oben" bringt */
  rotation: number;
  length: number;
  width: number;
}

/**
 * Form eines Blatt-Blobs analysieren:
 * Hauptachse per PCA, Blattbasis = das schmalere Ende, Pivot liegt dort auf der Achse.
 */
/** Randpixel eines Blobs (mindestens ein 4er-Nachbar liegt außerhalb). */
function boundaryPoints(blob: Blob, imageWidth: number): { x: number; y: number }[] {
  const set = new Set<number>(blob.pixels);
  const out: { x: number; y: number }[] = [];
  for (const p of blob.pixels) {
    const x = p % imageWidth;
    const y = (p - x) / imageWidth;
    if (!set.has(p - 1) || !set.has(p + 1) || !set.has(p - imageWidth) || !set.has(p + imageWidth)) out.push({ x, y });
  }
  return out;
}

/** Konvexe Hülle (Andrew's monotone chain). */
function convexHull(pts: { x: number; y: number }[]): { x: number; y: number }[] {
  const s = [...pts].sort((a, b) => a.x - b.x || a.y - b.y);
  const cross = (o: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: { x: number; y: number }[] = [];
  for (const p of s) {
    while (lower.length >= 2 && cross(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: { x: number; y: number }[] = [];
  for (let i = s.length - 1; i >= 0; i--) {
    const p = s[i]!;
    while (upper.length >= 2 && cross(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return lower.slice(0, -1).concat(upper.slice(0, -1));
}

function distToSegment(p: { x: number; y: number }, a: { x: number; y: number }, b: { x: number; y: number }) {
  const vx = b.x - a.x, vy = b.y - a.y;
  const len2 = vx * vx + vy * vy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / len2));
  return Math.hypot(p.x - (a.x + t * vx), p.y - (a.y + t * vy));
}

/**
 * Tiefste Einbuchtung des Umrisses gegenüber der konvexen Hülle. Bei Rosenblättern ist
 * das die Kerbe an der Spitze. Liefert null, wenn keine nennenswerte Einbuchtung existiert.
 */
function deepestNotch(boundary: { x: number; y: number }[], minDepth: number): { x: number; y: number; depth: number } | null {
  const hull = convexHull(boundary);
  if (hull.length < 3) return null;
  let best: { x: number; y: number; depth: number } | null = null;
  for (let i = 0; i < boundary.length; i += 2) {
    const p = boundary[i]!;
    let d = Infinity;
    for (let k = 0; k < hull.length; k++) {
      const dd = distToSegment(p, hull[k]!, hull[(k + 1) % hull.length]!);
      if (dd < d) d = dd;
    }
    if (d >= minDepth && (!best || d > best.depth)) best = { x: p.x, y: p.y, depth: d };
  }
  return best;
}

/**
 * Form eines Blatt-Blobs analysieren.
 * Alle Richtungen (Basis -> Spitze) werden in 3°-Schritten bewertet:
 *  - Spitzheit: Breite am Basisende im Verhältnis zur Breite am Spitzenende (Blattbasis läuft spitz zu)
 *  - Kerbe: liegt die tiefste Einbuchtung des Umrisses am Spitzenende, gibt es einen Bonus
 *  - Länge entlang der Achse als Nebenkriterium
 * Die beste Richtung liefert Achse, Basis und damit Pivot und Rotation.
 */
export function analyzePetal(blob: Blob, img: Image): PetalGeometry {
  const imageWidth = img.width;
  const n = blob.pixels.length;
  let cx = 0, cy = 0;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = blob.pixels[i]!;
    const x = p % imageWidth;
    const y = (p - x) / imageWidth;
    xs[i] = x;
    ys[i] = y;
    cx += x;
    cy += y;
  }
  cx /= n;
  cy /= n;

  const step = n > 20000 ? 5 : 1; // Pixel-Unterabtastung für große Blobs
  const approxLength = Math.max(blob.w, blob.h);

  // Primärer Hinweis: die helle, entsättigte Blattbasis (bei Rosenblättern sehr zuverlässig).
  // Die hellsten 4 % der Pixel müssen sich deutlich vom Rest abheben und als Gruppe am Rand liegen.
  const pale = paleBase(blob, img, cx, cy, approxLength);
  if (pale) {
    const theta = Math.atan2(cy - pale.y, cx - pale.x); // Richtung Basis -> Spitze
    return finishAxis(theta, xs, ys, cx, cy, n, step);
  }

  const notch = deepestNotch(boundaryPoints(blob, imageWidth), approxLength * 0.035);

  interface Candidate { score: number; theta: number; tMin: number; tMax: number; uMin: number; uMax: number }
  let best: Candidate | null = null;

  for (let deg = 0; deg < 360; deg += 3) {
    const theta = (deg * Math.PI) / 180; // Richtung Basis -> Spitze
    const ax = Math.cos(theta), ay = Math.sin(theta);
    let tMin = Infinity, tMax = -Infinity, uMin = Infinity, uMax = -Infinity;
    for (let i = 0; i < n; i += step) {
      const dx = xs[i]! - cx, dy = ys[i]! - cy;
      const t = dx * ax + dy * ay, u = -dx * ay + dy * ax;
      if (t < tMin) tMin = t;
      if (t > tMax) tMax = t;
      if (u < uMin) uMin = u;
      if (u > uMax) uMax = u;
    }
    const length = tMax - tMin;
    const width = uMax - uMin;
    // Querschnittsbreite in fester Tiefe hinter beiden Enden (10 % und 20 % der Länge).
    // Eine echte Blattbasis bleibt dort schmal, eine bloße Ecke ist dort schon breit.
    const slices = [0.1, 0.2].map((f) => ({ t: tMin + length * f, min: Infinity, max: -Infinity }));
    const tipSlices = [0.1, 0.2].map((f) => ({ t: tMax - length * f, min: Infinity, max: -Infinity }));
    const half = length * 0.025;
    for (let i = 0; i < n; i += step) {
      const dx = xs[i]! - cx, dy = ys[i]! - cy;
      const t = dx * ax + dy * ay, u = -dx * ay + dy * ax;
      for (const sl of slices) if (Math.abs(t - sl.t) <= half) { if (u < sl.min) sl.min = u; if (u > sl.max) sl.max = u; }
      for (const sl of tipSlices) if (Math.abs(t - sl.t) <= half) { if (u < sl.min) sl.min = u; if (u > sl.max) sl.max = u; }
    }
    const w = (sl: { min: number; max: number }) => (sl.max > sl.min ? sl.max - sl.min : 1);
    const baseW = (w(slices[0]!) + w(slices[1]!)) / 2;
    const tipW = (w(tipSlices[0]!) + w(tipSlices[1]!)) / 2;
    const pointiness = 1 - baseW / Math.max(baseW, tipW); // 0 = beide Enden gleich breit, ->1 = Basis sehr spitz

    let notchBonus = 0;
    if (notch) {
      const tNotch = (notch.x - cx) * ax + (notch.y - cy) * ay;
      if (tNotch > tMax - length * 0.25) notchBonus = Math.min(1, notch.depth / (approxLength * 0.08));
    }

    const score = pointiness * 1.0 + notchBonus * 0.4 + (length / Math.max(1, width)) * 0.1;
    if (!best || score > best.score) best = { score, theta, tMin, tMax, uMin, uMax };
  }

  return finishAxis(best!.theta, xs, ys, cx, cy, n, step);
}

/** Aus einer Achsrichtung (Basis -> Spitze) Pivot, Rotation, Länge und Breite ableiten. */
function finishAxis(theta: number, xs: Float64Array, ys: Float64Array, cx: number, cy: number, n: number, step: number): PetalGeometry {
  const ax = Math.cos(theta), ay = Math.sin(theta);
  let tMin = Infinity, tMax = -Infinity, uMin = Infinity, uMax = -Infinity;
  for (let i = 0; i < n; i += step) {
    const dx = xs[i]! - cx, dy = ys[i]! - cy;
    const t = dx * ax + dy * ay, u = -dx * ay + dy * ax;
    if (t < tMin) tMin = t;
    if (t > tMax) tMax = t;
    if (u < uMin) uMin = u;
    if (u > uMax) uMax = u;
  }
  const length = tMax - tMin;
  const tPivot = tMin + length * 0.03; // 3 % nach innen, damit der Pivot sicher im Blatt liegt
  const pivot = { x: cx + tPivot * ax, y: cy + tPivot * ay };
  const phi = (Math.atan2(ay, ax) * 180) / Math.PI;
  let rotation = -90 - phi;
  rotation = ((((rotation + 180) % 360) + 360) % 360) - 180;
  return { pivot, rotation, length, width: uMax - uMin };
}

/**
 * Schwerpunkt der hellsten, am wenigsten gesättigten Pixel, falls sie sich klar abheben
 * und als Gruppe am Rand des Blatts liegen. Sonst null.
 */
function paleBase(blob: Blob, img: Image, cx: number, cy: number, approxLength: number): { x: number; y: number } | null {
  const n = blob.pixels.length;
  const scores = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const k = blob.pixels[i]! * 4;
    const r = img.data[k]! / 255, g = img.data[k + 1]! / 255, b = img.data[k + 2]! / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const l = (max + min) / 2;
    const sat = max === min ? 0 : (max - min) / (1 - Math.abs(2 * l - 1));
    scores[i] = l * (1 - 0.6 * sat); // hell und blass = hoch
  }
  const sorted = Float32Array.from(scores).sort();
  const median = sorted[Math.floor(n / 2)]!;
  const cut = sorted[Math.floor(n * 0.96)]!;
  if (cut - median < 0.06) return null; // kein deutlicher Kontrast

  let sx = 0, sy = 0, count = 0, spread = 0;
  for (let i = 0; i < n; i++) {
    if (scores[i]! < cut) continue;
    const p = blob.pixels[i]!;
    const x = p % img.width;
    const y = (p - x) / img.width;
    sx += x;
    sy += y;
    count++;
  }
  if (count < 20) return null;
  sx /= count;
  sy /= count;
  for (let i = 0; i < n; i++) {
    if (scores[i]! < cut) continue;
    const p = blob.pixels[i]!;
    const x = p % img.width;
    const y = (p - x) / img.width;
    spread += Math.hypot(x - sx, y - sy);
  }
  spread /= count;
  // Die hellen Pixel müssen gebündelt sein (keine Glanzlichter überall) und abseits der Mitte liegen.
  if (spread > approxLength * 0.2) return null;
  if (Math.hypot(sx - cx, sy - cy) < approxLength * 0.2) return null;
  return { x: sx, y: sy };
}
