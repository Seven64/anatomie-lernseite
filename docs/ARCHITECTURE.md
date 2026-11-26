# Architektur

Diese Seite beschreibt Aufbau, Datenfluss und die wichtigsten Algorithmen der
Anatomie Lernseite. Einstieg für Nutzer und Befehle: [README](../README.md).

## Überblick

```
main.ts → App.ts ──► UIManager (Fassade) ──► src/ui/*   (DOM: Layout, Baum, Panels, Dialoge)
             │
             ├──► DataManager      IndexedDB: Strukturen, Fortschritt, Cache
             ├──► SettingsManager  localStorage + Subscriptions
             └──► Modi             je ein Lernmodus, aktiviert/deaktiviert über setActive()
                   ├─ AtlasMode ──► src/modules/atlas/*  (Three.js)
                   ├─ QuizMode, LabelQuizMode ──► utils/PreviewViewer
                   └─ FlashcardMode, ProgressMode, NotesMode
```

- Kein UI-Framework: Module rendern HTML-Strings und binden Ereignisse per Delegation.
  Nutzerdaten in HTML immer über `escapeHtml()` (`utils/text.ts`) einsetzen.
- Modi kommunizieren über `window`-Events (`mode-change`, `add-note`, `toggle-bookmark`,
  `isolate-structure`, `hide-structure`, `reset-view`, `theme-applied`).
- Pfade sind relativ (`./models/…`), weil die App unter einem Unterpfad (GitHub Pages)
  und aus Electron läuft.

## Verzeichnisse

| Pfad | Inhalt |
|------|--------|
| `src/ui/` | `layout.ts` (Gerüst, „Über“-Tab), `StructureTree.ts`, `CuttingControls.ts`, `LayerControls.ts`, `InfoPanel.ts`, `SettingsModal.ts`, `feedback.ts` (Toast/Modal/Laden/Hover), `constants.ts`, `treeModel.ts` (reine Gruppierung) |
| `src/modules/atlas/` | `AtlasScene.ts` (Renderer, Kamera, Renderschleife), `ModelRegistry.ts` (GLB laden, Meshes zuordnen, Deckkraft), `CuttingPlanes.ts`, `MuscleLayers.ts`, `ViewCube.ts`; reine Logik in `cuttingMath.ts` und `layerAssignment.ts` |
| `src/utils/` | `DataManager.ts`, `SettingsManager.ts`, `UIManager.ts`, `PreviewViewer.ts`, `three.ts`, `sm2.ts`, `text.ts` |
| `src/styles/` | `main.css` importiert die Teildateien in fester Reihenfolge (Kaskade!) |
| `tests/` | Vitest-Tests für alle reinen Module und die Strukturdaten |

Faustregel: Dateien bleiben unter ~400 Zeilen. Reine Logik (ohne DOM/Three.js) liegt
in eigenen Modulen und bekommt Unit-Tests.

## Daten

- `public/structures.json` enthält ~5 200 Strukturen (`Structure` in `src/types`).
  `DataManager.STRUCTURES_VERSION` muss zur `version` der Datei passen; ändert sich die
  Datei, beide anheben (ein Test prüft das).
- Z-Anatomy-Knoten mit Suffix `.j` (Beschriftung) und `.g` (Gruppe) haben keine eigene
  Geometrie. `isLearnableStructure()` schließt sie aus Quiz und Karteikarten aus.
- IndexedDB `anatomy-learning` (Version 3): Stores `structures`, `manifest`, `progress`,
  `settings`, `cache` (berechnete Muskelschichten).
- GLTFLoader „säubert“ Knotennamen (`Deltoid muscle.l` → `Deltoid_musclel`). Der
  Originalname steht in `userData.name` bzw. `userData.atlasObjectName`; Zuordnung
  daher immer über `getNodeName()` / `findNodesByName()` aus `utils/three.ts`.

## Atlas

### Sichtbarkeitsmodell

`AtlasMode` hält den Zustand – `systemVisibility`, `hiddenIds`, `peel` (Schichttiefe je
System), `selectedId` – und wendet ihn ausschließlich in `refresh()` auf die Meshes an:

```
sichtbar  = !hiddenIds.has(id) && (!abgetragen || Geistermodus)
Material  = abgetragen ? Geistermaterial : ausgewählt ? Hervorhebung : Original
```

`refresh()` aktualisiert anschließend die Schnittgrenzen (Box über alle eingeblendeten,
nicht abgetragenen Strukturen) und meldet die Sichtbarkeit an den Strukturbaum.
Abgetragene Schichten ändern die Checkboxen im Baum nicht.

### Schnittebenen

Drei achsparallele `THREE.Plane` (`CuttingPlanes.ts`) werden allen Materialien als
`clippingPlanes` zugewiesen. Der Fortschritt (0–100 %, Auflösung 0,01 %) wird über
`cutPosition()` auf die Modellgrenzen abgebildet: 0 % = nichts geschnitten,
100 % = alles. Eine Vorschau-Ebene blendet sich nach dem Verschieben kurz ein.
Picking ignoriert Treffer auf weggeschnittenen Seiten (`isClipped()`).

### Muskelschichten („Zwiebelschalen“-Algorithmus)

1. Alle Muskel-Meshes werden in Weltkoordinaten zu einer Geometrie zusammengeführt;
   `vertexOwner` merkt sich je Vertex die Struktur. Darauf wird **eine** `MeshBVH`
   gebaut (statt ~2 000 Einzel-BVHs).
2. Je Struktur werden 8 Oberflächenpunkte gewählt und von jedem 14 Strahlen in
   gleichmäßig verteilte Richtungen (Fibonacci-Kugel) geworfen. Jeder Strahl liefert
   die Menge der Strukturen, die er auf dem Weg nach außen trifft.
3. `assignLayers()` schält iterativ: In Runde *k* gilt eine Struktur als freigelegt,
   wenn mindestens 8 % ihrer Strahlen nur noch bereits abgetragene Strukturen treffen.
   Der Schwellwert verhindert, dass tiefe Muskeln durch schmale Lücken als außen gelten.
   Maximal 8 Schichten; vollständig umschlossene Reste landen in der letzten.
4. Ergebnis (`Record<id, Schicht>`) wird unter
   `layers:v<Algorithmus>:<STRUCTURES_VERSION>:<GLB-Dateien>` im Store `cache` abgelegt.
   Bei Änderungen am Verfahren `LAYER_ALGORITHM_VERSION` anheben.

Dauer: ≈ 5–6 s einmalig für 684 Muskelstrukturen (Desktop), danach sofort.
Ergebnis mit den aktuellen Daten: 5 Schichten mit 108 / 343 / 188 / 40 / 5 Strukturen.

### ViewCube

Eigener kleiner `WebGLRenderer` mit Orthokamera, die der Blickrichtung der
Hauptkamera folgt. Treffer auf dem Würfel werden in Flächen-, Kanten- oder
Eckregionen eingeteilt (Randzone 17 %); daraus ergibt sich die Zielrichtung. Die
Kamera fliegt per Quaternion-Slerp (450 ms) dorthin, der Abstand bleibt erhalten.
Achsen: +Z vorne, +Y oben, +X links des Patienten (Blender-Export).

## Quiz-Vorschau

`PreviewViewer` hält einen Renderer pro Modus und cacht geparste GLB-Szenen
(`modelCache`); jede Frage klont die Szene (Geometrien werden geteilt). Im Modus
„Wie heißt …?“ wird die Zielstruktur violett hervorgehoben und die Umgebung
transparent dargestellt; bei „Wo ist …?“ bleibt das Modell unverändert.

## Sicherheit

- Content-Security-Policy (`nginx-security-headers.conf`) erlaubt nur `'self'` plus
  `'wasm-unsafe-eval'` für den Draco-Decoder. Neue externe Ressourcen erfordern eine
  Anpassung.
- Electron liefert `dist/` über einen lokalen Server auf `127.0.0.1` aus.
