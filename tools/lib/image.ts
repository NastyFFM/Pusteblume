import { readFileSync, writeFileSync } from "node:fs";
import { PNG } from "pngjs";

/** Einfaches RGBA-Bild im Speicher. */
export interface Image {
  width: number;
  height: number;
  data: Uint8Array; // RGBA, zeilenweise
}

export function createImage(width: number, height: number): Image {
  return { width, height, data: new Uint8Array(width * height * 4) };
}

export function loadPng(path: string): Image {
  const png = PNG.sync.read(readFileSync(path));
  return { width: png.width, height: png.height, data: new Uint8Array(png.data) };
}

export function savePng(path: string, img: Image) {
  const png = new PNG({ width: img.width, height: img.height });
  png.data = Buffer.from(img.data);
  writeFileSync(path, PNG.sync.write(png, { deflateLevel: 9, filterType: -1 }));
}

export function blit(dst: Image, src: Image, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number) {
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const si = ((sy + y) * src.width + (sx + x)) * 4;
      const di = ((dy + y) * dst.width + (dx + x)) * 4;
      dst.data[di] = src.data[si]!;
      dst.data[di + 1] = src.data[si + 1]!;
      dst.data[di + 2] = src.data[si + 2]!;
      dst.data[di + 3] = src.data[si + 3]!;
    }
  }
}

/** Verkleinern per Flächenmittel (Box-Filter); Alpha wird mitgemittelt. */
export function downscale(src: Image, factor: number): Image {
  if (factor >= 1) return src;
  const w = Math.max(1, Math.round(src.width * factor));
  const h = Math.max(1, Math.round(src.height * factor));
  const out = createImage(w, h);
  const sx = src.width / w, sy = src.height / h;
  for (let y = 0; y < h; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.min(src.height, Math.ceil((y + 1) * sy));
    for (let x = 0; x < w; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.min(src.width, Math.ceil((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * src.width + xx) * 4;
          const al = src.data[i + 3]!;
          // Farben alpha-gewichtet mitteln, damit transparente Nachbarn den Rand nicht verfärben
          r += src.data[i]! * al; g += src.data[i + 1]! * al; b += src.data[i + 2]! * al; a += al; n++;
        }
      }
      const o = (y * w + x) * 4;
      if (a > 0) { out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a); }
      out.data[o + 3] = Math.round(a / n);
    }
  }
  return out;
}
