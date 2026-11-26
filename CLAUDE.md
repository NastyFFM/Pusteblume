# Pusteblume – Hinweise für Claude

Interaktive Valentins-/Grußkarte: Ein Bett aus Rosenblättern in einer Schachtel verdeckt eine Botschaft, der Empfänger
pustet ins Mikrofon, die Blätter fliegen weg. Alles rein im Frontend (Vite + TypeScript, kein Framework, kein Backend).
Gestaltung nach dem Figma-Design „Valentines App“ (Link in `docs/STATUS.md`).

**Zuerst lesen:** `docs/STATUS.md` (aktueller Stand, Entscheidungen, offene Punkte).

## Arbeitsweise
- Sprache: Deutsch (Code-Kommentare, Commits, Antworten).
- Produktions-Branch bei Vercel ist `main`; Arbeits-Branch der Session zusätzlich pushen:
  `git push origin <branch> <branch>:main`. Vercel deployt automatisch.
- Git-Identität: `git config user.email noreply@anthropic.com && git config user.name Claude`.
- Vor jedem Push: `npm run typecheck && npm test && npm run build`.
- Browser-Prüfung mit Playwright (global installiert, Chromium ohne Optionen), Dev-Server `npm run dev`
  auf http://localhost:5173, Viewport 393×852 wie der Figma-Rahmen. Debug-Haken auf den Pust-Bildschirmen
  (`/probieren`, Empfänger nach „Entdecke die Nachricht“): `window.__pusteblume` mit `begin()` (ohne Mikrofon starten),
  `blow(0..1)`, `progress`, `revealed`, `mode`.
- Test-Karte: `/v/<base64url von {"c":"rosa","q":2}>`, dann `button:has-text("Entdecke die Nachricht")` klicken
  (`text=` würde den Fließtext treffen). Ersteller-Flow: `/` → „Jetzt loslegen“ → … → „Fertig“ → `/versenden`.
- Flackern am Handy entsteht durch SVG-Filter und DOM-Umhängen pro Frame. Pro Frame nur transform/opacity setzen;
  neue Effekte am echten Handy gegenprüfen lassen. `?fx=off` schaltet Blatt-Schatten und Panel-Unschärfe ab.
- Figma lesen: MCP-Tools (`get_metadata`, `get_screenshot`, `get_design_context`), Assets per curl von `www.figma.com`
  (Netzwerk-Freigabe in der Cloud-Umgebung „pusteblume“). Neue Bild-Assets über `node tools/make-design-assets.cjs`.

## Struktur
- `shared/` Datenmodell (Farben, Zitate), Link-Kodierung (+Tests)
- `src/ui/` `kit.ts` Bausteine (Header, Stepper, Buttons, Panel, Zitatkarte, Deko) · `blow-stage.ts` Bühne mit Bett
  und Pust-Erkennung · `editor-view.ts` Ersteller-Schritte · `card-view.ts` Empfänger
- `src/petals/bed.ts` Blütenbett (Verteilung, DOM) · `src/rose/physics.ts` Pust-Physik · `src/blow/` Mikrofon, Gesten
- `src/rose/` (Modell, Projektion, SVG-Renderer) und `src/view/` sind die alte Rosen-Darstellung, ungenutzt, kompiliert
- `public/design/` Logo, Blätter/Cluster je Farbe (WebP), Papier · `public/fonts/` Inter, Instrument Serif
- `tools/make-design-assets.cjs` + `tools/design-src/` Asset-Pipeline · `tools/build-atlas.ts` alte Sprite-Pipeline
