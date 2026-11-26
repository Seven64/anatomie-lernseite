# Release-Prozess

Releases werden vollständig von GitHub Actions gebaut (`.github/workflows/release.yml`).
Die **Version kommt aus `package.json` auf `main`** – ein Tag muss nicht von Hand gesetzt werden.

## Ablauf

1. **Version anheben** (Semantic Versioning) – auf einem Feature-Branch:
   ```bash
   npm version 1.2.0 --no-git-tag-version   # package.json + package-lock.json
   ```
2. `CHANGELOG.md` ergänzen und `RELEASE_NOTES.md` für die neue Version schreiben.
   Die Release-Notes müssen die Versionsnummer enthalten (wird geprüft).
3. `npm run check` und `npm run build` lokal ausführen.
4. Pull Request gegen `main` erstellen, CI abwarten (baut auch den Windows-Installer
   als Probe), mergen.
5. Fertig: Der Push auf `main` startet `release.yml`. Erkennt der Workflow eine Version,
   für die es noch kein Release gibt, baut er alles und legt Tag `vX.Y.Z` und Release an.

Pushes auf `main` ohne Versionsänderung lösen kein neues Release aus (Job `detect`
findet das bestehende Release und beendet den Lauf).

## Was der Workflow macht

| Job | Runner | Ergebnis |
|-----|--------|----------|
| `detect` | Ubuntu | liest die Version aus `package.json`, prüft, ob `vX.Y.Z` schon veröffentlicht ist |
| `verify` | Ubuntu | Typecheck, Tests, Daten-Check; Release-Notes nennen die Version |
| `web` | Ubuntu | `Anatomie-Lernseite-Web-<version>.zip` aus `dist/` |
| `windows` | Windows | `Anatomie-Lernseite-Setup-<version>.exe` (+ `.blockmap`) per electron-builder |
| `release` | Ubuntu | `SHA256SUMS.txt`, Tag + GitHub-Release mit `RELEASE_NOTES.md` als Text |

Über „Run workflow“ (`workflow_dispatch`) lässt sich der Lauf manuell starten, z. B. wenn
ein Build fehlgeschlagen ist. Ein bereits vorhandenes Release wird nicht überschrieben;
zum Neubau das Release (und ggf. Tag) vorher auf GitHub löschen.

## Code-Signing

Der Installer wird ohne Authenticode-Signatur gebaut (`CSC_IDENTITY_AUTO_DISCOVERY=false`).
Für eine Signatur müssten `CSC_LINK` (Base64-PFX) und `CSC_KEY_PASSWORD` als
**Repository-Secrets** hinterlegt und im Job `windows` als Umgebungsvariablen gesetzt
werden. Zertifikate gehören niemals ins Repository.

## Webversion

Unabhängig vom Release veröffentlicht `deploy-pages.yml` jeden Push auf `main`
nach erfolgreichem `npm run check` auf GitHub Pages.
