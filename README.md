# Anatomie Lernseite

[![CI](https://github.com/Seven64/anatomie-lernseite/actions/workflows/ci.yml/badge.svg)](https://github.com/Seven64/anatomie-lernseite/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/Seven64/anatomie-lernseite)](https://github.com/Seven64/anatomie-lernseite/releases/latest)

Interaktive Web-Anwendung zum Erlernen der menschlichen Anatomie mit 3D-Modellen, Quiz-Modi, Karteikarten (Spaced Repetition) und Fortschrittsverfolgung.

> **Datenquelle**: 3D-Modelle von [Z-Anatomy](https://github.com/Z-Anatomy/Models-of-human-anatomy) (CC BY-SA 4.0)

## 🌐 Webversion & Download

- **Webversion:** [Anatomie Lernseite auf GitHub Pages](https://Seven64.github.io/anatomie-lernseite/)
- **Windows-Installer:** [Neueste GitHub-Release herunterladen](https://github.com/Seven64/anatomie-lernseite/releases/latest)
- Die Releases enthalten zusätzlich ein ZIP der gebauten Webversion zum eigenen Hosting.
- Die Webversion wird nach Änderungen am `main`-Branch automatisch über GitHub Actions veröffentlicht.

## 🌟 Features

| Modus | Beschreibung |
|-------|-------------|
| **Atlas** | 3D-Viewer mit Hover-Bezeichnungen, nach Körperregionen und anatomischen Elternstrukturen unterteiltem Strukturbaum, gruppierten Gewebe-Layern (Muskulatur, Sehnen, Arterien, Venen, Herz), originalen Blender-Materialfarben, Isolieren/Ausblenden und Deckkraft je System |
| **Beschriftungs-Quiz** | Markierte Struktur benennen – Freitext mit Fuzzy-Matching (Levenshtein + Umlaut-Normalisierung) |
| **Quiz** | „Wo ist …?“ (Struktur im Modell anklicken) & „Wie heißt …?“ (Multiple Choice), Filter nach System und Region |
| **Karteikarten** | SM-2-Algorithmus, Tagesziel, Priorisierung fälliger Karten |
| **Fortschritt** | Dashboard mit Genauigkeit, System-Fortschritt, Schwachstellen, Streak |
| **Notizen** | Persönliche Notizen & Lesezeichen pro Struktur, Export/Import |

### Neu in 1.1

- **Muskelschichten abtragen:** Im Reiter *Muskulatur* trägt ein Schicht-Slider die
  Muskeln von außen nach innen ab (z. B. *M. obliquus externus* → *internus* →
  *transversus abdominis*). Die Schichten werden beim ersten Einblenden einmalig
  geometrisch berechnet (≈ 5 s) und danach lokal zwischengespeichert. Optional
  bleiben abgetragene Schichten als transparente Hülle sichtbar.
- **Feinfühliges Schneiden:** Schnittebenen in 0,1-%-Schritten, mit <kbd>Umschalt</kbd>
  in 0,01-%-Schritten bzw. 10× langsamerem Ziehen, −/+ Knöpfe und Zahleneingabe.
  Der Sliderweg bezieht sich nur noch auf die eingeblendeten Strukturen; eine
  halbtransparente Ebene zeigt beim Verschieben die Schnittposition.
- **ViewCube wie in CAD:** Würfel oben rechts im Atlas – Klick auf Fläche, Kante oder
  Ecke dreht die Ansicht animiert; Knöpfe für Gesamtansicht und 90°-Drehung.
- **Neues Logo** und Programmsymbol.

### Tastenkürzel im Atlas

| Taste | Aktion |
|-------|--------|
| <kbd>Num 1</kbd> / <kbd>Strg</kbd>+<kbd>Num 1</kbd> | Ansicht von vorne / hinten |
| <kbd>Num 3</kbd> / <kbd>Strg</kbd>+<kbd>Num 3</kbd> | Ansicht von rechts / links (Patientensicht) |
| <kbd>Num 7</kbd> / <kbd>Strg</kbd>+<kbd>Num 7</kbd> | Ansicht von oben / unten |
| <kbd>Num 4</kbd> / <kbd>Num 6</kbd> | Um 90° nach links / rechts drehen |
| <kbd>Pos1</kbd> | Gesamtansicht |
| <kbd>←</kbd> <kbd>→</kbd> auf Schnitt-Slider | ±0,1 % (mit <kbd>Umschalt</kbd> ±0,01 %) |
| <kbd>Bild↑</kbd> <kbd>Bild↓</kbd> auf Schnitt-Slider | ±10 % (mit <kbd>Umschalt</kbd> ±1 %) |

Die Schnittebenen blenden Geometrie im Viewer aus. Sie verändern keine Modelldateien und erzeugen keine geschlossenen Schnittflächen.

## 🛠 Tech Stack

- **Frontend**: Vite + TypeScript (strict) + Three.js (GLTFLoader, DRACOLoader, OrbitControls), kein UI-Framework
- **Raycasting**: [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh) (Hover-Picking, Schichtberechnung)
- **State**: IndexedDB (idb) für Strukturen, Fortschritt und Schicht-Cache; localStorage für Einstellungen
- **Algorithmen**: SM-2 Spaced Repetition, Levenshtein-Distanz, BVH-basierte Schichtzuordnung
- **Tests**: Vitest (Unit-Tests für reine Logik), GitHub Actions (CI, Release, Pages)
- **Build**: Vite mit Code-Splitting (Three.js-Chunk)
- **Deploy**: GitHub Pages, Docker + Nginx (gzip, CSP, Cache-Header für GLB), Electron/NSIS

## 📦 Quick Start

### Voraussetzungen

- Node.js 20+ / npm
- Docker (optional, für Production)
- Blender 4.x (für Data Pipeline)

### Entwicklung

```bash
# Repository klonen
git clone https://github.com/Seven64/anatomie-lernseite.git
cd anatomie-lernseite

# Dependencies installieren
npm install

# Dev-Server starten (http://localhost:5173)
npm run dev
# oder
./start.sh
```

### Befehle

| Befehl | Zweck |
|--------|-------|
| `npm run dev` | Vite-Dev-Server mit Hot Reload |
| `npm run build` | Typecheck (`tsc`) + Produktions-Build nach `dist/` |
| `npm run preview` | `dist/` lokal ausliefern |
| `npm run typecheck` | Nur Typecheck (inkl. `tests/`) |
| `npm test` | Unit-Tests (Vitest), `npm run test:watch` im Watch-Modus |
| `npm run check` | Typecheck + Tests + Daten-Check – dasselbe wie die CI |
| `npm run data:export` | Prüft `structures.json` gegen `public/models` |
| `npm run icon` | Erzeugt `build/icon.ico` aus `public/logo.svg` (rsvg-convert + ImageMagick) |
| `npm run desktop:dir` / `desktop:win` | Electron-App ungepackt bzw. als NSIS-Installer nach `release/` |

### Tests & CI

- **Unit-Tests** liegen in `tests/` und decken die reine Logik ab: SM-2, Text-/Antwortvergleich,
  Schnittebenen-Mathematik, Schichtzuordnung, Strukturbaum-Gruppierung und die Konsistenz von
  `public/structures.json` (Version, eindeutige IDs, vorhandene GLB-Dateien).
- **CI** (`.github/workflows/ci.yml`) läuft bei jedem Push auf `main` und jedem Pull Request:
  Typecheck, Tests, Daten-Check, Build, Docker-Image inklusive Smoke-Test und ein
  Probe-Build des Windows-Installers (als Artefakt herunterladbar).
- **Pages** (`deploy-pages.yml`) veröffentlicht `main` nach erfolgreichem `npm run check`.
- **Release** (`release.yml`) erkennt die Version aus `package.json` auf `main` und
  veröffentlicht neue Versionen automatisch mit Windows-Installer (`.exe`) und Web-ZIP –
  siehe [docs/RELEASE.md](docs/RELEASE.md).

### Windows-Desktop-Installer

Die Windows-Version wird als Electron-Installer gebaut. Die bereits exportierten
GLB-Modelle und der Draco-Decoder werden mitgeliefert; Blender ist nur für eine
erneute Daten-/Modellgenerierung nötig und muss auf dem Zielrechner nicht installiert
werden. Die 3D-Szene wird beim Start weiterhin interaktiv in Three.js gerendert.

```powershell
npm install
npm run desktop:win
```

Für veröffentlichte Versionen baut die GitHub Action `release.yml` den Installer
automatisch auf einem Windows-Runner. Der Installer liegt beim lokalen Build im Ordner `release`. Ohne Code-Signing-Zertifikat ist die
Setup-Datei nicht signiert und Windows kann eine Herausgeber-Warnung anzeigen.
Der NSIS-Assistent zeigt vor der Installation eine deutschsprachige Lizenz- und
Komponentenübersicht aus `installer/license_de.html`.
Für eine vertrauenswürdige Signatur muss ein gültiges Authenticode-Zertifikat mit
privatem Schlüssel verfügbar sein:

```powershell
$env:CSC_LINK = "C:\Pfad\zum\CodeSigning-Zertifikat.pfx"
$env:CSC_KEY_PASSWORD = "Zertifikat-Passwort"
npm run desktop:win
```

Zertifikat und Passwort gehören nicht ins Repository. Das Modell wird nicht bei jedem
Start neu generiert; nur die interaktive 3D-Darstellung wird zur Laufzeit aufgebaut.

### Production (Docker)

```bash
# Image bauen
docker compose build

# Starten (http://localhost:8080)
docker compose up -d

# Logs anzeigen
docker compose logs -f

# Stoppen
docker compose down
```

### Development mit Docker (Hot Reload)

```bash
docker compose --profile dev up dev
```

## 📊 Data Pipeline: Z-Anatomy → Web-Ready GLB

Die 3D-Modelle werden aus dem Z-Anatomy Repository exportiert und für das Web optimiert.

### 1. Z-Anatomy Repository klonen

```bash
cd _source
git clone https://github.com/Z-Anatomy/Models-of-human-anatomy.git
# oder: Z-Anatomy.zip entpacken (enthält Startup.blend)
```

### 2. Blender Export-Script ausführen

```bash
# Im Projekt-Root
blender --background --python scripts/blender/export_gltf.py
```

Das Script (`scripts/blender/export_gltf.py`):
- Lädt `Startup.blend` headless
- Iteriert alle Collections (entsprechen Body Systems)
- Wandelt Kurven wie Arterien und Venen vor dem GLB-Export in Mesh-Geometrie um
- Überführt die Originalfarben aus Blender-Materialien mit Spezial-Shadern in GLB-kompatible Materialien
- Exportiert jede Collection als **Draco-komprimierte GLB**
- Erstellt `structures.json` mit Metadaten (ID, Names, System, Region, ObjectName, GLB-Datei)

### 3. Exportierte Daten kopieren

```bash
# Erzeugte Modelle in public/models kopieren
cp -r _source/export/* public/models/

# Strukturen in IndexedDB laden (beim ersten Start und bei neuer Manifest-Version automatisch)
```

### Manuelle Alternative (ohne Blender)

Falls Blender nicht verfügbar: GLB-Dateien manuell nach `public/models/<system>/` legen und `structures.json` manuell erstellen (Format siehe `src/types/index.ts`).

## 📁 Projektstruktur

```
anatomie-lernseite/
├── .github/workflows/          # ci.yml, release.yml, deploy-pages.yml
├── public/
│   ├── models/                 # GLB-Dateien (nach System geordnet)
│   ├── structures.json         # Strukturmetadaten
│   ├── vendor/draco/           # lokaler Draco-Decoder
│   ├── licenses/               # Lizenztexte und Quellenhinweise
│   └── logo.svg                # Programmzeichen und Favicon
├── build/icon.ico              # Symbol für Programm und Windows-Installer
├── src/
│   ├── main.ts, App.ts         # Einstieg, Modus-Umschaltung
│   ├── types/index.ts          # zentrale Interfaces
│   ├── styles/                 # main.css importiert base, layout, tree, atlas, quiz …
│   ├── ui/                     # UI-Bausteine (Layout, Strukturbaum, Schnitt-/Schicht-Steuerung,
│   │                           #   Info-Panel, Einstellungen, Toasts) + reine Baum-Logik
│   ├── utils/
│   │   ├── DataManager.ts      # IndexedDB (Strukturen, Fortschritt, Cache)
│   │   ├── SettingsManager.ts  # localStorage + Subscriptions
│   │   ├── UIManager.ts        # Fassade über src/ui/
│   │   ├── PreviewViewer.ts    # 3D-Vorschau der Quiz-Modi (Modell-Cache)
│   │   ├── three.ts            # Three.js-Helfer, BVH-Raycasting
│   │   ├── sm2.ts, text.ts     # reine Logik (SM-2, Textvergleich)
│   └── modules/
│       ├── AtlasMode.ts        # Orchestrierung des Atlas
│       ├── atlas/              # AtlasScene, ModelRegistry, CuttingPlanes, MuscleLayers,
│       │                       #   ViewCube + reine Logik (cuttingMath, layerAssignment)
│       ├── LabelQuizMode.ts, QuizMode.ts, FlashcardMode.ts
│       └── ProgressMode.ts, NotesMode.ts
├── tests/                      # Vitest-Unit-Tests
├── docs/                       # ARCHITECTURE.md, RELEASE.md
├── desktop/main.cjs            # Electron-Hauptprozess (lokaler Static-Server)
├── installer/license_de.html   # Lizenzseite im NSIS-Installer
├── scripts/
│   ├── export-data.js          # Daten-Check
│   ├── make-icon.sh            # Logo → icon.ico
│   └── blender/                # Blender-Export + Debug-Helfer
├── Dockerfile, Dockerfile.dev, docker-compose.yml
├── nginx.conf, nginx-security-headers.conf
├── CHANGELOG.md, RELEASE_NOTES.md
└── LICENSE                     # MIT-Lizenz für den Projektcode
```

Details zu Modulen, Datenfluss und Algorithmen: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## ⚙️ Konfiguration

### Settings (localStorage)

| Key | Typ | Default | Beschreibung |
|-----|-----|---------|-------------|
| `theme` | `"dark" \| "light" \| "system"` | `"light"` | Farbschema |
| `labelLanguage` | `"latin" \| "de" \| "en"` | `"latin"` | Beschriftungssprache |
| `dailyGoal` | `number` | `20` | Tagesziel Karteikarten |
| `showLabels` | `boolean` | `true` | Bezeichnung beim Überfahren einer Struktur anzeigen |
| `cameraDistance` | `number` | `2` | Kameraabstand im Atlas |
| `autoRotate` | `boolean` | `false` | Auto-Rotation im Atlas |

### Umgebungsvariablen (Docker)

Keine Required. Optional:
- `NGINX_PORT` (default: 80)

## 🏷️ Lizenz & Attribution

### Code
MIT License — Siehe [LICENSE](LICENSE)

### 3D-Modelle & Daten
**CC BY-SA 4.0** — Basierend auf:

- **Z-Anatomy** — https://github.com/Z-Anatomy/Models-of-human-anatomy
- **BodyParts3D** — The Database Center for Life Science (DBCLS)
- **Wikipedia** — Anatomie-Artikel (CC BY-SA 3.0)
- **Universität Basel** — Anatomische Präparate
- **Universität Tokio** — Digitale Anatomie-Modelle
- **Universität Zürich** — Medizinische Bilddaten

### Mitgelieferte Bibliotheken
three.js und three-mesh-bvh (MIT), idb (ISC), Draco-Decoder (Apache 2.0) – Lizenztexte in `public/licenses/` und `public/vendor/draco/`.

> **Wichtig**: Bei Weitergabe der Modelle (GLB-Dateien) muss die CC BY-SA 4.0 Lizenz beibehalten und die obigen Quellen genannt werden. In der Anwendung sind Quellen und Lizenzhinweise im Tab „Über“ sowie im Installationsassistenten aufgeführt.

## 🤝 Contributing

1. Fork & Branch (`feature/amazing-feature`)
2. Commits mit konventionellen Messages (`feat: add ...`)
3. `npm run check` lokal ausführen; neue reine Logik mit Tests in `tests/` absichern
4. Pull Request erstellen – die CI muss grün sein

### Code Style
- TypeScript `strict: true`
- Typecheck über `npm run typecheck` (inkl. `noUnusedLocals`/`noUnusedParameters`)
- Keine Datei über ~400 Zeilen: größere Bereiche in Module unter `src/ui/` bzw. `src/modules/atlas/` aufteilen
- CSS Variables für Theming
- Keine `any` Types

## 🐛 Troubleshooting

### Models laden nicht
- Prüfen: `public/models/<system>/<file>.glb` existiert?
- Netzwerk-Tab: 404 auf GLB? → Data Pipeline ausführen
- CORS: Lokal via `npm run dev` OK, im Docker via Nginx `Access-Control-Allow-Origin: *`

### Blender Export schlägt fehl
```bash
# WSL: Fehlende Libraries installieren
sudo apt-get update && sudo apt-get install -y libsm6 libxext6 libxrender1 libxi6 libgl1-mesa-glx

# Blender headless testen
blender --background --version
```

### IndexedDB Quota Exceeded
- Browser-Daten löschen (DevTools → Application → Clear Storage)
- Oder: Einstellungen → „Daten exportieren“ → Speicher leeren → „Daten importieren“

### Schicht-Slider bleibt bei „Berechne …“
- Die Berechnung läuft einmalig beim ersten Einblenden der Muskulatur (≈ 5 s auf einem Desktop-Rechner).
- Das Ergebnis liegt im IndexedDB-Store `cache`. „Alle Daten löschen“ in den Einstellungen setzt es zurück.

### Performance (Mobile)
- Modelle sind Draco-komprimiert (~60-80% kleiner)
- Lazy-Loading pro System im Atlas, BVH-beschleunigtes Picking
- Falls FPS < 30: `setPixelRatio(1)` in `src/modules/atlas/AtlasScene.ts`

## 📚 Weiterführende Links

- [Three.js Docs](https://threejs.org/docs/)
- [Vite Guide](https://vitejs.dev/guide/)
- [IndexedDB (idb)](https://github.com/jakearchibald/idb)
- [SM-2 Algorithm](https://www.supermemo.com/en/archives1990-2015/english/ol/sm2)
- [Draco Compression](https://github.com/google/draco)
- [Z-Anatomy Repository](https://github.com/Z-Anatomy/Models-of-human-anatomy)

---

**Entwickelt für Medizinstudierende — Viel Erfolg beim Lernen! 🧠**