# Anatomie Lernseite

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
| **Atlas** | 3D-Viewer mit Hover-Bezeichnungen, nach Körperregionen und anatomischen Elternstrukturen unterteiltem Strukturbaum, gruppierten Gewebe-Layern (Muskulatur, Sehnen, Arterien, Venen, Herz), originalen Blender-Materialfarben für alle Anatomie-Systeme, drei richtungsgebundenen Schnittebenen, Isolieren/Ausblenden und fein einstellbarer Deckkraft |
| **Beschriftungs-Quiz** | Freitext-Eingabe mit Fuzzy-Matching (Levenshtein + Umlaut-Normalisierung) |
| **Quiz** | Zwei Modi: "Wo ist ...?" (Raycasting) & "Wie heißt ...?" (Multiple Choice) |
| **Karteikarten** | SM-2 Algorithmus, Tagesziel, fällige Karten Priorisierung |
| **Fortschritt** | Dashboard mit Genauigkeit, System-Fortschritt, Schwachstellen, Streak |
| **Notizen** | Persönliche Notizen & Lesezeichen pro Struktur, Export/Import |

Die Schnittebenen blenden Geometrie im Viewer aus. Sie verändern keine Modelldateien und erzeugen keine geschlossenen Schnittflächen.

## 🛠 Tech Stack

- **Frontend**: Vite + TypeScript + Three.js (GLTFLoader, DRACOLoader, OrbitControls)
- **State**: IndexedDB (idb) für Structures/Progress, localStorage für Settings
- **Search**: Fuse.js für Fuzzy-Suche
- **Algorithms**: SM-2 Spaced Repetition, Levenshtein Distance
- **Build**: Vite mit Code-Splitting (Three.js, Vendor chunks)
- **Deploy**: Docker + Nginx (gzip/brotli, CSP, Cache-Headers für GLB)

## 📦 Quick Start

### Voraussetzungen

- Node.js 18+ / npm
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

### Windows-Desktop-Installer

Die Windows-Version wird als Electron-Installer gebaut. Die bereits exportierten
GLB-Modelle und der Draco-Decoder werden mitgeliefert; Blender ist nur für eine
erneute Daten-/Modellgenerierung nötig und muss auf dem Zielrechner nicht installiert
werden. Die 3D-Szene wird beim Start weiterhin interaktiv in Three.js gerendert.

```powershell
npm install
npm run desktop:win
```

Der Installer liegt danach im Ordner `release`. Ohne Code-Signing-Zertifikat ist die
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
├── public/
│   ├── models/                 # GLB-Dateien (nach System geordnet)
│   ├── licenses/               # Lizenztexte und Quellenhinweise
│   └── logo.svg                # Programmzeichen und Favicon
├── build/
│   └── icon.ico                # Symbol für Programm und Windows-Installer
├── src/
│   ├── main.ts                 # Entry Point
│   ├── App.ts                  # Haupt-Controller, Mode-Switching
│   ├── types/index.ts          # TypeScript Interfaces
│   ├── styles/main.css         # Design System (CSS Variables, Dark/Light, Responsive)
│   ├── utils/
│   │   ├── DataManager.ts      # IndexedDB Wrapper (Structures, Progress, Settings)
│   │   ├── SettingsManager.ts  # localStorage + Reactive Subscriptions
│   │   └── UIManager.ts        # Layout, Sidebar, Info-Panel, Modals, Toasts
│   └── modules/
│       ├── AtlasMode.ts        # Three.js Scene, Lazy-Loading, Clipping, Highlighting
│       ├── LabelQuizMode.ts    # Fuzzy-Matching, Per-Question 3D Loading
│       ├── QuizMode.ts         # Locate/Identify, Raycasting, System/Region Filter
│       ├── FlashcardMode.ts    # SM-2, Daily Goal, Due Card Sorting
│       ├── ProgressMode.ts     # Dashboard, Weak Structures, Streak, Export/Import
│       └── NotesMode.ts        # Notes/Bookmarks CRUD, Search, Structure Linking
├── desktop/
│   └── main.cjs                # Electron-Hauptprozess (lokaler Static-Server)
├── scripts/
│   ├── export-data.js          # Prüft structures.json & GLB-Dateien
│   └── blender/
│       ├── export_gltf.py      # Blender Export: Collections → Draco-GLB + structures.json
│       ├── check_collections.py    # Debug: Collection-Namen auflisten
│       ├── check_export_params.py  # Debug: glTF-Export-Parameter anzeigen
│       └── list_collections.py     # Debug: Collection-Hierarchie anzeigen
├── release/                    # Gebaute Installer & Web-ZIPs (gitignored)
├── _source/                    # Z-Anatomy Source (gitignored)
├── index.html
├── vite.config.ts
├── tsconfig.json
├── package.json
├── LICENSE                     # MIT-Lizenz für den Projektcode
├── installer/
│   └── license_de.html         # Deutsche Lizenz- und Komponentenübersicht
├── Dockerfile
├── Dockerfile.dev
├── docker-compose.yml
├── nginx.conf
├── start.sh
└── README.md
```

## ⚙️ Konfiguration

### Settings (localStorage)

| Key | Typ | Default | Beschreibung |
|-----|-----|---------|-------------|
| `theme` | `"dark" \| "light" \| "system"` | `"system"` | Farbschema |
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

> **Wichtig**: Bei Weitergabe der Modelle (GLB-Dateien) muss die CC BY-SA 4.0 Lizenz beibehalten und die obigen Quellen genannt werden. In der Anwendung sind Quellen und Lizenzhinweise im Tab „Über“ sowie im Installationsassistenten aufgeführt.

## 🤝 Contributing

1. Fork & Branch (`feature/amazing-feature`)
2. Commits mit konventionellen Messages (`feat: add ...`)
3. Tests hinzufügen / manuell prüfen
4. Pull Request erstellen

### Code Style
- TypeScript `strict: true`
- Typecheck über `npm run build` (`tsc`, inkl. `noUnusedLocals`/`noUnusedParameters`)
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
- Oder: `npm run data:export` → Backup → `localStorage.clear()` → Import

### Performance (Mobile)
- Modelle sind Draco-komprimiert (~60-80% kleiner)
- Lazy-Loading pro System im Atlas
- Falls FPS < 30: `renderer.setPixelRatio(1)` in `AtlasMode.ts`

## 📚 Weiterführende Links

- [Three.js Docs](https://threejs.org/docs/)
- [Vite Guide](https://vitejs.dev/guide/)
- [IndexedDB (idb)](https://github.com/jakearchibald/idb)
- [SM-2 Algorithm](https://www.supermemo.com/en/archives1990-2015/english/ol/sm2)
- [Draco Compression](https://github.com/google/draco)
- [Z-Anatomy Repository](https://github.com/Z-Anatomy/Models-of-human-anatomy)

---

**Entwickelt für Medizinstudierende — Viel Erfolg beim Lernen! 🧠**