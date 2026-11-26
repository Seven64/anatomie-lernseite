# Changelog

Alle nennenswerten Änderungen an diesem Projekt. Format nach
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/), Versionierung nach
[Semantic Versioning](https://semver.org/lang/de/).

## [1.1.0] – 2026-11-26

### Hinzugefügt
- Schicht-Slider für die Muskulatur: geometrische Schichtberechnung per BVH-Raycasting
  (`src/modules/atlas/MuscleLayers.ts`), Ergebnis im IndexedDB-Store `cache`;
  optional transparente Darstellung abgetragener Schichten.
- ViewCube mit Klick auf Flächen/Kanten/Ecken, Gesamtansicht, 90°-Drehung und
  Zahlenblock-Kürzeln (`src/modules/atlas/ViewCube.ts`).
- Feinsteuerung der Schnittebenen: 0,1-/0,01-%-Schritte, Umschalt-Ziehen, −/+,
  Zahleneingabe, Ebenen-Vorschau; Grenzen beziehen sich auf sichtbare Strukturen.
- Ladefortschritt im Atlas.
- Vitest-Unit-Tests (`tests/`), Skripte `typecheck`, `test`, `check`, `icon`.
- GitHub Actions: `ci.yml` (Typecheck, Tests, Daten-Check, Build, Docker-Smoke-Test)
  und `release.yml` (Windows-Installer, Web-ZIP, Prüfsummen, GitHub-Release).
- Dokumentation: `docs/ARCHITECTURE.md`, `docs/RELEASE.md`, dieses Changelog.
- Neues Logo (`public/logo.svg`) und Programmsymbol (`build/icon.ico`).

### Geändert
- `UIManager.ts` (1225 Zeilen) in Module unter `src/ui/` aufgeteilt; `AtlasMode.ts`
  in `src/modules/atlas/` (Szene, Modelle, Schnitt, Schichten, ViewCube) zerlegt;
  `main.css` in thematische Teildateien aufgeteilt, ungenutzte Utility-Klassen entfernt.
- Zentrales Sichtbarkeitsmodell im Atlas; Auswahl hebt alle Meshes einer Struktur hervor.
- Gemeinsamer `PreviewViewer` für Quiz und Beschriftungs-Quiz mit Modell-Cache.
- `DataManager`: O(1)-Zugriff per ID/System, kein `any`, gemeinsame
  `createEmptyProgress()`/`isLearnableStructure()`.
- Gemeinsame Helfer `utils/text.ts` (Escaping, Fuzzy-Match, Mischen) und `utils/sm2.ts`.
- Installer-Dateiname ohne Leerzeichen: `Anatomie-Lernseite-Setup-<version>.exe`.
- Hervorhebungsfarbe auf kontrastreiches Violett geändert.

### Behoben
- „Wo ist …?“ verriet die Antwort durch Hervorhebung; Beschriftungs-Quiz zeigte den Namen in der Frage.
- Zielstruktur im Quiz wurde wegen bereinigter glTF-Knotennamen oft nicht gefunden.
- Pro Quizfrage entstand ein neuer WebGL-Renderer mit eigener Renderschleife (Speicherleck).
- Karteikarten: quadratische Laufzeit beim Sortieren fälliger Karten.
- Einstellungsdialog zeigte gespeicherte Auswahl nicht an; „Alle Daten löschen“ wartete nicht auf das Löschen.
- Thema-Symbol wechselte nie; fehlerhaftes SVG im Sidebar-Symbol; ungültige CSS-Farbe im Ladeoverlay.
- Klick nach dem Drehen der Ansicht wählte versehentlich Strukturen aus.
- Gleichzeitige Ladeanfragen desselben Systems luden das Modell doppelt.
- Fehlende HTML-Maskierung von Strukturnamen in mehreren Ansichten.

### Entfernt
- Ungenutzte Abhängigkeit Fuse.js.

## [1.0.0]

Erste veröffentlichte Version mit Atlas, Quiz-Modi, Karteikarten, Fortschritt,
Notizen sowie Windows-Installer und GitHub-Pages-Deployment.

[1.1.0]: https://github.com/Seven64/anatomie-lernseite/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Seven64/anatomie-lernseite/releases/tag/v1.0.0
