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
  ├─ middleware/   auth (JWT), admin, owned (Besitz + 404), upload (multer)
  ├─ routes/       auth, users, admin, meta, notes(+attachments), noteFolders,
  │                spots, trips, search, geo
  ├─ utils/        validate, ownership, countries, attachments, nominatim
  ├─ db.js         Verbindung und Startreihenfolge
  ├─ db/           schema, migrations (nummeriert), seed
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
entsprechend direkt getestet. Dort liegen zwei Sorten, die nicht vermischt werden
dürfen.

**Kalendertage** (`JJJJ-MM-TT`) — Besuchsdatum, geplanter Termin, Reisedaten.
Sie werden als Zeichenketten beziehungsweise über UTC-Mitternacht verglichen. Der
Grund ist eine Klasse von Fehlern, die sonst schwer zu finden ist:
`new Date('2026-01-01')` liegt westlich von Greenwich auf dem 31.12., und
`toISOString()` liefert abends im Sommer bereits den Folgetag — „heute" wäre
dann falsch einsortiert.

**Zeitpunkte** (`created_at`, `updated_at`) — echte Momente, für die `Date` das
richtige Werkzeug ist. Sie kommen aus SQLite und tragen die Form
`JJJJ-MM-TT HH:MM:SS`: UTC, aber ohne Kennzeichen. Genau darin lag ein Fehler,
der lange unbemerkt blieb, weil er in UTC nicht auftritt — `new Date()` liest so
eine Zeichenkette nach ECMAScript als *lokale* Zeit, und eine gerade gespeicherte
Notiz war in Berlin damit sofort „vor 2 Std." alt. `parseTimestamp()` ergänzt die
Zone vor dem Parsen; Zeichenketten, die schon eine tragen, bleiben unberührt.

Deshalb liegt auch `timeAgo()` hier und nicht mehr in `dom.js`: es rechnet mit
Daten, ist ohne DOM prüfbar, und sein Rückfall auf ein Datum schreibt zweistellig
wie `formatDate()` statt über `toLocaleDateString`. Die Tests in
`tests/public/dates.test.js` laufen bewusst zeitzonenunabhängig — sie bauen den
Zeitstempel aus dem aktuellen Moment und bestehen unter Berlin, Los Angeles,
Tokio und Kiritimati gleichermaßen.

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

### Anmeldedaten

Benutzername, E-Mail und Passwort werden ebenfalls in `utils/validate.js`
geprüft (`username()`, `email()`, `password()`) und nicht in der Route. Vorher
standen die Grenzen zweimal im Code — bei der Registrierung und bei der
Profiländerung — mit unterschiedlichem Wortlaut in den Meldungen.

Zwei Feinheiten stecken dort:

- `email()` gibt die Adresse in Kleinschreibung zurück. Sie ist der
  Anmeldeschlüssel und muss überall in derselben Form gespeichert und verglichen
  werden, sonst hängt die Anmeldung davon ab, wie jemand tippt.
- `password()` trimmt **nicht**. Ein getrimmtes Passwort wäre ein anderes als
  das eingegebene; der Nutzer käme beim nächsten Anmelden nicht mehr herein.
  Deshalb prüft es auch nicht über `isBlank`, das Whitespace als leer wertet.

Die Anmeldung selbst prüft das Adressformat absichtlich nicht: sie soll bei
falschen Daten immer gleich antworten. Bei einer Profiländerung landen nur
tatsächlich geänderte Werte im `UPDATE` — das Formular schickt immer alle Felder
mit, und ein unveränderter Benutzername würde am UNIQUE-Index scheitern. Welche
Spalten überhaupt geschrieben werden dürfen, sagt `PROFILE_COLUMNS`; das
Statement wird über diese Liste gebaut, nie über die Schlüssel des Requests.

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

## Markdown auch außerhalb der Notizen

Die Notizen eines Ortes (5.000 Zeichen) und der Reisebericht (20.000 Zeichen)
nutzen denselben Editor wie eine Notiz — Werkzeugleiste, Tastenkürzel und
Vorschau kommen unverändert aus `markdown-editor.js`.

Gerendert wird, wo es eine Leseansicht gibt: der Reisebericht im Detaildialog
einer Reise. Ein Ziel hat keinen Detaildialog — ein Klick auf die Karte öffnet
dort das Formular —, deshalb ist die Vorschau im Editor die einzige Stelle, an
der seine Notizen gerendert erscheinen. Wer das ändern will, braucht für Ziele
eine Leseansicht wie `views/note.js`; das ist eine Funktion, kein Umbau.

In den Listenauszügen steht in beiden Fällen Text ohne Syntax
(`markdownToPlainText`). Die Suche in `views/spots/filters.js` arbeitet weiter
auf dem Rohtext — wer „Parkplatz" sucht, findet ihn auch in einer Aufzählung.

## Stile ohne 'unsafe-inline'

Das Markup nutzt keine `style`-Attribute, sondern Klassen aus `style.css`.
Dadurch kommt die CSP ohne `style-src 'unsafe-inline'` aus — und genau das ist
die Schranke, die eine Lücke im Säubern von gerendertem Markdown erst schwer
ausnutzbar macht: ein eingeschmuggeltes `style`-Attribut bliebe wirkungslos.

Zuweisungen über `element.style` aus JavaScript sind davon nicht betroffen; die
CSP verbietet Inline-Stile im Markup, nicht das CSSOM. Der `z-index` einer
Modal-Ebene entsteht deshalb weiter dort, ebenso Leaflets Kartenpositionierung
und das Ausblenden eines Toasts.

Ersetzt wurden 46 Attribute durch wenige benannte Klassen: vier Hilfsklassen für
wiederkehrende Layoutfälle (`u-grow`, `u-shrink`, `u-full`, `u-inline-row`),
`is-hidden` für umgeschaltete Sichtbarkeit — die vorher als
`style="display:none"` im Markup *und* als `style.display` im Code stand und
jetzt an beiden Stellen dieselbe Klasse ist — und für den Rest Klassen am
jeweiligen Baustein. `tests/routes/headers.test.js` prüft die Kopfzeile,
`tests/public/accessibility.test.js` schlägt fehl, sobald ein `style`-Attribut
ins Markup zurückkommt.

## Nutzerverwaltung

Zwei Eingriffe mit großer Wirkung: ein Konto löschen und ein Passwort setzen.
Beide gehen durch `loadTargetUser()` in `routes/admin.js`, das die gemeinsamen
Grenzen an einer Stelle zieht:

- Das **eigene** Konto ist hier nicht das Ziel. Gelöscht wird es gar nicht, und
  das eigene Passwort ändert man über das Profil — dort ist das aktuelle
  Passwort Pflicht, hier wäre es keins.
- Das Konto eines **anderen Admins** ist tabu. Beim Löschen galt das immer, beim
  Passwort fehlte die Grenze: über eine geratene ID ließ sich ein zweiter Admin
  aussperren, obwohl die Nutzerliste Administratoren gar nicht anzeigt.
- Ein gesetztes Passwort erhöht `token_version` und wirft damit alle Sitzungen
  des Nutzers weg — sonst bliebe ein bereits angemeldetes Gerät drin.

`GET /api/admin/users` listet nur Konten mit `is_admin = 0` und liefert Zahlen
statt Inhalte. Ein Admin sieht also nie Notizen, Ziele oder Reisen anderer.

`tests/routes/admin.test.js` deckt beide Eingriffe ab, inklusive der Zusage, dass
mit dem Konto auch die Anhangsdateien von der Platte verschwinden. Den Admin für
diese Tests legt `registerAdmin()` in `tests/helpers/setup.js` über die Datenbank
an: einen Weg, sich selbst zum Admin zu machen, gibt es in der API bewusst nicht.

## Datenbankstart

`db.js` ist die Verbindung und die Reihenfolge, nichts weiter: öffnen, Schema,
Migrationen, Admin-Seed. Die drei Schritte liegen in `db/`:

| Datei | Aufgabe |
|---|---|
| `db/schema.js` | Tabellen und Indizes im heutigen Stand, idempotent |
| `db/migrations.js` | nummerierte Schritte für bestehende Datenbanken |
| `db/seed.js` | Admin nur, wenn `ADMIN_PASSWORD` gesetzt ist |

Der Stand steht in `PRAGMA user_version`; erledigte Schritte werden beim nächsten
Start übersprungen statt jedes Mal alle Spalten abzuklopfen. Jeder Schritt bleibt
trotzdem für sich idempotent — bestehende Datenbanken tragen `user_version = 0`,
obwohl ihr Schema schon vollständig sein kann. Erst nach dem ersten Durchlauf ist
die Zählung verlässlich.

Die Reihenfolge innerhalb der Liste zählt, und zwar aus zwei Gründen: der
Neuaufbau von `spots` kennt nur die Spalten von damals und würde eine vorher
ergänzte wieder verwerfen, und ein Index auf eine nachgerüstete Spalte scheitert,
wenn er vor dem `ALTER TABLE` läuft. Ein veröffentlichter Schritt behält deshalb
seine Nummer; neue kommen ans Ende.

Geprüft wird das zweifach: `tests/migration.test.js` startet die echte App gegen
eine Datenbank im alten Schema, `tests/db/migrations.test.js` prüft Schema,
Versionszählung und Seed einzeln gegen eine Datenbank im Speicher — das ist erst
möglich, seit die Schritte reine Funktionen über einem Handle sind.

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
| `router.js` | View-Wechsel (`navigate`) und Neuzeichnen ohne Spinner (`refresh`) |
| `shell.js` | Sidebar, Mobile-Header, Bottom-Navigation |
| `dom.js` | `$`, `esc`, Formatierung, Toast, Sterne, Zählwörter |
| `geo.js` | Haversine, Formatierung, Maps-Links, Gruppieren, Sortieren — reine Funktionen |
| `dates.js` | Kalendertage und Zeitpunkte, `parseTimestamp()`, `timeAgo()` — reine Funktionen |
| `map.js` | Leaflet-Wrapper: Markerkarte und Punktauswahl |
| `markdown.js` | Notiztext zu gesäubertem HTML, Notiztext zu reinem Text |
| `markdown-input.js` | Textumformungen der Werkzeugleiste — reine Funktionen |
| `markdown-editor.js` | Eingabefeld mit Werkzeugleiste und Vorschau |
| `attachments.js` | Anhangsliste und Öffnen eines Anhangs |
| `views/entryActions.js` | Knöpfe und Verhalten einer Eintragskarte: öffnen, bearbeiten, Favorit, löschen |
| `modal.js` | Modal-**Stapel** und Bestätigungsdialog |
| `views/` | Eine Datei je Bereich, plus `partials.js` und `entryActions.js`; `note.js` liest eine Notiz |
| `views/spots/` | Teile der Ziel-Ansicht: `meta.js`, `filters.js`, `card.js` |
| `modals/` | Formulare für Notiz, Ort/Weg, Reise und Standortauswahl |

### Wechseln und Neuzeichnen sind zwei Dinge

`router.js` trennt Laden (`loadView`) und Zeichnen (`paintView`). Darauf sitzen
zwei Einstiegspunkte:

- `navigate(view)` wechselt die Ansicht: Ladeindikator, Daten holen, zeichnen.
- `refresh()` bleibt in der Ansicht: Daten holen, zeichnen. Kein Spinner.

Der Unterschied ist keine Kosmetik. Vorher rief jede Änderung an einem Eintrag
`navigate()`: ein Klick auf den Stern ersetzte die Liste erst durch einen
Spinner, wodurch der Inhalt auf die Höhe des Indikators zusammenfiel und die
Scrollposition verloren war. Wer in einer langen Liste weit unten einen Favoriten
setzte, landete wieder oben. Mit `refresh()` bleibt das Markup stehen, bis das
neue fertig ist.

Die Sortierung bleibt dabei beim Server. Sie lokal nachzubilden — Favoriten oben,
dann nach Änderungsdatum — hätte die Reihenfolge an zwei Stellen definiert; ein
Eintrag, der zum Favoriten wird, wandert deshalb weiterhin über die Serverantwort
nach oben. `views/spots.js` behält zusätzlich sein eigenes `rerender(kind)`: dort
arbeiten Filter, Sortierung und Kartenansicht ohnehin auf der vollständig
geladenen Liste und brauchen den Server nicht.

### Modals als Stapel

`modal.js` verwaltet einen Stapel statt eines einzelnen Overlays. Das ist keine
Kosmetik: der Standort-Picker wird *aus* dem Orts- und Reiseformular geöffnet.
Würde er das darunterliegende Modal ersetzen, wären alle Eingaben verloren.
Jede Ebene bekommt einen höheren `z-index`, `closeModal()` schließt nur die
oberste, und der Picker begrenzt seine Selektoren auf sein eigenes Overlay.

Jede Ebene ist zugleich ein echter Dialog:

- `role="dialog"` mit `aria-modal="true"`, benannt über die eigene Überschrift.
  Ohne `aria-labelledby` sagt ein Screenreader beim Öffnen nur „Dialog".
- Der Fokus wandert in das erste Eingabefeld — bewusst nicht auf einen Knopf, im
  Bestätigungsdialog wäre das „Löschen". Gibt es kein Feld, bekommt der Dialog
  selbst den Fokus (`tabindex="-1"`) und sein Titel wird vorgelesen.
- Der Tabulator bleibt in der obersten Ebene. Ohne diese Falle läuft der Fokus
  hinter dem Overlay durch die Seite, während der Dialog offen ist — sichtbar
  ist er dann nirgends.
- Beim Schließen kehrt der Fokus zum auslösenden Element zurück. Ist das
  verschwunden, weil die Ansicht nach dem Speichern neu gezeichnet wurde,
  übernimmt die Ebene darunter.

Escape und Tab hängen an *einem* Listener auf `document`, der immer die oberste
Ebene des Stapels bedient.

### Namen für Icon-Bedienelemente

Ein Knopf, der nur ein Icon zeigt, wird ohne Namen als „Schaltfläche"
vorgelesen. `title` genügt dafür nicht — er ist ein Tooltip für die Maus und
wird je nach Programm gar nicht ausgegeben. Alle Icon-Knöpfe tragen deshalb
zusätzlich ein `aria-label`.

`tests/public/accessibility.test.js` hält das offen: der Test liest den
Quelltext und verlangt, dass jedes Bedienelement mit `title` auch ein
`aria-label` hat. Ein DOM steht dort nicht zur Verfügung, weil die Knöpfe in
Template-Zeichenketten entstehen — dieselbe Linie wie bei `sw.test.js`.

### Eine View für zwei Bereiche

`views/spots.js` bedient Wanderwege *und* Orte, parametrisiert über `kind`.
Die Datei ist der Rahmen; die Teile liegen daneben in `views/spots/`:
`meta.js` (was die Arten unterscheidet, Sortierwahl), `filters.js` (Filterleiste
und Ableitung der sichtbaren Liste) und `card.js` (Eintragskarte mit ihren
Kennzahl-Chips). `filters.js` bekommt `rerender` als Parameter herein, statt es
zu importieren — sonst hingen Rahmen und Teil gegenseitig aneinander.
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

Geprüft wird das an der echten Funktion: `tests/public/markdown.test.js` baut mit
**jsdom** ein Dokument, bevor es `markdown.js` lädt — DOMPurify bindet beim Laden
das globale `window` und wäre ohne eines abgeschaltet. Der Test verlangt beide
Richtungen: Skript, Event-Attribute, `javascript:`, `iframe`, `form` und
`style` verschwinden, während Überschriften, Tabellen, Zitate, relative Ziele,
`mailto:`, `target="_blank"` und die Kästchen der Aufgabenlisten erhalten
bleiben. Vorher stand dort nur eine Prüfung der Konfiguration im Quelltext, die
eine kaputte Säuberung nicht bemerkt hätte.

Zwei Grenzen sind dabei bewusst festgehalten: `ftp:`, `vbscript:` und `xmpp:`
verlieren ihr Ziel, ein Bild als `data:`-URL darf dagegen bleiben — ein Bild
führt keinen Code aus, und die CSP lässt `data:` für Bilder ohnehin zu.

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

### Nur das Kennzeichen umschalten

Es gibt kein PATCH auf den Ressourcen, ein `PUT` ersetzt den ganzen Datensatz.
Für den Stern in der Liste war das gefährlich: das Frontend baute den vollen
Datensatz aus `S` neu zusammen und schickte ihn zurück. Kam die Liste aus dem
Offline-Cache, überschrieb ein Klick auf den Stern den neueren Serverstand mit
der veralteten Kopie — und wer dem Modell ein Feld hinzufügte, musste daran
denken, es in drei Views mitzuschicken.

Stattdessen gibt es `PUT /api/<ressource>/:id/favorite`. Die Route fasst nur
`is_favorite` und `updated_at` an; Etappen einer Reise, Aspekte eines Ziels und
der Ordner einer Notiz bleiben unberührt, weil die Route sie nicht kennt.
`setFavoriteOwned()` in `utils/ownership.js` ist die einzige Stelle, die das
schreibt. Bewusst keine allgemeine PATCH-Route: bei den Zielen müsste sie
`FIELDS_BY_KIND` beim Mischen mitdenken, und der einzige Bedarf ist heute
dieser eine Schalter.

### Zugriffsprüfung als Middleware

`middleware/owned.js` ersetzt ein Vorspiel, das vorher sechzehnmal wörtlich in
den Routen stand: ID prüfen, Besitz prüfen, sonst 404. `loadOwned('spots',
'Eintrag nicht gefunden')` legt den Eintrag auf `req.entity` — oder unter einem
eigenen Namen, wie `req.note` bei den Anhängen. Wer mehr als die Tabellenzeile
braucht, gibt ein eigenes `load` mit; die Notiz kommt so mit dem Namen ihres
Ordners. Die Whitelist der nutzerbezogenen Tabellen greift weiterhin, und zwar
schon beim Bauen der Middleware statt erst bei der ersten Anfrage.

### Eine Aktionsleiste für alle Eintragslisten

`toggleFavorite` und `confirmDelete` lagen in vier Views nebeneinander:
Notizen, Leseansicht, Ziele und Reisen. Gleich waren Bestätigungsdialog,
Erfolgsmeldung und Fehlerpfad; unterschiedlich nur die Beschriftungen und die
API-Aufrufe. `views/entryActions.js` nimmt beides als Parameter —
`setFavorite`, `remove`, `describeDeletion`, `onDone` und für die Leseansicht
zusätzlich `onRemoved`, weil sie den gelöschten Eintrag nicht neu laden darf.
Die Knopf-Bausteine liefern gleich `aria-label` mit, damit reine Icon-Knöpfe
nicht namenlos bleiben.

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
