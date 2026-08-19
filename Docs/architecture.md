# Architektur

## Überblick

Ein Node-Prozess liefert sowohl die statische PWA als auch die JSON-API aus.
Persistenz ist eine SQLite-Datei, Anhänge liegen als Dateien daneben. Kein
Build-Schritt, kein Framework im Frontend, ein Container.

```
Browser (PWA, ES-Module)
  │  fetch /api/**            Service Worker dazwischen:
  │                           statisch → stale-while-revalidate
  │                           GET /api → network-first + Cache-Rückfall
  ▼
Express (app.js)
  ├─ middleware/   auth (JWT), admin, upload (multer)
  ├─ routes/       auth, users, admin, meta, notes(+attachments), noteFolders,
  │                spots, trips, search, geo
  ├─ utils/        validate, ownership, countries, attachments, nominatim
  ▼
better-sqlite3 (synchron)  +  DATA_DIR/attachments/
```

`app.js` erzeugt die App ohne `listen`, `server.js` startet sie. Diese Trennung
existiert für die Tests: sie fahren die echte App auf einem ephemeren Port hoch,
statt Logik nachzubauen.

## Datenmodell

```
users ──┬─< note_folders ┈┈┈┈┈┈┈┈┈┐ (SET NULL)
        ├─< notes <────────────────┘
        │       └─< note_attachments
        ├─< spots <┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┈┐ (SET NULL)
        └─< trips ──< trip_stages ─┘
```

`users` trägt zusätzlich `home_label`, `home_lat`, `home_lng` — den Bezugspunkt
aller Entfernungsangaben.

### Eine Tabelle für Wanderwege und Orte

`spots` hält beide, unterschieden durch die zwei Kennzeichen `is_trail` und
`is_place`. Beide brauchen Name, Land, Region, Adresse, Koordinaten, Status,
Bewertung, Besuchsdatum, Quelle, Favorit und Entfernung — zwei Tabellen hätten
rund vierzehn Spalten sowie die komplette Query-, Filter-, Karten- und UI-Logik
dupliziert.

**Zwei Kennzeichen statt eines `kind`-Feldes**, weil ein Ziel beides sein kann:
die Drachenschlucht in Eisenach fährt man an *und* läuft sie ab. Ein
Diskriminator hätte diese ganze Kategorie — Schluchten, Wälder, Seen — zu einer
willkürlichen Entscheidung gezwungen. Ein `CHECK` erzwingt mindestens ein
gesetztes Kennzeichen, sonst wäre der Eintrag in keiner Liste sichtbar.

Aspektspezifisch sind nur:

| Aspekt | Felder |
|---|---|
| `is_trail` | `length_km`, `ascent_m`, `duration_min`, `difficulty` |
| `is_place` | `category` |

`routes/spots.js` leert beim Speichern die Felder nicht gesetzter Aspekte
(`FIELDS_BY_KIND`), damit kein Eintrag Werte trägt, die seine Ansicht nie zeigt.
Die Aspekte sind änderbar — ein falsch eingeordneter Eintrag lässt sich
korrigieren, statt ihn löschen und neu anlegen zu müssen. Nennt ein `PUT` beide
Kennzeichen nicht, bleiben die bestehenden erhalten; darauf verlässt sich der
Favoriten-Umschalter.

Der Query-Parameter `?kind=trail` filtert auf den *Aspekt*, nicht auf eine
ausschließliche Art: ein Doppel-Ziel erscheint in beiden Listen. Wo im Frontend
beide Listen zusammenlaufen (Übersicht, Etappen-Auswahl), entdoppelt
`allSpots()` in `state.js` über die ID.

Die Umstellung von `kind` auf die Kennzeichen erfolgt in `db.js` als
Neuaufbau-Migration: `kind` trägt eine `CHECK`-Bedingung, weshalb SQLite die
Spalte nicht per `ALTER TABLE` löschen kann. Die IDs bleiben erhalten, damit
`trip_stages.spot_id` weiter zeigt; ein `foreign_key_check` prüft das, bevor die
Fremdschlüssel wieder scharf werden.

### Reihenfolge in db.js

Die Datei läuft in genau dieser Ordnung ab, und die Reihenfolge ist nicht beliebig:

1. `db.exec(schema)` — legt fehlende Tabellen an. Bei einer bestehenden Datenbank
   ein no-op, das Schema von dort bleibt also zunächst alt.
2. `addColumnIfMissing` für einfache Nachrüstungen
3. Neuaufbau-Migrationen (`migrateSpotsToFlags`)
4. Nachrüstungen, die *nach* einem Neuaufbau greifen müssen — dessen
   `CREATE TABLE` kennt nur die Spalten von damals und würde eine vorher
   ergänzte wieder verwerfen
5. **Indizes auf nachgerüstete Spalten**, denn im Schema-Block von Schritt 1
   liefen sie vor dem `ALTER TABLE` und brächen mit „no such column" ab

Punkt 5 ist genau der Fehler, an dem der Start schon einmal abgebrochen ist.
Alle anderen Tests starten mit einer frischen Datenbank und können diese
Fehlerklasse nicht sehen; `tests/migration.test.js` baut deshalb eine Datenbank
im alten Schema auf und lädt `db.js` darauf.

### Status statt zweier Flags

`status IN ('wishlist','visited')` deckt „möchte ich hin" und „war ich schon" mit
einem Feld ab. Bewertung und Besuchsdatum gehören semantisch zu `visited` und
werden beim Zurücksetzen auf `wishlist` geleert — ein bewerteter, aber nicht
besuchter Ort wäre ein widersprüchlicher Zustand.

### Reise-Etappen

`trip_stages` speichert `day_from`/`day_to` statt konkreter Daten, weil Reisen so
beschrieben werden („Tag 1–4 Rom"). `sort_order` bestimmt die Reihenfolge.
`spot_id` verknüpft eine Etappe optional mit einem gespeicherten Ort; `ON DELETE
SET NULL` lässt die Etappe stehen, wenn der Ort verschwindet.

Beim Speichern werden Etappen komplett ersetzt statt zeilenweise abgeglichen —
bei einer Handvoll Einträgen pro Reise ist das einfacher und die Reihenfolge
stimmt danach garantiert. Fehlt `stages` im Request, bleiben die bestehenden
Etappen unberührt; das nutzt der Favoriten-Umschalter.

### Ordner für Notizen

`note_folders` ist eine eigene Tabelle, `notes.folder_id` zeigt darauf. Ein
Textfeld an der Notiz wäre weniger Code gewesen, aber ein Tippfehler hätte still
eine zweite Gruppe erzeugt — genau der Zustand, den die Gruppierung verhindern
soll. Der `UNIQUE`-Index über `(user_id, name)` mit `COLLATE NOCASE` schließt
zusätzlich aus, dass „Reisen" und „reisen" nebeneinander existieren.

`ON DELETE SET NULL` statt `CASCADE`: das Löschen eines Ordners darf keine
Notizen mitnehmen, sie fallen auf „Ohne Ordner" zurück. Zeigt der aktive Filter
auf einen verschwundenen Ordner, fällt `router.js` auf „Alle" zurück — sonst
bliebe die Liste dauerhaft leer.

Der Router hängt die Ordner unter `/api/note-folders` ein, nicht unter
`/api/notes/folders`: letzteres würde mit `/api/notes/:id` kollidieren und wäre
nur über die Registrierungsreihenfolge auseinanderzuhalten.

`GET /api/note-folders` liefert neben den Ordnern auch `total` und `unfiled`.
Diese Zahlen lassen sich im Frontend nicht ableiten, weil die Notizliste dort
schon gefiltert ist.

### Termine

`spots.planned_at` hält das geplante Datum eines Ziels. Es gehört zum Status
`wishlist`, so wie `visited_at` und `rating` zu `visited` gehören — ein
Statuswechsel räumt jeweils die andere Seite ab. Ein bewertetes, aber unbesuchtes
Ziel wäre ebenso widersprüchlich wie ein besuchtes, das noch geplant ist.

### Abgeleitete Werte

Die Reisedauer wird aus `start_date`/`end_date` berechnet, nicht gespeichert.
Entfernungen werden im Browser gerechnet. Beides hat damit genau eine Quelle.

### Datumsrechnung

`public/js/dates.js` bündelt sie, wie `geo.js` frei von DOM und State und
entsprechend direkt getestet. Alle Daten sind reine Kalendertage
(`JJJJ-MM-TT`) und werden als Zeichenketten beziehungsweise über
UTC-Mitternacht verglichen. Der Grund ist eine Klasse von Fehlern, die sonst
schwer zu finden ist: `new Date('2026-01-01')` liegt westlich von Greenwich auf
dem 31.12., und `toISOString()` liefert abends im Sommer bereits den Folgetag —
„heute" wäre dann falsch einsortiert.

## Zugriffstrennung

Mehrbenutzerbetrieb mit strikt getrennten Daten. Jede Abfrage filtert zusätzlich
über `user_id`; `utils/ownership.js` bündelt das in `findOwned(table, id, userId)`
mit einer Whitelist erlaubter Tabellen. Fremdzugriffe antworten mit **404**, nicht
403 — eine fremde ID soll nicht einmal ihre Existenz verraten.

Anhänge hängen als Unterressource unter `/api/notes/:noteId/attachments` und erben
die Prüfung der Notiz. Auch die Verknüpfung einer Reise-Etappe mit einem Ort wird
gegen den Besitzer geprüft und stillschweigend verworfen, wenn sie fremd ist.

`tests/routes/isolation.test.js` prüft das für jede Ressource und jede Methode.

## Eingabeprüfung und Fehler

`utils/validate.js` wirft bei ungültiger Eingabe eine `ValidationError`; die
Fehler-Middleware in `app.js` übersetzt sie zu einem 400 mit deutscher Meldung,
alles andere zu einem generischen 500. Dadurch bleiben die Routen flach und die
Fehlertexte an einer Stelle. Zusätzlich sichern `CHECK`-Constraints in der
Datenbank `kind`, `status` und die Bewertungsspanne ab.

Länder sind ISO-3166-Codes. Codes *und* deutsche Namen kommen aus
`Intl.DisplayNames` statt aus einer gepflegten Tabelle; `utils/countries.js`
blendet Zusammenschlüsse wie `EU` aus. Der Client holt die Liste über
`GET /api/meta/countries`.

## Anhänge

- Datei landet unter `DATA_DIR/attachments/<uuid><ext>`, der Originalname nur in
  der Datenbank. Ein hochgeladener Name kann damit keinen Pfad beeinflussen.
- `resolveStoredPath` prüft trotzdem, dass der aufgelöste Pfad das Verzeichnis
  nicht verlässt — zweite Verteidigungslinie.
- Erlaubt sind PDF, Word, ODT, Text, Markdown und Bilder. Geprüft werden
  MIME-Typ **und** Endung. HTML und SVG sind bewusst ausgeschlossen, weil sie
  Skript enthalten können.
- Limits: 10 MB je Datei, 5 Dateien je Notiz, 200 MB je Nutzer.
- multer dekodiert Dateinamen aus dem Multipart-Header als latin1;
  `decodeUploadFilename` dreht das nach UTF-8 zurück, sonst würde
  „Höhenprofil.txt" als „HÃ¶henprofil.txt" gespeichert.
- Ausgeliefert wird mit `nosniff` und `Content-Disposition: attachment`.
- `CASCADE` räumt beim Löschen einer Notiz oder eines Kontos nur die
  Datenbankzeilen; die Dateien entfernen `routes/notes.js` und `routes/admin.js`
  ausdrücklich.

## Karten, Entfernung, Geocoding

Bewusst ohne Google-Maps-API und ohne Abrechnungskonto:

- **Karte**: Leaflet mit OpenStreetMap-Tiles. Leaflet liegt lokal unter
  `public/vendor/leaflet/`, kopiert von `scripts/vendor-leaflet.js`. Kein CDN
  bedeutet: die CSP bleibt auf `'self'` und die App hängt nicht an der
  Verfügbarkeit eines Fremdhosts. Die OSM-Namensnennung ist Lizenzpflicht und
  darf nicht entfernt werden.
- **Entfernung**: Haversine-Luftlinie, clientseitig in `public/js/geo.js` gegen
  den Heimatort. Sofort, offline, kostenlos, und sortierbar ohne Serveraufruf.
  SQLite hat ohne Sonderbuild keine Trigonometrie — ein weiterer Grund für den
  Client.
- **Navigation**: Deep-Link `https://www.google.com/maps/dir/?api=1&destination=…`
  öffnet auf Android direkt Maps und braucht keinen Key.
- **Adresssuche**: Nominatim über `GET /api/geo/search`. Der Proxy ist nötig, weil
  Nominatim einen identifizierenden `User-Agent` verlangt, den ein Browser nicht
  setzen darf. Er hält den Mindestabstand von einer Sekunde ein, hält Ergebnisse
  24 Stunden im Speicher und ist nur angemeldet erreichbar — ein offener Proxy
  wäre fremdnutzbar.

## Offline

`public/sw.js` unterscheidet drei Fälle:

| Anfrage | Strategie |
|---|---|
| Statische Dateien | Stale-while-revalidate, Liste in `STATIC` |
| `GET /api/**` | Network-first, Antwort in `API_CACHE`, offline daraus mit Header `X-Wegzeichen-Offline: 1` |
| Schreibend `/api/**` | Nur Netz; offline `503 {offline:true}` |

Der Header ist der Grund, warum die App überhaupt zwischen frischen und
gespeicherten Daten unterscheiden kann: `api.js` meldet ihn über
`setCacheListener` an den State, die Views zeigen dann ein Banner.

**Kartentiles werden nicht gecacht.** OpenStreetMaps Tile-Policy verbietet
Vorab-Caching. Offline fehlt deshalb der Kartenhintergrund — die Daten,
Entfernungen und der Maps-Link nicht.

**Beim Kontowechsel wird `API_CACHE` geleert.** Der Cache-Schlüssel ist die URL
und enthält den Token nicht; ohne Leeren würde ein zweiter Nutzer offline die
Daten des ersten sehen. `api.js` erledigt das bei An- und Abmeldung.
`tests/public/sw.test.js` sichert ab, dass Cache-Name und Header-Name in `sw.js`
und `api.js` übereinstimmen und dass die Dateiliste zu den vorhandenen Dateien
passt.

## Frontend

Vanilla-ES-Module ohne Buildkette, aus AniGa übernommenes Muster:

| Modul | Aufgabe |
|---|---|
| `main.js` | Boot, globale Klick-Delegation, Logout, PWA-Install |
| `state.js` | Zentraler State, `homePoint()`, `countryName()` |
| `api.js` | Alle HTTP-Aufrufe, Offline-Erkennung, Cache-Leerung |
| `router.js` | View-Wechsel und Datenladen pro View |
| `shell.js` | Sidebar, Mobile-Header, Bottom-Navigation |
| `dom.js` | `$`, `esc`, Formatierung, Toast, Sterne, Zählwörter |
| `geo.js` | Haversine, Formatierung, Maps-Links, Gruppieren, Sortieren — reine Funktionen |
| `map.js` | Leaflet-Wrapper: Markerkarte und Punktauswahl |
| `markdown.js` | Notiztext zu gesäubertem HTML, Notiztext zu reinem Text |
| `markdown-input.js` | Textumformungen der Werkzeugleiste — reine Funktionen |
| `markdown-editor.js` | Eingabefeld mit Werkzeugleiste und Vorschau |
| `attachments.js` | Anhangsliste und Öffnen eines Anhangs |
| `modal.js` | Modal-**Stapel** und Bestätigungsdialog |
| `views/` | Eine Datei je Bereich, plus `partials.js` für gemeinsames Markup; `note.js` ist die Leseansicht einer Notiz |
| `modals/` | Formulare für Notiz, Ort/Weg, Reise und Standortauswahl |

### Modals als Stapel

`modal.js` verwaltet einen Stapel statt eines einzelnen Overlays. Das ist keine
Kosmetik: der Standort-Picker wird *aus* dem Orts- und Reiseformular geöffnet.
Würde er das darunterliegende Modal ersetzen, wären alle Eingaben verloren.
Jede Ebene bekommt einen höheren `z-index`, `closeModal()` schließt nur die
oberste, und der Picker begrenzt seine Selektoren auf sein eigenes Overlay.

### Eine View für zwei Bereiche

`views/spots.js` bedient Wanderwege *und* Orte, parametrisiert über `kind`.
Filter, Sortierung, Länder-Gruppierung, Kartenansicht und Entfernungsanzeige sind
identisch; unterschiedlich sind nur die angezeigten Kennzahlen. Die Filter
arbeiten im Browser auf der vollständig geladenen Liste — das wirkt sofort und
funktioniert offline. Die Serverfilter in `routes/spots.js` bleiben trotzdem
vorhanden und getestet.

`geo.js` ist frei von DOM- und State-Zugriffen und wird in
`tests/public/geo.test.js` per dynamischem Import direkt getestet — dieselbe
Datei, die der Browser lädt.

### Markdown in Notizen

Notizinhalt ist Markdown. Gerendert wird mit **marked**, gesäubert mit
**DOMPurify**; beide liegen als ESM-Build in `public/vendor` und kommen über
`npm run vendor:markdown` dorthin — dieselbe Begründung wie bei Leaflet: kein
CDN, damit die CSP bei `'self'` bleibt und kein Fremdhost die App aufhält.

`markdown.js` ist die **einzige** Stelle, an der aus Nutzertext Markup wird.
Wer Notizinhalt anzeigt, ruft `renderMarkdown()`; niemand setzt `note.body`
selbst als HTML ein. Die Säuberung arbeitet mit einer Positivliste: erlaubt ist,
was Markdown erzeugen kann, und nichts darüber hinaus. Rohes HTML im Notiztext
fällt damit weg.

Eine Falle steckt in `ALLOWED_URI_REGEXP`: DOMPurify prüft mit diesem Ausdruck
*jeden* Attributwert, nicht nur Adressen. Ein auf Schemata verengter Ausdruck
verwirft deshalb auch `target="_blank"` und `type="checkbox"` — die Verweise
öffnen dann nicht mehr in einem neuen Tab und Aufgabenlisten verlieren ihre
Kästchen. Der Ausdruck lässt schemalose Werte darum ausdrücklich durch.
`tests/public/markdown.test.js` deckt beide Richtungen ab.

Aufgeteilt ist die Umsetzung nach Zuständigkeit, nicht nach Ansicht:

- `markdown.js` rendert und säubert, und liefert mit `markdownToPlainText()`
  den Auszug für Listenkarten und Suchtreffer. Rohe Syntax wäre dort Rauschen,
  gerendertes HTML machte die Kartenhöhen unruhig.
- `markdown-input.js` enthält nur Textumformungen: Zustand des Eingabefelds
  hinein, neuer Zustand heraus. Frei von DOM und State und deshalb direkt
  testbar — dieselbe Linie wie bei `geo.js` und `dates.js`.
- `markdown-editor.js` ist die Oberfläche: Werkzeugleiste, Tastenkürzel
  (Strg+B, Strg+I, Strg+K) und der Umschalter Schreiben/Vorschau. Das Textfeld
  bleibt ein gewöhnliches `<textarea>` mit `name`, damit `FormData`
  unverändert funktioniert.

### Lesen und Bearbeiten getrennt

Eine Notiz zu **lesen** ist eine eigene View (`views/note.js`, `S.openNoteId`),
kein Modal: lange Texte liest man nicht in einem 520 Pixel breiten Dialog.
Bearbeitet wird weiter im Modal, das dafür `.modal-wide` trägt.

Die Leseansicht lädt die Notiz frisch statt sie aus `S.notes` zu nehmen — die
Liste führt keine Anhänge mit, und der Inhalt kann auf einem anderen Gerät
geändert worden sein. Ist die Notiz inzwischen gelöscht, fällt der Router auf die
Liste zurück statt eine Fehlerseite zu zeigen. `note` hat keinen eigenen
Navigationseintrag; `NAV_PARENT` in `shell.js` hält deshalb „Notizen" aktiv.

## Sicherheit

- Helmet mit CSP auf `'self'`; `https:` bei `img-src` ist für OSM-Tiles nötig
- `upgradeInsecureRequests` ist entfernt, damit Deployments über HTTP im LAN nicht brechen
- **`Referrer-Policy: strict-origin-when-cross-origin`** statt Helmets Standard
  `no-referrer`. OpenStreetMap verlangt laut Tile-Policy einen Referer und
  antwortet sonst mit „Access blocked" statt mit Kartenbildern. Gesendet wird
  nur die Herkunft, nie der Pfad. Die Policy steht zusätzlich als `<meta name="referrer">`
  in `index.html`, weil der Service Worker die Shell cacht und eine gecachte
  Antwort sonst die alte Kopfzeile mitschleppen würde.
  `tests/routes/headers.test.js` sichert beides ab.
- JWT mit `token_version`: eine Passwortänderung macht alle übrigen Sitzungen ungültig
- Anmeldung ist auf 10 Fehlversuche pro IP und 15 Minuten gedrosselt, mit
  Timing-Ausgleich gegen das Erraten registrierter E-Mail-Adressen
- **`TRUST_PROXY`** entscheidet, ob `X-Forwarded-For` als echte Client-Adresse
  gilt. Hinter einem Reverse Proxy ist der Wert Pflicht, sonst landen alle
  Nutzer im selben Rate-Limit-Eimer; ohne Proxy muss er leer bleiben, sonst
  wäre die Drosselung per gefälschtem Header umgehbar. Bewusst keine Vorgabe
  auf `true`. `tests/routes/proxy.test.js` prüft die Trennung nach Adresse.
- Der Geocoding-Proxy ist zusätzlich auf 30 Anfragen pro Nutzer und Minute gedrosselt
- `optionalUrl` erlaubt nur `http`/`https` — `javascript:` und `data:` wären als
  Link im Frontend ein XSS-Vektor
- Jede Ausgabe von Nutzerinhalten läuft durch `esc()`

## Bewusst nicht umgesetzt

- **Offline-Schreiben mit Sync-Queue**: kostet Konfliktauflösung und deutlich mehr
  Komplexität. Der Bedarf war Lesen im Funkloch, nicht Schreiben.
- **FTS5-Volltextsuche**: `LIKE` genügt bei den Datenmengen einer privaten
  Sammlung. Die Suche über Reise-Etappen ist bereits enthalten.
- **Tile-Caching für Offline-Karten**: verstößt gegen OSMs Nutzungsbedingungen.
- **Bild-Upload**: Reisen verlinken bewusst auf ein Cloud-Album.
