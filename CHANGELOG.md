# Changelog

## 0.2.0 — 2026-08-19

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
- **Die Markdown-Säuberung ist echt getestet.** `jsdom` als devDependency, damit
  `renderMarkdown()` in den Tests wirklich läuft: eingeschmuggeltes Skript,
  Event-Attribute, `javascript:`-Verweise, `iframe`, `form` und `style`
  verschwinden — und die erlaubte Auszeichnung samt `target="_blank"` und den
  Kästchen der Aufgabenlisten bleibt. Vorher war nur die Konfiguration im
  Quelltext geprüft, was eine kaputte Säuberung nicht bemerkt hätte.
- `tests/routes/admin.test.js` und `tests/routes/users.test.js`: die
  Nutzerverwaltung war bisher nur daraufhin geprüft, dass sie Unbefugte abweist.
  Jetzt auch, dass Kontolöschung die Anhangsdateien von der Platte räumt, dass
  ein gesetztes Passwort alle Sitzungen beendet und dass der Heimatort dort
  ankommt, wo das Frontend ihn erwartet.
- **Termine für geplante Ziele.** Ein Ziel auf der Wunschliste kann ein Datum
  „Geplant für" tragen. Neuer Abschnitt „Nächste Termine" auf der Übersicht:
  geplante Ziele und noch laufende Reisen chronologisch, mit „heute", „morgen"
  oder „in 5 Tagen". Verstrichene Termine bleiben sichtbar und sind als
  überfällig gekennzeichnet. Zusätzliche Sortierung nach geplantem Datum.
- `public/js/dates.js` bündelt die Datumsrechnung als reines, testbares Modul.

### Geändert
- **Markdown auch für Ortsnotizen und Reisebericht.** Beide Felder nutzen den
  Editor der Notizen samt Vorschau; der Reisebericht wird im Detaildialog
  gerendert, Listenauszüge zeigen Text ohne Syntax. Ein Ziel hat keinen
  Detaildialog, dort bleibt die Vorschau im Editor die Leseansicht.
- **`views/spots.js` ist aufgeteilt.** Der Rahmen bleibt, die Teile liegen in
  `views/spots/`: `meta.js`, `filters.js`, `card.js`.
- **Altlasten aus der AniGa-Vorlage entfernt.** 36 Klassen, die im Markup nie
  vorkamen (Kartenraster, Fortschrittsbalken, Zahlenfeld, Profil-Kopf,
  Seitenblätterung, zehn Hilfsklassen) — `style.css` ist damit von 2245 auf 2026
  Zeilen geschrumpft. Behalten wurde, was zur Laufzeit zusammengesetzt wird
  (`s-${status}`, `t-${type}`) und was Leaflet selbst erzeugt. Dazu drei ungenutzte
  Exporte (`closeAllModals`, `bindStatusTabs`, `isMapAvailable` nach außen) und
  `JWT_SECRET`, das an die Auth-Middleware gehängt war, ohne gelesen zu werden.
- **Eine Änderung lässt die Ansicht stehen.** `router.js` trennt Laden und
  Zeichnen; nach dem Umschalten eines Favoriten, dem Löschen, dem Speichern und
  beim Wechsel eines Ordnerfilters wird neu gezeichnet, ohne die Liste vorher
  durch einen Spinner zu ersetzen. Damit bleibt die Scrollposition erhalten —
  vorher landete man nach einem Sternklick weit unten in der Liste wieder oben.
  Auch die Notizsuche flackert nicht mehr bei jedem Tastendruck.
- **Die CSP verbietet jetzt Inline-Styles.** Die 46 `style`-Attribute im Markup
  sind Klassen gewichen, `style-src 'unsafe-inline'` ist aus `app.js`
  verschwunden. Ein aus einer Notiz eingeschmuggeltes `style`-Attribut ist damit
  wirkungslos. `element.style` aus JavaScript bleibt unberührt.
- **`db.js` ist aufgeteilt.** Verbindung und Startreihenfolge bleiben dort,
  Schema, Migrationen und Admin-Seed liegen in `db/`. Die Migrationen sind
  nummeriert und merken sich ihren Stand in `PRAGMA user_version`, statt bei
  jedem Start alle Spalten abzuklopfen. Neu: `tests/db/migrations.test.js`.
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
- **Dialoge sind Dialoge.** Jede Modal-Ebene trägt `role="dialog"` mit
  `aria-modal` und wird über ihre Überschrift benannt. Der Fokus wandert beim
  Öffnen hinein, bleibt mit Tab darin und kehrt beim Schließen zum auslösenden
  Knopf zurück. Im Bestätigungsdialog landet er bewusst nicht auf „Löschen".
- **Icon-Knöpfe haben Namen.** 34 Bedienelemente hatten nur einen `title` oder
  gar nichts und wurden als „Schaltfläche" vorgelesen — darunter alle
  Schließen-Knöpfe der Modals, die Markdown-Werkzeugleiste und der Suchknopf.
  `tests/public/accessibility.test.js` hält das offen.
- **Das Aufziehen mit zwei Fingern ist nicht mehr gesperrt.** `user-scalable=no`
  und `maximum-scale` sind aus dem Viewport verschwunden (WCAG 1.4.4). Damit iOS
  beim Fokus in ein Feld nicht selbst hineinzoomt, sind Eingabefelder auf
  schmalen Schirmen 16 Pixel groß.
- **Ein Admin kann das Konto eines anderen Admins nicht mehr übernehmen.**
  `PUT /api/admin/users/:id/password` verweigerte bisher — anders als das Löschen —
  kein Admin-Konto; über eine geratene ID ließ sich damit ein zweiter Admin
  aussperren. Beide Eingriffe teilen jetzt dieselbe Prüfung und lehnen auch das
  eigene Konto ab. Die Passwortprüfung dort läuft über `utils/validate.js`.
- **`routes/auth.js` prüft nicht mehr von Hand.** Benutzername, E-Mail und
  Passwort gehen durch `utils/validate.js`; die Grenzen stehen damit einmal statt
  zweimal im Code. Die Behandlung des UNIQUE-Konflikts liegt in einer Funktion
  statt zweimal wörtlich in der Datei. E-Mail-Adressen werden einheitlich klein
  gespeichert, Passwörter weiterhin ungetrimmt.
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

### Behoben
- **Frische Einträge zeigten „vor 2 Std." statt „Gerade eben".** SQLite schreibt
  `created_at`/`updated_at` in UTC, aber ohne Zeitzonenkennzeichen; `new Date()`
  las die Form als lokale Zeit. Der Versatz entsprach genau dem Abstand zur
  Zeitzone — in UTC gab es ihn nicht, weshalb er lange unbemerkt blieb. Neu ist
  `parseTimestamp()` in `dates.js`, das die Zone ergänzt und Zeitstempel, die
  schon eine tragen, unberührt lässt. Betroffen waren Notizkarten, Leseansicht,
  Favoriten, Suchtreffer und das Registrierungsdatum in der Nutzerverwaltung.
- `timeAgo()` liegt jetzt in `dates.js` statt in `dom.js` — es rechnet mit Daten
  und ist dort ohne DOM testbar. Sein Rückfall auf ein Datum schreibt zweistellig
  wie `formatDate()`, vorher stand dort „20.7.2026" neben „20.07.2026".

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
