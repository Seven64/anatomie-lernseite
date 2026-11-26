# Anatomie Lernseite 1.2.0

Version 1.2 bringt eine frei bewegliche Kamera für Maus, Touchpad und Touchscreen,
fast 300 bisher fehlende Strukturen, automatische Updates in der Desktop-App und ein
Quiz-Layout, das auch in kleinen Fenstern funktioniert.

## Highlights

- **Freie Kamerasteuerung:** Drehen ohne Sperre an den Polen, Zoom zum Mauszeiger,
  Verschieben mit rechter/mittlerer Maustaste oder Umschalt/Strg + links.
  Doppelklick fokussiert die Struktur unter dem Zeiger bzw. passt die Ansicht ein;
  Pfeiltasten und +/− funktionieren ebenfalls.
- **Touchpad und Touch:** Zwei Finger zoomen und drehen, Pinch zoomt fein. Auf
  Touchscreens dreht ein Finger, zwei Finger zoomen und verschieben, Doppeltipp
  fokussiert.
- **291 neue Strukturen:** u. a. alle Hirn- und peripheren Nerven, Ösophagus und
  Jejunum waren im 3D-Modell vorhanden, fehlten aber in Strukturbaum, Suche und Quiz.
- **Automatische Updates** in der Windows-App über GitHub-Releases.

## Verbesserungen und Fehlerbehebungen

- Desktop-App: Lernfortschritt, Notizen und Einstellungen gingen bisher bei jedem
  Neustart verloren. Die App nutzt jetzt einen festen Ursprung, die Daten bleiben
  erhalten. Die App startet außerdem nur noch einmal.
- ViewCube-Flüge nach oben und unten haben die richtige Hochrichtung; beim starken
  Hineinzoomen bleibt die Tiefendarstellung scharf.
- 3D-Schriftzüge wie „SKELETAL SYSTEM“ erscheinen nicht mehr im Atlas und im Quiz.
- Faszien und Retinakula sind eine eigene Ebene und beim ersten Einblenden der
  Muskulatur verborgen, damit sie die Muskeln nicht verdecken.
- Quiz und Beschriftungs-Quiz: Eingabe und Knöpfe bleiben auch in kleinen Fenstern
  sichtbar, die Rückmeldung erscheint über der 3D-Ansicht und wird von
  Bildschirmlesern angesagt.
- Hervorhebungen (ausgewählte Struktur, richtige/falsche Antwort) werden wieder in
  Farbe angezeigt.
- Das geschlossene Info-Panel ist nicht mehr per Tab-Taste erreichbar; der ViewCube
  weicht dem geöffneten Panel aus. Auf dem Handy belegt das Panel weniger Platz.
- Im Einstellungsdialog überdeckt die Fußzeile den Inhalt nicht mehr.
- In schmalen Fenstern und auf dem Handy werden die Symbole der Kopfzeile nicht mehr
  gestaucht; die Modus-Leiste lässt sich bei Bedarf seitlich scrollen.
- Neue Tests für Kameraberechnung und Desktop-App (Start, Darstellung, Speichern
  über Neustarts).

## Windows-Download

Lade `Anatomie-Lernseite-Setup-1.2.0.exe` aus den Release-Assets herunter und
starte den Installer. Blender muss auf dem Zielrechner nicht installiert sein.
Die Prüfsummen stehen in `SHA256SUMS.txt`.

**Hinweis:** Diese Installer-Datei ist nicht mit einem Authenticode-Zertifikat
signiert. Windows kann deshalb vor dem Start eine Herausgeber-Warnung anzeigen.

## Webversion

Die [Webversion](https://Seven64.github.io/anatomie-lernseite/) ist über GitHub
Pages verfügbar. Das Release enthält außerdem
`Anatomie-Lernseite-Web-1.2.0.zip` für eigenes Hosting.

## Lizenzen

Der Programmcode steht unter der MIT-Lizenz. Die mitgelieferten Anatomiemodelle
und -daten werden unter CC BY-SA 4.0 mit Quellenhinweisen weitergegeben. Weitere
Komponenten (u. a. three.js, three-mesh-bvh, Draco) und Hinweise stehen im Tab
„Über“ und in der Installationsübersicht.
