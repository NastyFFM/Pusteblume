# Stand der Entwicklung (Übergabe)

Stand: 26.11.2026, `main` = Arbeits-Branch `ccr-a20fd12f-atnpsc`, letzter Commit siehe `git log`.
Production bei Vercel: Projekt `pusteblume` (Team nastyffms-projects), vermutlich https://pusteblume.vercel.app.

## Umbau nach Figma („Valentines App“)
Figma-Datei (Kopie mit Bearbeitungsrecht, nur so liest der Figma-MCP-Server):
https://www.figma.com/design/98e6V6PYJrPQxvCkUnI628/Valentines-App--Copy- (Seite „Layout Sketch“, Abschnitt „Version 1 – Schachtel mit Botschaft“).
Das Original (`9zisSSkNkxXd1enrPCqOzc`) gehört einem anderen Team; „Anyone can edit“ reicht dem MCP nicht.

Die App folgt jetzt dem Design: statt einer Rose liegt ein **Bett aus losen Rosenblättern in einer Schachtel** über einer
Zitatkarte. Zwei Flows, alle Bildschirme 1:1 aus dem Figma:
- **Ersteller** (`/` → `/farbe` → `/nachricht` → `/probieren` → `/versenden`): Start mit Logo-Kachel, Farbe (5 Kreise:
  Rot, Weiß, Rosa, Beige, Grau), Nachricht (5 Zitat-Vorlagen, Autor), Probieren (selbst pusten, dann „Fertig“),
  Versenden („Link kopieren“ + Teilen-Menü, „Neue Nachricht erstellen“). Entwurf in sessionStorage.
- **Empfänger** (`/v/<kodiert>`): „Jemand hat an dich gedacht!“ → Pusten (Panel mit Fortschritt) → Botschaft frei →
  „Wunderschön!“ mit „Eigene Nachricht erstellen“.

## Was fertig ist
1. **Design-Assets** (`public/design`): Logo (SVG), Blätter a/b/c und Blätterhaufen je Farbe als WebP (eingefärbt per
   `tools/make-design-assets.cjs`, Quellen in `tools/design-src`), Papierstruktur. Schriften Inter (500/700) und
   Instrument Serif selbst gehostet (`public/fonts`). Icons als Inline-SVG in `src/ui/kit.ts`.
2. **Datenmodell** (`shared/card.ts`): `CARD_COLORS` (red/white/rosa/beige/grey), `QUOTES` (5 gemeinfreie Zitate),
   Link-Feld `q` (Vorlagen-Index, Link ~30 Zeichen). Alte Links (`m`, `f`, `s`, Farbe `yellow`) werden weiter gelesen.
3. **Blütenbett** (`src/petals/bed.ts`): 108 Blatt-Sprites in zwei Lagen auf Jitter-Raster, Blätter in der Mitte lösen sich
   zuletzt. Physik unverändert `RosePhysics` (nimmt jetzt `Pick<RoseModel, "petals">`). Pro Frame nur transform/opacity.
4. **Bühne** (`src/ui/blow-stage.ts`): Zitatkarte (Papier + Instrument Serif) → Tiefenkanten der Schachtel (CSS-Verläufe)
   → Bett. Mikrofon aus der Nutzergeste, Rückfall Wischen, Leertaste; Handy-Neigung/Maus = leichte Parallaxe des Betts.
5. **Bildschirm-Bausteine** (`src/ui/kit.ts`): Header, Stepper, Buttons, Panel (Backdrop-Blur, über `?fx=off` abschaltbar),
   Meter, Logo-Kachel, Zitatkarte, Deko-Blätter (Lagen aus den Figma-Insets), Farbkreise.

## Entscheidungen
- Rosen-Code (`src/rose/model.ts`, `svg-renderer.ts`, `projection.ts`, `sprite-model.ts`, `src/view/*`, Atlas-Pipeline)
  bleibt im Repo und kompiliert, wird aber von der UI nicht mehr benutzt. Die Atlanten unter `public/rose` und
  `public/env/room.jpg` werden noch mit deployt (nicht geladen). Bei Bedarf entfernen oder als `?mode=rose` reaktivieren.
- Nur Vorlagen-Zitate wie im Design; freier Text ist im Modell weiterhin erlaubt (alte Links), hat aber keine UI.
- Das Logo im Design ist die Marke des Kunden (Pandora); Mandantenfähigkeit (Logo/Farben je Laden) steht weiter aus.
- Kein Backend, kein WebGL, keine SVG-Filter. Einziger Filter: statischer drop-shadow je Blatt (`?fx=off` schaltet ab).

## Offene Punkte / Ideen
- **Am echten Handy prüfen**: Flackern (108 Bilder mit drop-shadow, Panel mit backdrop-filter), Mikrofon-Empfindlichkeit,
  Parallaxe-Stärke (`PARALLAX` in `blow-stage.ts`). Bei Problemen zuerst `?fx=off` testen.
- Figma-Feinheiten: Deko-Blätter sind überall Variante a; Figma nutzt pro Bildschirm leicht andere Lagen. Rosenbett im
  Design ist ein Foto-Cluster in 10 Instanzen; wir decken mit Einzel-Sprites ab (fliegen weg) plus Cluster in zwei Ecken.
- Tiefeneindruck der Schachtel („Device = Schachtel“, Figma-Notiz): bisher nur die Kanten und die Parallaxe.
- Zitate ggf. mit dem Kunden abstimmen; die fünf Texte stehen in `shared/card.ts` (`QUOTES`).
- Produktvision Blumenladen (Mandanten, Gutschein, QR, Statistik) wie bisher: braucht Backend, Priorität nach Pilotladen.

## Prüfen
`npm run typecheck && npm test && npm run build`, Screens mit Playwright (siehe CLAUDE.md). Letzte Prüfung: alle
Bildschirme 393×852 ohne Konsolenfehler, Pusten per Debug-Haken legt die Botschaft frei.
