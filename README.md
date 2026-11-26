# Pusteblume 🌹

Interaktive, mobile Valentins-Karte nach dem Figma-Design „Valentines App“: Ein Bett aus Rosenblättern
in einer Schachtel verdeckt eine persönliche Botschaft. Der Empfänger pustet ins Mikrofon des Handys,
die Blütenblätter fliegen davon (je kräftiger, desto wilder) und die Botschaft liegt frei.

Die App läuft rein im Frontend, ohne Server und ohne Datenbank. Production-Branch ist `main`.

## Was drin ist

- **Ersteller** (`/` → `/farbe` → `/nachricht` → `/probieren` → `/versenden`): Blattfarbe (Rot, Weiß, Rosa, Beige, Grau),
  eine von fünf Zitat-Vorlagen, selbst ausprobieren, Link kopieren oder teilen.
- **Empfänger** (`/v/<kodierte Karte>`): Blätterbett über der Botschaft, Pust-Erkennung per Web Audio API,
  Fallback per Wischen (ohne Mikrofon) und Leertaste (Desktop), danach Einladung zur eigenen Nachricht.
- **Links**: Die Karte steckt vollständig im Link (base64url-kodiertes JSON, `shared/link.ts`). Nichts wird gespeichert.
- **Assets**: Blätter und Blätterhaufen aus dem Design, je Farbe eingefärbt (`node tools/make-design-assets.cjs`),
  Schriften Inter und Instrument Serif selbst gehostet.

Die frühere Rosen-Darstellung (Sprite-Atlas, Pseudo-3D) liegt weiter unter `src/rose/` und `src/view/`, wird aber
nicht mehr benutzt; die Atlas-Pipeline unten ist deshalb nur noch historisch.

## Entwicklung

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest
npm run typecheck
npm run build
```

Das Mikrofon funktioniert im Browser nur über HTTPS oder `localhost`. Zum Testen am Handy
daher am einfachsten ein Vercel-Preview-Deployment nutzen.

## Deployment (Vercel)

Projekt mit Vercel verbinden, Framework Vite. `vercel.json` leitet alle Pfade auf die SPA um. Mehr ist nicht nötig.

Kurzlinks mit Datenbank (Vercel Functions + Upstash Redis) waren in einer früheren Version enthalten
(siehe Git-Historie bis Commit `e69aa2e`) und lassen sich bei Bedarf wieder aktivieren.

## Projektstruktur

```
shared/         Datenmodell (Farben, Zitate), Validierung, Link-Kodierung (+ Tests)
src/ui/         Bausteine (kit.ts), Bühne (blow-stage.ts), Ersteller- und Empfänger-Flow
src/petals/     Blütenbett (Verteilung und DOM der Blatt-Sprites)
src/rose/       Pust-Physik (physics.ts); Rest = alte Rosen-Darstellung, ungenutzt
src/blow/       Mikrofon-Erkennung und Gesten-Fallback
public/design/  Logo, Blätter, Papier (aus Figma) · public/fonts/ Schriften
tools/          make-design-assets.cjs (Asset-Pipeline), build-atlas.ts (alte Sprite-Pipeline)
```

## Sprite-Pipeline: Blätter-Bild -> Atlas -> Rose

Die Rose kann statt aus SVG-Pfaden aus echten Blatt-Bildern gebaut werden. Die Pipeline
liegt unter `tools/` und läuft komplett lokal:

```bash
npm run fixture                                   # synthetisches Blättersheet (Ersatz für die KI-Ausgabe)
npm run atlas -- tools/fixtures/petal-sheet.png demo   # -> public/rose/demo/
npm run dev                                       # dann http://localhost:5173/?rose=demo
```

Schritte in `tools/build-atlas.ts`:

1. **Freistellen**: Hintergrundfarbe aus den Bildecken, Flood-Fill von den Rändern, Kanten entmischt (kein heller Saum).
2. **Blob-Detection**: zusammenhängende Flächen = einzelne Blätter; Krümel werden entfernt, verschmolzene Blätter werden gemeldet.
3. **Pivot und Ausrichtung** je Blatt. Primär über die helle, entsättigte Blattbasis (bei Rosenblättern sehr zuverlässig):
   Schwerpunkt der hellsten 4 % Pixel = Basis, Achse von dort durch den Blattschwerpunkt. Ohne Farbkontrast entscheidet ein
   Richtungs-Sweep über Form: Querschnittsbreite 10 und 20 % hinter beiden Enden (echte Basis bleibt schmal, eine Ecke nicht),
   Bonus, wenn die tiefste Einbuchtung des Umrisses (Kerbe) am Spitzenende liegt, plus Länge. Pivot liegt 3 % innerhalb der Basis.
4. **Packen** in einen Atlas, Farbvarianten rot / weiß / gelb per Farbton-Verschiebung, `petals.json` mit Ausschnitt,
   Pivot, Rotation, Länge und Breite. `atlas-debug.png` zeigt Pivot (Kreuz) und Achse (Linie) zur Kontrolle.

`tools/lib/fixture.test.ts` prüft Pivot und Winkel gegen die bekannten Werte des synthetischen Sheets,
`tools/lib/ai-fixture.test.ts` gegen die ChatGPT-Sheets unter `tools/fixtures/ai/` (alle Basen unten).
Atlanten: `rose1` (nur Außenblätter) und `rose2` (Außen- plus Innenblätter, beide Sheets in einem Atlas, Standard).
Mehrere Sheets: `npm run atlas -- a.png b.png name --scale 0.7`.

Im Frontend ist der Atlas `rose2` Standard. `?rose=<name>` wählt einen anderen unter `public/rose/<name>/`,
`?rose=svg` die gezeichnete SVG-Rose. Lädt ein Atlas nicht, fällt die Karte auf SVG zurück.
`--scale 0.7` beim Bauen verkleinert die Quellbilder; die Atlanten liegen bei rund 700 KB je Farbe
(Fotostrukturen komprimieren in PNG schlecht, WebP wäre der nächste Schritt).
`src/rose/sprite-model.ts` verteilt die Sprites auf die Ringe (kurze, schmale nach innen), der Renderer schneidet
jeden Ausschnitt per verschachteltem `<svg viewBox>` aus dem Atlasbild.

Neues Blättersheet ohne Key: Prompt aus `tools/generate-petals.ts` in ChatGPT eingeben, PNG speichern,
`npm run atlas -- <bild.png> <name>`. Mit Vercel-AI-Gateway-Key erzeugt `tools/generate-petals.ts` das Bild direkt (noch ungetestet).

## Schrägansicht und Neigung

Sprite-Rosen werden in Pseudo-3D gezeichnet (`src/rose/projection.ts`): Jedes Blatt ist eine flache Fläche
mit Pivot am Blütenboden, Neigung je Ring (innen fast senkrecht, außen aufgeklappt) und Breitenachse.
Eine orthografische Kamera mit Höhenwinkel und Azimut projiziert sie auf eine SVG-`matrix()`; die Blätter
werden pro Frame nach Tiefe sortiert. Standard ist eine Dreiviertel-Ansicht (48°).

Die Kamera folgt der Handy-Lage (`src/view/tilt.ts`, DeviceOrientation, auf iOS mit Erlaubnis-Abfrage
beim Start): flach gehalten Blick von oben, aufrecht von der Seite. Dreht man das Handy um die Hochachse
(Kompasswinkel), dreht sich die Rose entgegen, als stünde sie fest im Raum, volle 360°; Ausgangsrichtung ist
die Lage beim Start bzw. bei "Noch einmal". Seitliches Kippen lehnt die Ansicht leicht.
Am Desktop steuert die Maus über der Bühne. `window.__pusteblume.setView(höhe, azimut)` setzt sie direkt.
Die SVG-Rose bleibt eine reine Draufsicht.

## Effekte

- Licht und Schatten pro Blatt aus der Flächennormale (Deckkopie mit Multiply/Screen, kein Filter),
  Tiefenschärfe in drei Stufen (nur die hinterste mit Blur), innere Verschattung, Bewegungsunschärfe
  fliegender Blätter (vordefinierte Filter, Budget 8), Trudeln um die Längsachse (`src/rose/svg-renderer.ts`,
  `src/rose/projection.ts`, `src/rose/physics.ts`).
- Bühne (`src/view/ambience.ts`, `src/style.css`): Bodenschatten folgt der Kamera, Vignette, Atmen statt
  Pendeln, schwebende Pollen, Lichtpunkt beim Lösen eines Blatts, Aufglühen der Botschaft.
- Umgebung (`src/view/environment.ts`): ein equirektangulares Panorama (`public/env/room.jpg`, vorab
  weichgezeichnet) liegt als umlaufender Streifen hinter der Bühne und wird nach Kamerawinkel verschoben,
  Azimut horizontal umlaufend, Höhenwinkel vertikal. Neues Panorama aufbereiten:
  `node tools/make-env.cjs <panorama.png> public/env/room.jpg 1536 14` (Breite, Blur-Radius).
- SVG-Filter (Blur für Tiefenschärfe und Bewegungsunschärfe) sind standardmäßig aus, weil sie auf Handys
  flackern; `?fx=filters` schaltet sie ein. `?fx=noshade` schaltet die Schattierungskopien ab,
  `?fx=off` alle neuen Effekte inklusive Umgebung. Die Tiefensortierung
  hängt Blätter nur um, wenn die Kamera seit der letzten Sortierung ≥ 30° gewandert ist (`nosort`: nie,
  `sortalways`: jeden Frame), weil jedes Umhängen auf manchen Handys Blätter einen Frame lang ausblendet.

## Debug-Haken

In der Kartenansicht steht `window.__pusteblume` bereit: `blow(0..1)` löst einen Windstoß aus,
`progress` und `revealed` zeigen den Zustand, `micLevel` den aktuellen Pegel in dB.
