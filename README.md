# Pusteblume 🌹

Interaktive, mobile Grußkarten: Eine Rose verdeckt eine persönliche Botschaft.
Der Empfänger pustet ins Mikrofon des Handys, die Blütenblätter fliegen davon
(je kräftiger, desto wilder) und die Botschaft liegt frei.

## Was drin ist

- **Editor** (`/`): Rosenfarbe (rot, weiß, gelb), Botschaft, Absender, Vorschau, Kurzlink erzeugen, kopieren oder teilen.
- **Karte** (`/c/:id`): Rose über der Botschaft, Pust-Erkennung per Web Audio API, Fallback per Wischen (ohne Mikrofon) und Leertaste (Desktop).
- **Links**: Standardmäßig steckt die Karte komplett im Link (`/v/<kodierte Karte>`), es wird kein Backend gebraucht.
  Kurzlinks über `POST /api/cards` (`/c/<id>`) lassen sich mit der Build-Variable `VITE_SHORT_LINKS=true` einschalten.
- **Rose**: aktuell prozedurales SVG (Blütenblatt-Pfade in Ringen, Herzscheibe, Blätter in eigener Ebene hinter der Botschaft).

## Entwicklung

```bash
npm install
npm run dev        # http://localhost:5173, API läuft im Vite-Dev-Server mit Datei-Store (.data/cards.json)
npm test           # Vitest (API-Handler)
npm run typecheck  # Client + Server
npm run build
```

Das Mikrofon funktioniert im Browser nur über HTTPS oder `localhost`. Zum Testen am Handy
im lokalen Netz daher einen Tunnel (z. B. `vercel dev` + `ngrok`) oder direkt ein Vercel-Preview-Deployment nutzen.

## Deployment (Vercel)

Ohne weitere Einstellungen läuft die App rein statisch mit Frontend-Links. Für Kurzlinks:

0. `VITE_SHORT_LINKS=true` als Environment-Variable setzen. `/api/health` zeigt, ob Functions laufen und Redis erkannt wird.
1. Projekt mit Vercel verbinden (Framework: Vite, `vercel.json` liegt bei).
2. Im Vercel Marketplace **Upstash for Redis** zum Projekt hinzufügen. Das setzt `KV_REST_API_URL` und `KV_REST_API_TOKEN`
   automatisch (alternativ `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN`). Karten werden mit einem Jahr TTL gespeichert (Ablauf nach einem Jahr).
3. Optional `PUBLIC_BASE_URL` setzen, wenn Kurzlinks auf eine eigene Domain zeigen sollen.

Ohne Redis-Variablen antwortet die API auf Vercel mit einem Hinweis-Fehler; lokal wird `.data/cards.json` benutzt.

## Projektstruktur

```
api/            Vercel Functions (dünne Adapter)
server/         Handler, Store (Redis/Datei), ID-Erzeugung, Tests
shared/         Datenmodell + Validierung (Client und Server)
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
