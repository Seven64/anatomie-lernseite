# Anatomie Lernseite 1.1.0

Version 1.1 bringt eine neue Schicht-Ansicht für die Muskulatur, feinere Schnitte,
einen Navigationswürfel wie in CAD-Programmen und eine überarbeitete Codebasis.

## Highlights

- **Muskelschichten abtragen:** Der Schicht-Slider im Reiter „Muskulatur“ trägt die
  Muskeln von außen nach innen ab, statt nur die Deckkraft zu ändern. Abgetragene
  Schichten lassen sich optional transparent anzeigen.
- **Feinfühligeres Schneiden:** Schritte von 0,1 % bzw. 0,01 % mit Umschalttaste,
  langsames Ziehen, −/+ Knöpfe, Zahleneingabe und eine Vorschau der Schnittebene.
- **ViewCube:** Würfel zur Navigation – Fläche, Kante oder Ecke anklicken; dazu
  Zahlenblock-Kürzel (1, 3, 7) und 90°-Drehung.
- **Neues Logo** und neues Programmsymbol.

## Verbesserungen und Fehlerbehebungen

- Quiz „Wo ist …?“ markiert die gesuchte Struktur nicht mehr (die Antwort war sichtbar).
- Beschriftungs-Quiz fragt „Wie heißt die markierte Struktur?“ statt den Namen vorzugeben.
- Quiz-Modi finden die Zielstruktur zuverlässig, heben sie kontrastreich hervor und
  überspringen Beschriftungs-/Gruppenknoten ohne Geometrie.
- Quiz-Modi laden jedes Modell nur einmal und erzeugen keine zusätzlichen Renderer mehr.
- Karteikarten starten deutlich schneller (keine quadratische Laufzeit mehr).
- Atlas zeigt beim Laden einen Fortschrittsbalken; Ausblenden nach dem Drehen wählt
  keine Struktur mehr versehentlich aus.
- Einstellungsdialog zeigt die gespeicherten Werte korrekt an; Thema-Symbol wechselt.
- Der Atlas blieb leer (kein Skelett), wenn noch ein Tab mit einer älteren Version
  geöffnet war. Die App lädt die Daten jetzt trotzdem und zeigt einen Hinweis.
- Strukturnamen ohne interne Kürzel, z. B. „Deltoid muscle (links)“ oder
  „Procerus muscle – Ursprung (rechts)“.
- Lernfortschritt, Lesezeichen und Notizen überschreiben sich nicht mehr gegenseitig;
  das Beschriftungs-Quiz zählt jetzt im Fortschritt mit, Antwortzeiten werden erfasst.
- Notizen werden als Text angezeigt (kein HTML); Klick auf Notiz/Lesezeichen öffnet
  die Struktur im Atlas.
- Fortschrittsansicht mit deutschen Systemnamen und Zahlenformaten.
- Neue automatische Tests und GitHub-Workflows für CI und Releases; Releases werden
  automatisch erstellt, sobald eine neue Version auf `main` landet.

## Windows-Download

Lade `Anatomie-Lernseite-Setup-1.1.0.exe` aus den Release-Assets herunter und
starte den Installer. Blender muss auf dem Zielrechner nicht installiert sein.
Die Prüfsummen stehen in `SHA256SUMS.txt`.

**Hinweis:** Diese Installer-Datei ist nicht mit einem Authenticode-Zertifikat
signiert. Windows kann deshalb vor dem Start eine Herausgeber-Warnung anzeigen.

## Webversion

Die [Webversion](https://Seven64.github.io/anatomie-lernseite/) ist über GitHub
Pages verfügbar. Das Release enthält außerdem
`Anatomie-Lernseite-Web-1.1.0.zip` für eigenes Hosting.

## Lizenzen

Der Programmcode steht unter der MIT-Lizenz. Die mitgelieferten Anatomiemodelle
und -daten werden unter CC BY-SA 4.0 mit Quellenhinweisen weitergegeben. Weitere
Komponenten (u. a. three.js, three-mesh-bvh, Draco) und Hinweise stehen im Tab
„Über“ und in der Installationsübersicht.
