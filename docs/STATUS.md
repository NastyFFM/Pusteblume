# Stand der Entwicklung (Übergabe)

Stand: 26.11.2026, `main` = Arbeits-Branch `ccr-05c34b09-hc5huy`, letzter Commit siehe `git log`.
Production bei Vercel: Projekt `pusteblume` (Team nastyffms-projects), vermutlich https://pusteblume.vercel.app.

## Was fertig ist
1. **Editor** (`/`): Farbe (rot/weiß/gelb), Botschaft, Absender, Blütenform (Blätter 5–110, Öffnung
   geschlossen→offen, Größe 30–140 %, Drehung), Live-Vorschau, Link erstellen/kopieren/teilen.
   Entwurf überlebt Vorschau/Zurück/Neuladen (sessionStorage).
2. **Karte** (`/v/<kodiert>`): Karte steckt komplett im Link (base64url-JSON, `shared/link.ts`), kein Server.
   Intro-Overlay → Mikrofon (Web Audio, kalibrierter Grundpegel) oder Wischen/Leertaste. Pust-Intensität
   steuert Freigabe-Tempo und Abflug. Botschaft erscheint, wenn das letzte Blatt fällt; „Noch einmal“.
3. **Rose**: Sprite-Atlas aus zwei ChatGPT-Sheets (`public/rose/rose2`, Standard; `rose1` nur Außenblätter;
   `demo` synthetisch). `?rose=svg` = prozedurale SVG-Rose (Draufsicht). Fehlender Atlas → SVG-Rückfall.
4. **Pipeline** `tools/build-atlas.ts`: Freistellen, Blob-Detection, Pivot über helle Blattbasis
   (Rückfall Formanalyse), Atlas packen, Farbvarianten, `--scale`. Tests gegen Fixture und beide KI-Sheets.
   Neues Sheet: Prompt in `tools/generate-petals.ts`, dann `npm run atlas -- a.png b.png name --scale 0.7`.
5. **Pseudo-3D** (`src/rose/projection.ts`): Blätter als Flächen im Raum, Dreiviertel-Kamera (48°),
   Tiefensortierung. Kamera folgt Handy-Neigung (oben/Seite) und Kompassdrehung (360°), Maus am Desktop.
6. **Stiel + Kelchblätter** statt Blätter; Umgebung = weichgezeichnetes Panorama (`public/env/room.jpg`,
   `tools/make-env.cjs`), wandert mit der Kamera.
7. **Effekte**: Licht/Schatten pro Blatt (Blend-Kopien), Helligkeits-Tiefenstufen, Innenschatten,
   Bodenschatten, Vignette, Atmen, Pollen, Glow beim Lösen/Öffnen, Trudeln. SVG-Filter (Blur) sind
   **standardmäßig aus** (`?fx=filters` an), Tiefensortierung nur alle 30° (`?fx=nosort`/`sortalways`),
   `?fx=noshade`, `?fx=off`. Grund: Flackern auf dem Handy des Kunden (Filter und DOM-Umhängen).

## Entscheidungen
- Kein Backend (Kurzlinks mit Upstash gab es bis Commit `e69aa2e`, entfernt wegen Function-Crash auf Vercel;
  Ursache war tsconfig/ESM, inzwischen bekannt → bei Bedarf reaktivierbar).
- Kein WebGL; alles SVG/CSS, GPU-freundlich (Transforms/Opacity), keine Filter pro Frame.
- Atlanten als PNG (~700 KB je Farbe); WebP wäre der nächste Schritt für die Ladezeit.

## Offene Punkte / Ideen
- Am echten Handy nach jedem Effekt-Umbau gegenprüfen (Flackern). iOS: mix-blend-mode auf SVG-image ungetestet.
- Bewegungsunschärfe ohne Filter (Nachzieh-Kopie) nachbauen, falls gewünscht.
- Pust-Empfindlichkeit und Neigungs-Empfindlichkeit am Gerät feinjustieren (`src/blow/detector.ts`, `src/view/tilt.ts`).
- Drittes Blätter-Sheet (Innenblätter schräg von oben) würde die Mitte dichter machen.
- Produktvision Blumenladen: Mandanten pro Laden (Logo/Farben/Domain), Gutschein mit Code + Einlösen an der
  Kasse, QR-Kärtchen am Strauß, Statistik; dafür Backend (Vercel + Postgres/Supabase) nötig. Priorität nach Pilotladen.

## Nächster Schritt (gewünscht)
Figma anbinden: Connector unter https://claude.ai/customize/connectors verbinden, neue Session starten,
dann Layouts (Editor, Karte, Gutschein-Bildschirm) aus Figma übernehmen.

## Nützliche Skripte (Scratchpad der alten Session, nicht im Repo)
Playwright-Abläufe für Editor→Karte→Pusten, Shape-Extreme, Kamerawinkel, Kompassdrehung; leicht aus den
Debug-Haken neu zu schreiben (siehe CLAUDE.md).
