# CLAUDE.md

Leitfaden für Claude Code in diesem Repository. Ausführliche Doku für Menschen steht in `README.md`.

## Projekt

Interaktive Anatomie-Lernanwendung (Deutsch) mit 3D-Atlas, Quiz, Beschriftungs-Quiz,
Karteikarten (SM-2), Fortschritt und Notizen. Läuft als Web-App (GitHub Pages / Docker+Nginx)
und als Windows-Desktop-App (Electron + NSIS-Installer).

- **Stack:** Vite 5, TypeScript (strict), Three.js 0.165 (GLTFLoader, DRACOLoader, OrbitControls),
  `idb` (IndexedDB), Fuse.js. Kein Framework – UI ist reines DOM/TS.
- **Daten:** 3D-Modelle aus Z-Anatomy (CC BY-SA 4.0). Code steht unter MIT.
- **Remote:** `github.com/Seven64/anatomie-lernseite`, Hauptbranch `main`.

## Befehle

```bash
npm install
npm run dev            # Vite-Dev-Server, http://localhost:5173
npm run build          # tsc (Typecheck) + vite build → dist/
npm run preview        # dist/ lokal ausliefern
npm run desktop:dir    # Electron-App ungepackt nach release/
npm run desktop:win    # Windows-NSIS-Installer nach release/
npm run data:export    # prüft structures.json gegen public/models
npm run test:blender   # Blender-Export (braucht Blender 4.x + _source/)
docker compose up -d   # Production auf :8080
```

Es gibt **keine automatisierten Tests und keinen Linter**. `npm run build` ist der
einzige Check (Typecheck mit `noUnusedLocals`/`noUnusedParameters`) – nach Änderungen
immer ausführen.

## Struktur

```
src/
  main.ts, App.ts          Einstieg & Modus-Umschaltung
  types/index.ts           zentrale Interfaces (Structure, Progress, Settings …)
  styles/main.css          Design-System (CSS-Variablen, Hell/Dunkel)
  utils/
    DataManager.ts         IndexedDB: Strukturen, Fortschritt, Notizen
    SettingsManager.ts     localStorage + Subscriptions
    UIManager.ts           Layout, Sidebar, Info-Panel, Modals, Toasts, „Über“-Tab
    three.ts               gemeinsame Three.js-Helfer
  modules/                 je ein Lernmodus: Atlas, LabelQuiz, Quiz, Flashcard, Progress, Notes
public/
  models/<system>/<system>.glb   Draco-komprimierte Modelle (9 Systeme)
  structures.json                Strukturmetadaten (~1,7 MB)
  vendor/draco/                  lokaler Draco-Decoder (kein CDN)
  licenses/                      Lizenztexte für die App
desktop/main.cjs           Electron-Hauptprozess mit lokalem Static-Server (127.0.0.1)
installer/license_de.html  Lizenzseite im NSIS-Installer
build/icon.ico             App-/Installer-Icon
scripts/
  export-data.js           Daten-Check (Node)
  blender/                 Blender-Python: export_gltf.py + Debug-Helfer
release/                   Build-Ausgaben (Installer, Web-ZIPs) – gitignored
_source/                   Z-Anatomy-Quelldaten (Startup.blend) – gitignored
```

## Wichtige Zusammenhänge

- **structures.json-Version:** `DataManager.ts` hat `STRUCTURES_VERSION`. Wird
  `public/structures.json` neu erzeugt, muss deren `version` dazu passen, sonst lädt die
  App die Daten nicht neu bzw. wirft einen Fehler. Bei Änderungen beide anheben.
- **Relative Pfade:** `vite.config.ts` nutzt `base: './'`, Fetches laufen über `./…`.
  Das ist nötig für GitHub Pages (Unterpfad) und Electron. Keine absoluten `/`-Pfade einführen.
- **Blender-Skripte** werden aus dem Projekt-Root gestartet; Pfade darin
  (`_source/…`, `public/models`) sind relativ zum Root. Die Debug-Skripte in
  `scripts/blender/` enthalten noch Windows-Pfade (`_source\Z-Anatomy\…`).
- **Electron** packt nur `dist/`, `desktop/` und `package.json` (siehe `build.files`
  in `package.json`). Vor `desktop:*` läuft automatisch `npm run build`.
- **Deploy:** Push auf `main` → `.github/workflows/deploy-pages.yml` baut und veröffentlicht
  auf GitHub Pages.

## Konventionen

- UI-Texte und Doku auf **Deutsch** (mit korrekten Umlauten); Code-Bezeichner Englisch.
- TypeScript strict, keine `any`. Import-Alias `@/` → `src/`.
- Commit-Messages im Conventional-Commits-Stil (`feat:`, `fix:`, …).
- Lizenzhinweise (CC BY-SA 4.0, Quellen) müssen in App („Über“-Tab), Installer und
  README erhalten bleiben.
- Keine großen Binärdateien committen (Installer, ZIPs gehören nach `release/` und in
  GitHub-Releases). Keine Zertifikate (`*.pfx`, `CSC_*`) ins Repo.

## Hinweise

- `scripts/export-data.js` ist reines ESM-JavaScript (Typen nur als JSDoc) – keine
  TypeScript-Syntax einführen, es wird direkt mit `node` ausgeführt.
- Docker: Vite kopiert `public/` nach `dist/`; das Image liefert nur `dist/` aus.
  Kein Volume über `/usr/share/nginx/html` mounten, sonst wird die gebaute App überdeckt.
- `nginx.conf` darf keine `proxy_pass`-Ziele auf nicht existierende Hosts enthalten –
  nginx startet sonst nicht.
- `add_header` in einem `location`-Block hebt die Security-Header der `server`-Ebene
  für diesen Block auf (nginx-Vererbung).
