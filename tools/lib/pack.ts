/** Einfaches Regal-Packen (Shelf Packing) für Sprites ähnlicher Größe. */
export interface Rect {
  w: number;
  h: number;
}
export interface Placed extends Rect {
  x: number;
  y: number;
}

export function packShelves(rects: Rect[], maxWidth: number, padding = 2): { placed: Placed[]; width: number; height: number } {
  const order = rects.map((r, i) => ({ r, i })).sort((a, b) => b.r.h - a.r.h);
  const placed: Placed[] = new Array(rects.length);
  let x = padding, y = padding, shelfH = 0, width = 0;
  for (const { r, i } of order) {
    if (x + r.w + padding > maxWidth && x > padding) {
      x = padding;
      y += shelfH + padding;
      shelfH = 0;
    }
    placed[i] = { x, y, w: r.w, h: r.h };
    x += r.w + padding;
    shelfH = Math.max(shelfH, r.h);
    width = Math.max(width, x);
  }
  return { placed, width, height: y + shelfH + padding };
}
