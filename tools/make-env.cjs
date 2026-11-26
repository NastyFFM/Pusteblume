/**
 * Equirektangulares Panorama für die Umgebung aufbereiten: verkleinern, weichzeichnen, als JPEG speichern.
 *   node tools/make-env.cjs <eingabe.png> <ausgabe.jpg> [breite=1536] [blur=14]
 * Nutzt Chromium (Playwright) als Bildprozessor, damit keine nativen Abhängigkeiten nötig sind.
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

(async () => {
  const [input, output, widthArg = "1536", blurArg = "14"] = process.argv.slice(2);
  if (!input || !output) { console.error("Aufruf: node tools/make-env.cjs <eingabe.png> <ausgabe.jpg> [breite] [blur]"); process.exit(1); }
  const width = Number(widthArg), blur = Number(blurArg), height = Math.round(width / 2);
  const dataUrl = "data:image/png;base64," + fs.readFileSync(input).toString("base64");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const jpeg = await page.evaluate(async ({ dataUrl, width, height, blur }) => {
    const img = new Image(); img.src = dataUrl; await img.decode();
    // 1) Nahtlose Zwischenfläche: drei Kopien nebeneinander (horizontal umlaufend), oben und unten
    //    um den Blur-Rand gestreckt, damit der Weichzeichner nirgends gegen Transparenz läuft.
    const m = blur * 3;
    const big = document.createElement("canvas"); big.width = width * 3; big.height = height + 2 * m;
    const bctx = big.getContext("2d");
    for (const dx of [0, width, width * 2]) bctx.drawImage(img, dx, -m, width, height + 2 * m);
    // 2) Einmal weichzeichnen und den mittleren Ausschnitt übernehmen
    const c = document.createElement("canvas"); c.width = width; c.height = height;
    const ctx = c.getContext("2d");
    ctx.filter = `blur(${blur}px)`;
    ctx.drawImage(big, -width, -m);
    ctx.filter = "none";
    return c.toDataURL("image/jpeg", 0.82);
  }, { dataUrl, width, height, blur });
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, Buffer.from(jpeg.split(",")[1], "base64"));
  console.log("geschrieben:", output, width + "x" + height);
  await browser.close();
})();
