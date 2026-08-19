# Changelog

## Unveröffentlicht

### Hinzugefügt
- **Notizen in Markdown, mit Leseansicht und Editor.** Der Notizinhalt wird als
  Markdown gerendert: Überschriften, Listen, Aufgabenlisten, Zitate, Tabellen,
  Codeblöcke, Verweise und Bilder. Ein Klick auf eine Notiz öffnet eine eigene
  Leseansicht über die volle Breite; das Bearbeitungsformular bekommt eine
  Werkzeugleiste, ein größeres Feld in Monospace, Tastenkürzel (Strg+B, Strg+I,
  Strg+K) und einen Umschalter „Schreiben | Vorschau". Listenkarten und
  Suchtreffer zeigen den Auszug ohne Markdown-Zeichen. Gerendert wird mit
  `marked`, gesäubert mit `DOMPurify`; beide liegen vendort in
  `public/vendor` (`npm run vendor:markdown`), damit die CSP bei `'self'`
  bleibt. Rohes HTML aus einer Notiz wird verworfen.
- **Ordner für Notizen.** Filterleiste über der Liste mit „Alle", allen Ordnern
  samt Anzahl und „Ohne Ordner". Anlegen, umbenennen und löschen aus der Leiste
  oder direkt aus dem Notizformular. Umbenennen wirkt sofort für alle
  enthaltenen Notizen; Löschen behält sie und stellt sie auf „Ohne Ordner".
  Ordnernamen sind eindeutig, unabhängig von Groß- und Kleinschreibung.
- `tests/migration.test.js` prüft den Start gegen eine Datenbank im alten
  Schema — eine Fehlerklasse, die Tests mit frischer Datenbank nicht sehen.
- **Termine für geplante Ziele.** Ein Ziel auf der Wunschliste kann ein Datum
  „Geplant für" tragen. Neuer Abschnitt „Nächste Termine" auf der Übersicht:
  geplante Ziele und noch laufende Reisen chronologisch, mit „heute", „morgen"
  oder „in 5 Tagen". Verstrichene Termine bleiben sichtbar und sind als
  überfällig gekennzeichnet. Zusätzliche Sortierung nach geplantem Datum.
- `public/js/dates.js` bündelt die Datumsrechnung als reines, testbares Modul.

### Geändert
- **Der Stern schickt nicht mehr den ganzen Datensatz.** Neue Route
  `PUT /api/<ressource>/:id/favorite` für Notizen, Ziele und Reisen. Vorher baute
  das Frontend zum Umschalten den vollständigen Eintrag neu zusammen; kam die
  Liste aus dem Offline-Cache, überschrieb ein Klick auf den Stern den neueren
  Serverstand mit der veralteten Kopie.
- **Zugriffsprüfung der Routen liegt in `middleware/owned.js`.** Das Vorspiel
  „ID prüfen, Besitz prüfen, sonst 404" stand vorher sechzehnmal wörtlich in den
  Routen von Notizen, Ordnern, Zielen, Reisen und Anhängen.
- **Eintragskarten teilen ihre Aktionen.** `views/entryActions.js` ersetzt die
  vierfach vorhandenen Funktionen zum Umschalten des Favoriten und zum Löschen.
  Die Icon-Knöpfe tragen jetzt `aria-label`.
- **Das Aufziehen mit zwei Fingern ist nicht mehr gesperrt.** `user-scalable=no`
  und `maximum-scale` sind aus dem Viewport verschwunden (WCAG 1.4.4). Damit iOS
  beim Fokus in ein Feld nicht selbst hineinzoomt, sind Eingabefelder auf
  schmalen Schirmen 16 Pixel groß.
- `renderEmptyState()` escaped Titel und Text jetzt selbst; nur der Knopf ist
  weiterhin HTML und heißt deshalb `btnHtml`.
- **Ein Ziel kann Wanderweg und Ort gleichzeitig sein.** Statt eines festen
  `kind` tragen Einträge die Kennzeichen `is_trail` und `is_place`. Damit lassen
  sich Schluchten, Wälder oder Seen erfassen, die man anfährt *und* abläuft —
  vorher zwang das Modell zu einer willkürlichen Entscheidung.
- Die Zuordnung ist nachträglich änderbar; falsch eingeordnete Einträge müssen
  nicht mehr gelöscht und neu angelegt werden.
- `?kind=` filtert auf den Aspekt: ein Doppel-Ziel erscheint in beiden Listen,
  wird auf der Übersicht aber nur einmal gezählt.
- Bestehende Datenbanken werden beim Start automatisch migriert.

## 0.1.0 — Erste Fassung

Selbst gehostete PWA für Notizen, Wanderwege, Orte und Reisen. Aufgesetzt auf dem
Muster von AniGa (Express, better-sqlite3, Vanilla-JS-PWA, ein Docker-Container)
mit dessen Farbschema.

### Notizen
- Anlegen, bearbeiten, löschen; Suche über Titel und Inhalt
- Favoriten stehen immer oben
- Anhänge (PDF, Word, ODT, Text, Markdown, Bilder) bis 10 MB je Datei,
  5 je Notiz, 200 MB je Konto

### Wanderwege und Orte
- Ein Datenmodell für beide, unterschieden über `kind`
- Status „Möchte ich hin" / „War ich schon" mit Sterne-Bewertung und Besuchsdatum
- Wanderwege mit Länge, Höhenmetern, Dauer und Schwierigkeit
- Orte mit freier Kategorie und Vorschlagsliste
- Quelle als Link auf die Fundstelle
- Filter nach Suchbegriff, Land und Status; Gruppierung nach Land
- Sortierung nach Land, Name, Entfernung, Bewertung oder Zugang
- Umschaltbare Kartenansicht

### Reisen
- Zeitraum mit berechneter Dauer, Bewertung, Reisebericht
- Etappen mit Tagesangaben, Notiz und optionalem Kartenpunkt, umsortierbar
- Etappen optional mit einem gespeicherten Ort verknüpft
- Bilder als Cloud-Link statt Upload

### Karten und Entfernung
- Leaflet mit OpenStreetMap, lokal ausgeliefert statt vom CDN
- Luftlinie zu einem im Profil hinterlegten Heimatort, im Browser gerechnet
- Adresssuche über einen eigenen Nominatim-Proxy mit User-Agent und Drosselung
- Navigation per Google-Maps-Deep-Link, ohne API-Key

### Übersicht
- Globale Suche über alle Bereiche, Reisen auch über ihre Etappen
- Ziele in der Nähe von der Wunschliste
- Favoriten aus allen Bereichen

### Betrieb
- Mehrere Konten mit strikt getrennten Daten, Adminbereich
- Docker-Image mit Zwei-Stage-Build, Daten im Volume unter `/data`
- Offline lesbar; Schreibversuche ohne Netz werden deutlich abgelehnt
- 206 Tests, ohne Netzzugriff

### Abweichungen von der Vorlage
- Der Service Worker bedient lesende API-Aufrufe offline aus dem Cache statt
  mit einem harten 503 zu antworten — sonst wäre die App im Funkloch leer
- Modals bilden einen Stapel, damit der Standort-Picker das Formular darunter
  nicht verwirft
- Der API-Zwischenspeicher wird beim Kontowechsel geleert, weil der
  Cache-Schlüssel den Token nicht enthält
- `Referrer-Policy` weicht von Helmets Standard `no-referrer` ab: ohne Referer
  liefert OpenStreetMap statt Kartentiles ein „Access blocked"-Bild aus
- `TRUST_PROXY` für den Betrieb hinter einem Reverse Proxy — ohne diese
  Einstellung drosselt der Brute-Force-Schutz alle Nutzer gemeinsam
