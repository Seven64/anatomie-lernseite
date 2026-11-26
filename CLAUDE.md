# CLAUDE.md

Leitfaden für Claude Code in diesem Repository. Ausführliche Doku für Menschen steht in `README.md`.

## Projekt

Interaktive Anatomie-Lernanwendung (Deutsch) mit 3D-Atlas, Quiz, Beschriftungs-Quiz,
Karteikarten (SM-2), Fortschritt und Notizen. Läuft als Web-App (GitHub Pages / Docker+Nginx)
und als Windows-Desktop-App (Electron + NSIS-Installer).

- **Stack:** Vite 5, TypeScript (strict), Three.js 0.165 (GLTFLoader, DRACOLoader, OrbitControls),
  three-mesh-bvh (Raycasting), `idb` (IndexedDB), Vitest. Kein Framework – UI ist reines DOM/TS.
- **Daten:** 3D-Modelle aus Z-Anatomy (CC BY-SA 4.0). Code steht unter MIT.
- **Remote:** `github.com/Seven64/anatomie-lernseite`, Hauptbranch `main`.

## Befehle

```bash
npm install
npm run dev            # Vite-Dev-Server, http://localhost:5173
npm run build          # tsc (Typecheck) + vite build → dist/
npm run preview        # dist/ lokal ausliefern
npm run typecheck      # nur tsc (src + tests)
npm test               # Vitest-Unit-Tests (tests/)
npm run check          # typecheck + test + data:export (= CI)
npm run icon           # build/icon.ico aus public/logo.svg (rsvg-convert + magick)
npm run desktop:dir    # Electron-App ungepackt nach release/
npm run desktop:win    # Windows-NSIS-Installer nach release/
npm run data:export    # prüft structures.json gegen public/models
npm run test:blender   # Blender-Export (braucht Blender 4.x + _source/)
docker compose up -d   # Production auf :8080
```

Kein Linter. Nach Änderungen immer `npm run check` und `npm run build` ausführen
(Typecheck mit `noUnusedLocals`/`noUnusedParameters`, Vitest, Daten-Check).
Reine Logik (ohne DOM/Three.js) gehört in eigene Module mit Tests in `tests/`.
Dateien unter ~400 Zeilen halten.

## Struktur

```
src/
  main.ts, App.ts          Einstieg & Modus-Umschaltung
  types/index.ts           zentrale Interfaces (Structure, Progress, Settings …)
  styles/main.css          importiert Teildateien (base, layout, tree, controls, quiz, …, atlas)
  ui/                      DOM-Bausteine: layout, StructureTree, CuttingControls, LayerControls,
                           InfoPanel, SettingsModal, feedback, constants, treeModel (rein)
  utils/
    DataManager.ts         IndexedDB: Strukturen, Fortschritt, Notizen, Cache
    SettingsManager.ts     localStorage + Subscriptions
    UIManager.ts           Fassade über src/ui/ (API für die Modi)
    PreviewViewer.ts       3D-Vorschau für Quiz-Modi (Modell-Cache)
    three.ts               Three.js-Helfer, aktiviert BVH-Raycasting global
    sm2.ts, text.ts        reine Logik (SM-2, Escaping, Fuzzy-Match)
  modules/                 je ein Lernmodus: Atlas, LabelQuiz, Quiz, Flashcard, Progress, Notes
    atlas/                 AtlasScene, ModelRegistry, CuttingPlanes, MuscleLayers, ViewCube,
                           cuttingMath + layerAssignment (rein, getestet)
tests/                     Vitest
docs/                      ARCHITECTURE.md, RELEASE.md
public/
  models/<system>/<system>.glb   Draco-komprimierte Modelle (9 Systeme)
  structures.json                Strukturmetadaten (~1,7 MB)
  vendor/draco/                  lokaler Draco-Decoder (kein CDN)
  licenses/                      Lizenztexte für die App
desktop/main.cjs           Electron-Hauptprozess mit lokalem Static-Server (127.0.0.1)
installer/license_de.html  Lizenzseite im NSIS-Installer
build/icon.ico             App-/Installer-Icon (aus public/logo.svg erzeugt)
nginx.conf                 nginx-Server für das Docker-Image
nginx-security-headers.conf  Security-Header/CSP (in nginx.conf eingebunden)
scripts/
  export-data.js           Daten-Check (Node)
  make-icon.sh             Logo → icon.ico
  blender/                 Blender-Python: export_gltf.py + Debug-Helfer
.github/workflows/         ci.yml, release.yml (Tag v*), deploy-pages.yml
release/                   Build-Ausgaben (Installer, Web-ZIPs) – gitignored
_source/                   Z-Anatomy-Quelldaten (Startup.blend) – gitignored
```

## Wichtige Zusammenhänge

- **structures.json-Version:** `DataManager.ts` hat `STRUCTURES_VERSION`. Wird
  `public/structures.json` neu erzeugt, muss deren `version` dazu passen, sonst lädt die
  App die Daten nicht neu bzw. wirft einen Fehler. Bei Änderungen beide anheben
  (`tests/structuresData.test.ts` prüft das).
- **Knotennamen:** GLTFLoader bereinigt `object.name`; Originalnamen über `getNodeName()` /
  `findNodesByName()` (`utils/three.ts`) auflösen, nie über `getObjectByName()`.
- **Atlas-Sichtbarkeit:** Nur `AtlasMode.refresh()` setzt `mesh.visible`/`mesh.material`;
  Zustand in `systemVisibility`, `hiddenIds`, `peel`, `selectedId` ändern und dann `refresh()`.
- **Muskelschichten:** werden im IndexedDB-Store `cache` gecacht. Algorithmus geändert →
  `LAYER_ALGORITHM_VERSION` in `MuscleLayers.ts` anheben.
- **Relative Pfade:** `vite.config.ts` nutzt `base: './'`, Fetches laufen über `./…`.
  Das ist nötig für GitHub Pages (Unterpfad) und Electron. Keine absoluten `/`-Pfade einführen.
- **Blender-Skripte** werden aus dem Projekt-Root gestartet; Pfade darin
  (`_source/…`, `public/models`) sind relativ zum Root. Die Debug-Skripte in
  `scripts/blender/` enthalten noch Windows-Pfade (`_source\Z-Anatomy\…`).
- **Electron** packt nur `dist/`, `desktop/` und `package.json` (siehe `build.files`
  in `package.json`). Vor `desktop:*` läuft automatisch `npm run build`.
- **Deploy:** Push auf `main` → `deploy-pages.yml` (nach `npm run check`) auf GitHub Pages.
  Release: Version in `package.json` anheben und nach `main` mergen → `release.yml` erkennt
  die neue Version, baut Windows-Installer + Web-ZIP und legt Tag `vX.Y.Z` + Release an
  (siehe `docs/RELEASE.md`). `RELEASE_NOTES.md` muss die Version nennen.
- **Version:** kommt aus `package.json` (`__APP_VERSION__` via `define` in `vite.config.ts`).

## Konventionen

- UI-Texte und Doku auf **Deutsch** (mit korrekten Umlauten); Code-Bezeichner Englisch.
- TypeScript strict, keine `any`. Import-Alias `@/` → `src/`.
- Commit-Messages im Conventional-Commits-Stil (`feat:`, `fix:`, …).
- Lizenzhinweise (CC BY-SA 4.0, Quellen) müssen in App („Über“-Tab, `src/ui/layout.ts`),
  Installer und README erhalten bleiben. Neue Bibliotheken in `public/licenses/` ergänzen.
- Nutzerdaten/Strukturnamen in HTML-Strings immer mit `escapeHtml()` einsetzen.
- Keine großen Binärdateien committen (Installer, ZIPs gehören nach `release/` und in
  GitHub-Releases). Keine Zertifikate (`*.pfx`, `CSC_*`) ins Repo.

## Hinweise

- `scripts/export-data.js` ist reines ESM-JavaScript (Typen nur als JSDoc) – keine
  TypeScript-Syntax einführen, es wird direkt mit `node` ausgeführt.
- Docker: Vite kopiert `public/` nach `dist/`; das Image liefert nur `dist/` aus.
  Kein Volume über `/usr/share/nginx/html` mounten, sonst wird die gebaute App überdeckt.
- `nginx.conf` darf keine `proxy_pass`-Ziele auf nicht existierende Hosts enthalten –
  nginx startet sonst nicht.
- Security-Header stehen in `nginx-security-headers.conf` und werden per `include` in
  `server` **und** jedem `location`-Block mit eigenem `add_header` eingebunden
  (ein `add_header` im `location` hebt sonst alle geerbten Header auf).
- Die CSP erlaubt nur `'self'` plus `'wasm-unsafe-eval'` (Draco-Decoder im Blob-Worker).
  Neue externe Ressourcen (CDN, Fonts) brauchen eine CSP-Anpassung.
- `.dockerignore` hält `node_modules/`, `release/` und `_source/` aus dem Build-Kontext.
