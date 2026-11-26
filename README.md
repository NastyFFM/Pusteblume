# Pusteblume 🌹

Interaktive, mobile Grußkarten: Eine Rose verdeckt eine persönliche Botschaft.
Der Empfänger pustet ins Mikrofon des Handys, die Blütenblätter fliegen davon
(je kräftiger, desto wilder) und die Botschaft liegt frei.

Die App läuft rein im Frontend, ohne Server und ohne Datenbank. Production-Branch ist `main`.

## Was drin ist

- **Editor** (`/`): Rosenfarbe (rot, weiß, gelb), Botschaft, Absender, Blütenform (Blattzahl, Öffnung, Breite, Drehung)
  mit Live-Vorschau, Link erzeugen, kopieren oder teilen. Die Form wandert mit in den Link (`shared/card.ts`, `RoseShape`),
  Standardwerte werden weggelassen.
- **Karte** (`/v/<kodierte Karte>`): Rose über der Botschaft, Pust-Erkennung per Web Audio API,
  Fallback per Wischen (ohne Mikrofon) und Leertaste (Desktop).
- **Links**: Die Karte steckt vollständig im Link (base64url-kodiertes JSON). Nichts wird gespeichert.
- **Rose**: aktuell prozedurales SVG (Blütenblatt-Pfade in Ringen, Herzscheibe, Blätter in eigener Ebene hinter der Botschaft).

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
shared/         Datenmodell, Validierung, Link-Kodierung (+ Tests)
src/rose/       Rosenmodell (model.ts), SVG-Renderer, Pust-Physik
src/blow/       Mikrofon-Erkennung und Gesten-Fallback
src/ui/         Editor- und Kartenansicht
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

Die Kamera folgt der Handy-Neigung (`src/view/tilt.ts`, DeviceOrientation, auf iOS mit Erlaubnis-Abfrage
beim Start): flach gehalten Blick von oben, aufrecht von der Seite, seitliches Kippen dreht die Rose.
Am Desktop steuert die Maus über der Bühne. `window.__pusteblume.setView(höhe, azimut)` setzt sie direkt.
Die SVG-Rose bleibt eine reine Draufsicht.

## Debug-Haken

In der Kartenansicht steht `window.__pusteblume` bereit: `blow(0..1)` löst einen Windstoß aus,
`progress` und `revealed` zeigen den Zustand, `micLevel` den aktuellen Pegel in dB.
