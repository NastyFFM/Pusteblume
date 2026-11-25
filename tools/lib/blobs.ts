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
export function findBlobs(img: Image, minArea = 200, alphaThreshold = 40): Blob[] {
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
 * 1. Gibt es eine Kerbe (tiefste Einbuchtung), liegt die Spitze dort und die Achse läuft von der
 *    Kerbe durch den Schwerpunkt; die Basis liegt gegenüber.
 * 2. Sonst: Richtungs-Sweep, bei dem das Ende mit der kleinsten Fläche die Basis ist.
 */
export function analyzePetal(blob: Blob, imageWidth: number): PetalGeometry {
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

  const step = n > 20000 ? 7 : 1; // Pixel-Unterabtastung für große Blobs
  const extent = (ax: number, ay: number) => {
    let tMin = Infinity, tMax = -Infinity, uMin = Infinity, uMax = -Infinity;
    for (let i = 0; i < n; i += step) {
      const dx = xs[i]! - cx, dy = ys[i]! - cy;
      const t = dx * ax + dy * ay, u = -dx * ay + dy * ax;
      if (t < tMin) tMin = t;
      if (t > tMax) tMax = t;
      if (u < uMin) uMin = u;
      if (u > uMax) uMax = u;
    }
    return { tMin, tMax, uMin, uMax };
  };

  const approxLength = Math.max(blob.w, blob.h);
  const notch = deepestNotch(boundaryPoints(blob, imageWidth), approxLength * 0.035);

  let theta: number;
  let baseIsLow: boolean;
  if (notch) {
    // Achse: Schwerpunkt -> Kerbe. Spitze liegt bei der Kerbe (positives t).
    theta = Math.atan2(notch.y - cy, notch.x - cx);
    baseIsLow = true;
  } else {
    let best = { score: -Infinity, theta: 0, baseIsLow: true };
    for (let deg = 0; deg < 180; deg += 3) {
      const th = (deg * Math.PI) / 180;
      const ax = Math.cos(th), ay = Math.sin(th);
      const e = extent(ax, ay);
      const length = e.tMax - e.tMin;
      const band = length * 0.22;
      let loArea = 0, hiArea = 0;
      for (let i = 0; i < n; i += step) {
        const t = (xs[i]! - cx) * ax + (ys[i]! - cy) * ay;
        if (t < e.tMin + band) loArea++;
        else if (t > e.tMax - band) hiArea++;
      }
      const asym = Math.abs(loArea - hiArea) / Math.max(1, loArea + hiArea);
      const score = asym + 0.1 * (length / Math.max(1, e.uMax - e.uMin));
      if (score > best.score) best = { score, theta: th, baseIsLow: loArea <= hiArea };
    }
    theta = best.theta;
    baseIsLow = best.baseIsLow;
  }

  const ax = Math.cos(theta), ay = Math.sin(theta);
  const { tMin, tMax, uMin, uMax } = extent(ax, ay);
  const length = tMax - tMin;
  const tBase = baseIsLow ? tMin : tMax;
  const dir = baseIsLow ? 1 : -1; // Richtung Basis -> Spitze entlang der Achse
  const tPivot = tBase + dir * length * 0.03; // 3 % nach innen, damit der Pivot sicher im Blatt liegt
  const pivot = { x: cx + tPivot * ax, y: cy + tPivot * ay };

  const phi = (Math.atan2(dir * ay, dir * ax) * 180) / Math.PI;
  let rotation = -90 - phi;
  rotation = ((((rotation + 180) % 360) + 360) % 360) - 180;

  return { pivot, rotation, length, width: uMax - uMin };
}
