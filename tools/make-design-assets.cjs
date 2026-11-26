/**
 * Design-Assets aus Figma für das Web aufbereiten (Chromium/Playwright als Bildbearbeitung).
 *
 *   node tools/make-design-assets.cjs
 *
 * Quellen in tools/design-src (nicht im Build), Ergebnis in public/design:
 * - petal-{a,b,c}-{farbe}.webp  freigestellte Blütenblätter, je Kartenfarbe eingefärbt
 * - bed-{farbe}.webp            Rosenbett (Foto), je Kartenfarbe eingefärbt
 * - paper.webp                  Papierstruktur der Zitatkarte
 * Einfärben: Pixel nach HSL, Farbton auf Zielton setzen, Sättigung/Helligkeit skalieren.
 * Die Zielwerte entsprechen den Farbkreisen im Figma-Design (#8A020E, #FFFFFF, #FF92A2, #F0D4C3, #D9D9D9).
 */
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require("playwright");

const SRC = path.join(__dirname, "design-src");
const OUT = path.join(__dirname, "..", "public", "design");

/** hue: Zielfarbton in Grad (null = unverändert); sat/light: Faktoren; lightAdd: Verschiebung der Helligkeit */
const COLORS = {
  rosa: { hue: null, sat: 1, light: 1, lightAdd: 0 },
  red: { hue: 350, sat: 1.15, light: 0.5, lightAdd: -0.04 },
  white: { hue: 350, sat: 0.12, light: 1, lightAdd: 0.16 },
  beige: { hue: 24, sat: 0.55, light: 1, lightAdd: 0.1 },
  grey: { hue: 350, sat: 0.0, light: 0.92, lightAdd: 0.02 },
};

const JOBS = [
  { src: "petal-a.png", out: "petal-a", width: 360, tint: true, quality: 0.82 },
  { src: "petal-b.png", out: "petal-b", width: 360, tint: true, quality: 0.82 },
  { src: "petal-c.png", out: "petal-c", width: 360, tint: true, quality: 0.82 },
  { src: "roses.png", out: "bed", width: 1280, tint: true, quality: 0.72 },
  { src: "paper.png", out: "paper", width: 900, tint: false, quality: 0.7 },
];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent("<canvas id=c></canvas>");

  for (const job of JOBS) {
    const bytes = fs.readFileSync(path.join(SRC, job.src));
    const dataUrl = `data:image/png;base64,${bytes.toString("base64")}`;
    const variants = job.tint ? Object.entries(COLORS) : [["", null]];
    for (const [name, spec] of variants) {
      const result = await page.evaluate(
        async ({ dataUrl, width, spec, quality }) => {
          const img = new Image();
          img.src = dataUrl;
          await img.decode();
          const scale = Math.min(1, width / img.naturalWidth);
          const w = Math.round(img.naturalWidth * scale);
          const h = Math.round(img.naturalHeight * scale);
          const c = document.getElementById("c");
          c.width = w;
          c.height = h;
          const ctx = c.getContext("2d");
          ctx.imageSmoothingQuality = "high";
          ctx.drawImage(img, 0, 0, w, h);
          if (spec) {
            const id = ctx.getImageData(0, 0, w, h);
            const d = id.data;
            for (let i = 0; i < d.length; i += 4) {
              if (d[i + 3] === 0) continue;
              const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
              const max = Math.max(r, g, b), min = Math.min(r, g, b);
              let hh = 0, s = 0;
              let l = (max + min) / 2;
              const dlt = max - min;
              if (dlt > 0) {
                s = l > 0.5 ? dlt / (2 - max - min) : dlt / (max + min);
                if (max === r) hh = ((g - b) / dlt + (g < b ? 6 : 0)) / 6;
                else if (max === g) hh = ((b - r) / dlt + 2) / 6;
                else hh = ((r - g) / dlt + 4) / 6;
              }
              if (spec.hue !== null) hh = spec.hue / 360;
              s = Math.min(1, s * spec.sat);
              l = Math.min(1, Math.max(0, l * spec.light + spec.lightAdd));
              const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
              const p = 2 * l - q;
              const f = (t) => {
                if (t < 0) t += 1;
                if (t > 1) t -= 1;
                if (t < 1 / 6) return p + (q - p) * 6 * t;
                if (t < 1 / 2) return q;
                if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                return p;
              };
              d[i] = Math.round(f(hh + 1 / 3) * 255);
              d[i + 1] = Math.round(f(hh) * 255);
              d[i + 2] = Math.round(f(hh - 1 / 3) * 255);
            }
            ctx.putImageData(id, 0, 0);
          }
          return c.toDataURL("image/webp", quality);
        },
        { dataUrl, width: job.width, spec, quality: job.quality },
      );
      const file = `${job.out}${name ? `-${name}` : ""}.webp`;
      fs.writeFileSync(path.join(OUT, file), Buffer.from(result.split(",")[1], "base64"));
      console.log(file, fs.statSync(path.join(OUT, file)).size, "B");
    }
  }
  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
