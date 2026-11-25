import type { Image } from "./image";

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  if (s === 0) return [l * 255, l * 255, l * 255];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const f = (t: number) => {
    t = ((t % 1) + 1) % 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
}

export type RoseTint = "red" | "white" | "yellow";

/**
 * Farbvariante aus dem (roten) Quellbild ableiten.
 * gelb: Farbton drehen; weiß: entsättigen und aufhellen, Schatten bleiben erhalten.
 */
export function recolor(src: Image, tint: RoseTint): Image {
  const out: Image = { width: src.width, height: src.height, data: new Uint8Array(src.data) };
  if (tint === "red") return out;
  const d = out.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    let [h, s, l] = rgbToHsl(d[i]!, d[i + 1]!, d[i + 2]!);
    if (tint === "yellow") {
      h = Math.min(0.145, 0.13 + (h > 0.5 ? h - 1 : h) * 0.4); // rot (~0) -> gelb (~0.13), nie ins Grünliche
      s = Math.min(1, s * 1.05);
      l = Math.min(1, l * 1.08 + 0.04);
    } else {
      h = 0.11; // leicht cremig
      s = s * 0.12;
      l = 0.72 + l * 0.3;
    }
    const [r, g, b] = hslToRgb(h, s, l);
    d[i] = Math.round(r);
    d[i + 1] = Math.round(g);
    d[i + 2] = Math.round(b);
  }
  return out;
}
