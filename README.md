# Pusteblume 🌹

Interaktive, mobile Grußkarten: Eine Rose verdeckt eine persönliche Botschaft.
Der Empfänger pustet ins Mikrofon des Handys, die Blütenblätter fliegen davon
(je kräftiger, desto wilder) und die Botschaft liegt frei.

Die App läuft rein im Frontend, ohne Server und ohne Datenbank.

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

## Schritt 2: KI-generierte Rose mit Sprite-Atlas

Das Modell in `src/rose/model.ts` ist dafür vorbereitet: `PetalShape` kennt neben `path`
bereits die Variante `sprite` (Atlas-URL, Ausschnitt, Pivot). Physik und Interaktion arbeiten nur
mit Pivot, Winkel, Radius und Größe und bleiben unverändert. Geplante Pipeline:

1. Rosenbild per Vercel AI Gateway erzeugen.
2. Einzelblüten freistellen und in einen Sprite-Atlas mit transparentem Hintergrund packen.
3. Blob-Detection pro Sprite, um den Pivot zu bestimmen (die Blüten liegen nicht zentriert im Sprite-Rechteck).
4. Ergebnis als `Petal[]` mit `shape.kind === "sprite"` laden; der Renderer zeichnet `<image>`-Ausschnitte.

## Debug-Haken

In der Kartenansicht steht `window.__pusteblume` bereit: `blow(0..1)` löst einen Windstoß aus,
`progress` und `revealed` zeigen den Zustand, `micLevel` den aktuellen Pegel in dB.
