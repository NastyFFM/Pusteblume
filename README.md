# Pusteblume 🌹

Interaktive, mobile Grußkarten: Eine Rose verdeckt eine persönliche Botschaft.
Der Empfänger pustet ins Mikrofon des Handys, die Blütenblätter fliegen davon
(je kräftiger, desto wilder) und die Botschaft liegt frei.

Die App läuft rein im Frontend, ohne Server und ohne Datenbank. Production-Branch ist `main`.

## Was drin ist

- **Editor** (`/`): Rosenfarbe (rot, weiß, gelb), Botschaft, Absender, Vorschau, Link erzeugen, kopieren oder teilen.
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
3. **Pivot und Ausrichtung** je Blatt: Die Kerbe an der Spitze ist die tiefste Einbuchtung gegenüber der konvexen Hülle.
   Achse = Schwerpunkt -> Kerbe, Basis gegenüber, Pivot 3 % innerhalb der Basis. Ohne Kerbe entscheidet ein Richtungs-Sweep
   über die Fläche der Endzonen (spitze Basis = wenig Fläche).
4. **Packen** in einen Atlas, Farbvarianten rot / weiß / gelb per Farbton-Verschiebung, `petals.json` mit Ausschnitt,
   Pivot, Rotation, Länge und Breite. `atlas-debug.png` zeigt Pivot (Kreuz) und Achse (Linie) zur Kontrolle.

`tools/lib/fixture.test.ts` prüft Pivot und Winkel gegen die bekannten Werte des synthetischen Sheets.

Im Frontend wählt `?rose=<name>` den Atlas unter `public/rose/<name>/`. Ohne Parameter bleibt die SVG-Rose.
`src/rose/sprite-model.ts` verteilt die Sprites auf die Ringe (kurze, schmale nach innen), der Renderer schneidet
jeden Ausschnitt per verschachteltem `<svg viewBox>` aus dem Atlasbild.

**Ausstehend (braucht den Vercel-AI-Gateway-Key):** `tools/generate-petals.ts` erzeugt das Blättersheet per Bildmodell.
Der Aufruf ist noch ungetestet; danach einfach `npm run atlas -- <bild.png> <name>`.

## Debug-Haken

In der Kartenansicht steht `window.__pusteblume` bereit: `blow(0..1)` löst einen Windstoß aus,
`progress` und `revealed` zeigen den Zustand, `micLevel` den aktuellen Pegel in dB.
