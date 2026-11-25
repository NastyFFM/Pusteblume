/**
 * Erzeugt ein synthetisches "Blättersheet", wie es die KI später liefern soll:
 * einzelne Blütenblätter, zufällig gedreht und versetzt, auf weißem Hintergrund.
 *   node tools/make-fixture.cjs [ausgabe.png]
 */
const { chromium } = require("playwright");
const path = require("node:path");

const out = process.argv[2] || path.join(__dirname, "fixtures", "petal-sheet.png");

function petalPath(h, openness) {
  const w = h * (0.62 + openness * 0.5);
  const notch = 0.86 + (1 - openness) * 0.1;
  const bulge = 0.5 + openness * 0.12;
  return `M 0 0 C ${-w * 0.5} ${-h * 0.04}, ${-w * 0.66} ${-h * bulge}, ${-w * 0.45} ${-h * 0.84} C ${-w * 0.33} ${-h * 1.02}, ${-w * 0.12} ${-h}, 0 ${-h * notch} C ${w * 0.12} ${-h}, ${w * 0.33} ${-h * 1.02}, ${w * 0.45} ${-h * 0.84} C ${w * 0.66} ${-h * bulge}, ${w * 0.5} ${-h * 0.04}, 0 0 Z`;
}

(async () => {
  let seed = 42;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cols = 4, rows = 4, cell = 260;
  let shapes = "";
  const truth = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const openness = i / (cols * rows - 1);
      const h = 85 + openness * 50;
      const cx = c * cell + cell / 2 + (rnd() - 0.5) * 30;
      const cy = r * cell + cell / 2 + h * 0.45 + (rnd() - 0.5) * 24;
      const rot = (rnd() - 0.5) * 120;
      truth.push({ baseX: cx, baseY: cy, rot, h });
      shapes += `<g transform="translate(${cx} ${cy}) rotate(${rot})">
        <path d="${petalPath(h, openness)}" fill="url(#g)" stroke="#5a0716" stroke-opacity="0.5" stroke-width="1.5"/>
        <path d="${petalPath(h * 0.92, openness)}" fill="none" stroke="#ffb7c4" stroke-opacity="0.5" stroke-width="2" transform="translate(0 -4)"/>
      </g>`;
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="${rows * cell}">
    <defs><linearGradient id="g" x1="0" y1="1" x2="0" y2="0">
      <stop offset="0" stop-color="#f9e2b0"/><stop offset="0.12" stop-color="#8a0a22"/><stop offset="0.35" stop-color="#a30f2a"/><stop offset="0.75" stop-color="#d61f42"/><stop offset="1" stop-color="#ef5a74"/>
    </linearGradient></defs>
    <rect width="100%" height="100%" fill="#fdfbf8"/>${shapes}</svg>`;

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: cols * cell, height: rows * cell } });
  await page.setContent(`<body style="margin:0">${svg}</body>`);
  await page.screenshot({ path: out, omitBackground: false });
  await browser.close();
  require("node:fs").writeFileSync(out.replace(/\.png$/, ".json"), JSON.stringify(truth, null, 2));
  console.log("Fixture geschrieben:", out);
})();
