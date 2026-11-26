# Pusteblume – Hinweise für Claude

Interaktive Grußkarte für Blumenläden: Eine Rose verdeckt eine Botschaft, der Empfänger pustet ins
Mikrofon, die Blätter fliegen weg. Alles rein im Frontend (Vite + TypeScript, kein Framework, kein Backend).

**Zuerst lesen:** `docs/STATUS.md` (aktueller Stand, Entscheidungen, offene Punkte, nächste Schritte).

## Arbeitsweise
- Sprache: Deutsch (Code-Kommentare, Commits, Antworten).
- Produktions-Branch bei Vercel ist `main`; Arbeits-Branch der Session zusätzlich pushen:
  `git push origin <branch> <branch>:main`. Vercel deployt automatisch.
- Git-Identität: `git config user.email noreply@anthropic.com && git config user.name Claude`.
- Vor jedem Push: `npm run typecheck && npm test && npm run build`.
- Browser-Prüfung mit Playwright (global installiert, Chromium ohne Optionen), Dev-Server `npm run dev`
  auf http://localhost:5173. Debug-Haken in der Kartenansicht: `window.__pusteblume`
  (`blow(0..1)`, `setView(höhe, azimut)`, `progress`, `revealed`, `begin("gesture")`).
- Test-Karte: `/v/<base64url von {"c":"red","m":"Text"}>`, danach `.overlay .btn--ghost` klicken.
- Flackern am Handy entsteht durch SVG-Filter und durch DOM-Umhängen pro Frame. Beides vermeiden
  (siehe `FX` in `src/rose/svg-renderer.ts`). Neue Effekte immer am echten Handy gegenprüfen lassen.

## Struktur
- `shared/` Datenmodell, Link-Kodierung (+Tests) · `src/rose/` Modell, Projektion, Renderer, Physik
- `src/view/` Kamera (Neigung/Kompass), Umgebung, Bühneneffekte · `src/ui/` Editor, Karte
- `tools/` Sprite-Atlas-Pipeline, Fixtures, Panorama-Aufbereitung · `public/rose/`, `public/env/` Assets
