# CLAUDE.md

Hinweise für Claude Code zur Arbeit an diesem Repository.

## Befehle

```bash
npm run dev                                  # Entwicklungsserver mit nodemon
npm start                                    # Produktivstart
npm test                                     # Alle Tests (node --test)
npm run vendor:leaflet                       # Leaflet nach public/vendor kopieren
npm run vendor:markdown                      # marked und DOMPurify nach public/vendor kopieren
node --test "tests/routes/isolation.test.js" # Einzelne Datei
docker compose up --build -d                 # Container bauen und starten
```

## Aufbau

Express + better-sqlite3 + Vanilla-JS-ESM-PWA, ein Container, kein Build-Schritt.
Portiert vom Muster in `../AniGa`, inklusive Farbschema.

```
app.js       Express-App ohne listen (damit Tests sie hochfahren können)
server.js    Start
db.js        Verbindung und Startreihenfolge
db/          schema, migrations (nummeriert über PRAGMA user_version), seed
middleware/  auth (JWT), admin, owned (Besitz + 404), upload (multer)
routes/      auth, users, admin, meta, notes(+attachments), noteFolders,
             spots, trips, search, geo
utils/       validate, ownership, countries, attachments, nominatim
public/js/   state, api, router, shell, dom, geo, dates, map, modal,
             markdown(+-input, -editor), attachments + views/ + modals/
             views/entryActions.js: Favorit und Löschen aller Eintragslisten
             views/spots/: meta, filters, card — Teile der Ziel-Ansicht
```

Details und Begründungen stehen in [Docs/architecture.md](Docs/architecture.md).

## Regeln, die beim Ändern zählen

**Jede Abfrage auf nutzerbezogene Daten filtert über `user_id`.** Dafür gibt es
`findOwned()` in `utils/ownership.js`. Fremdzugriffe antworten mit 404, nicht 403.
`tests/routes/isolation.test.js` deckt jede Ressource und Methode ab — dieser Test
darf nie ausgedünnt werden.

**Lange Texte gehören in den Markdown-Editor.** Notizinhalt, Ortsnotizen und
Reisebericht nutzen `markdownEditorHtml()` und `bindMarkdownEditor()`; angezeigt
wird über `renderMarkdown()`, in Listenauszügen über `markdownToPlainText()`.
Ein neues Langtextfeld macht es genauso, statt ein nacktes `<textarea>` zu setzen.

**Wanderwege und Orte teilen die Tabelle `spots`.** Ein Eintrag trägt die
Kennzeichen `is_trail` und `is_place` und darf beide haben (Drachenschlucht:
Ort *und* Weg). Neue aspektspezifische Felder gehören in `FIELDS_BY_KIND` in
`routes/spots.js`, damit sie ohne den Aspekt geleert werden. `views/spots.js`
bedient beide — nicht duplizieren. Wo beide Listen zusammenlaufen, über
`allSpots()` aus `state.js` entdoppeln.

**Eingriffe in fremde Konten nur über `loadTargetUser()` in `routes/admin.js`.**
Es zieht die Grenzen für Löschen *und* Passwortsetzen: nicht das eigene Konto,
niemals das eines anderen Admins. Eine neue Adminroute mit `:id` hängt sich dort
ein, statt die Prüfung zu wiederholen.

**Zugriffsprüfung über `loadOwned` aus `middleware/owned.js`**, nicht von Hand
in der Route. Die Middleware prüft ID und Besitzer und legt den Eintrag auf
`req.entity` (oder unter eigenem Namen, siehe `req.note` bei den Anhängen).
Fremdzugriffe bleiben 404, nicht 403.

**Den Favoriten nur über `PUT /:id/favorite` umschalten.** Ein `PUT` auf die
Ressource ersetzt alles; schickt das Frontend dafür seinen eigenen Stand zurück,
überschreibt es bei einem Offline-Cache-Treffer den neueren Serverstand. Im
Frontend heißt der Weg `API.<ressource>.setFavorite(id, flag)`.

**Favorit und Löschen einer Eintragskarte kommen aus `views/entryActions.js`.**
Vier Views hatten das vorher je selbst. Wer eine neue Liste baut, nimmt
`favButtonHtml`, `editButtonHtml`, `deleteButtonHtml` und `bindEntryActions` —
dort stecken auch die `aria-label` der Icon-Knöpfe.

**Titel und Text von `renderEmptyState()` werden intern escaped.** Nicht noch
einmal `esc()` davorsetzen, sonst stehen `&amp;quot;` in der Meldung. HTML nimmt
nur der letzte Parameter `btnHtml`.

**`user-scalable=no` gehört nicht zurück in den Viewport.** Das sperrt das
Aufziehen mit zwei Fingern. Damit iOS beim Fokus in ein Feld nicht selbst zoomt,
sind Eingabefelder unter 540px 16px groß — diese Regel in `style.css` muss
bleiben, sonst kommt das Zoomen beim Tippen zurück.

**Notiztext wird nur über `markdown.js` zu HTML.** Der Inhalt einer Notiz ist
Markdown und Nutzertext zugleich. `renderMarkdown()` rendert mit marked und
säubert mit DOMPurify gegen eine Positivliste — wer `note.body` anderswo als
HTML einsetzt, öffnet ein XSS-Loch. Für Auszüge in Listen und Suchtreffern gibt
es `markdownToPlainText()`.

**`ALLOWED_URI_REGEXP` prüft bei DOMPurify jeden Attributwert, nicht nur
Adressen.** Ein auf `^(?:https?|mailto|tel):` verengter Ausdruck wirft
lautlos auch `target="_blank"` und `type="checkbox"` weg: Verweise öffnen
dann im selben Tab, Aufgabenlisten verlieren ihre Kästchen. Die schemalosen
Zweige im Ausdruck müssen bleiben. `tests/public/markdown.test.js` sichert das ab.

**Die Säuberung wird an der echten Funktion getestet, nicht am Quelltext.**
`tests/public/markdown.test.js` baut mit `jsdom` ein Dokument, **bevor** es
`markdown.js` importiert — DOMPurify bindet das globale `window` beim Laden und
ist ohne eines abgeschaltet (`isSupported: false`, kein `sanitize`). Wer dort
Tests ergänzt, muss diese Reihenfolge einhalten.

**marked und DOMPurify liegen vendort in `public/vendor`.** Nach einem
`npm install` in einer frischen Arbeitskopie `npm run vendor:markdown` laufen
lassen, sonst fehlen die Dateien — kein CDN, das würde die CSP aufweichen.
Der Dockerfile macht das selbst.

**`public/js/markdown-input.js` bleibt frei von DOM und State.** Wie `geo.js`
und `dates.js` wird es direkt getestet; ein Zugriff auf `document` bricht das.

**Neue Frontend-Datei? In `STATIC` in `public/sw.js` eintragen.** Sonst fehlt sie
offline. `tests/public/sw.test.js` schlägt sonst fehl.

**Neue Migration? Ans Ende von `STEPS` in `db/migrations.js`.** Nie zwischen
bestehende Schritte einfügen und keine Nummer neu vergeben — der Stand steht in
`PRAGMA user_version`, migrierte Datenbanken übersprängen sonst den falschen
Schritt. Jeder Schritt bleibt zusätzlich idempotent, weil Altdatenbanken mit
`user_version = 0` starten, obwohl ihr Schema vollständig sein kann.

**Was ins Schema gehört und was in eine Migration.** `db/schema.js` beschreibt
den heutigen Stand mit `IF NOT EXISTS`. Alles, was an einer *bestehenden*
Datenbank nachgezogen werden muss, gehört in `db/migrations.js` — insbesondere
Indizes auf nachgerüstete Spalten: im Schema-Block laufen sie vor dem
`ALTER TABLE` und brechen mit „no such column" ab. `tests/migration.test.js`
deckt das ab, die übrigen Tests starten mit frischer Datenbank und sehen es nicht.

**`public/js/geo.js` und `public/js/dates.js` bleiben frei von DOM und State.**
Beide werden direkt getestet; Zugriffe auf `document` oder `S` würden das brechen.

**Datumsrechnung nur über `dates.js`.** Kalendertage sind Zeichenketten im
Format `JJJJ-MM-TT`. Kein `new Date(iso)` zum Formatieren und kein
`toISOString()` für „heute" — beides verschiebt den Tag über die Zeitzone.

**Zeitstempel aus der Datenbank nur über `parseTimestamp()`.** SQLite liefert
`JJJJ-MM-TT HH:MM:SS` in UTC, aber ohne Kennzeichen; `new Date()` liest das als
lokale Zeit und macht eine gerade gespeicherte Zeile zwei Stunden alt. Das ist in
UTC unsichtbar und fällt deshalb erst beim Nutzer auf. Für die Anzeige gibt es
`timeAgo()` — ebenfalls in `dates.js`, nicht mehr in `dom.js`.

**Eingaben über `utils/validate.js` prüfen**, nicht in der Route von Hand. Die
Funktionen werfen `ValidationError`, die Fehler-Middleware macht daraus einen 400
mit deutscher Meldung. Das gilt auch für Anmeldedaten: `username()`, `email()`,
`password()`. `email()` schreibt klein (Anmeldeschlüssel), `password()` trimmt
absichtlich nicht — sonst wäre das gespeicherte Passwort ein anderes als das
eingegebene.

**Icon-Knöpfe brauchen `aria-label`, nicht nur `title`.** Ein Screenreader liest
den title je nach Programm nicht vor. `tests/public/accessibility.test.js`
schlägt fehl, sobald ein Bedienelement mit `title` keins hat.

**Fokus und Dialogrolle stehen in `modal.js`**, nicht in den einzelnen Modals:
Rolle, Benennung über die Überschrift, Fokus hinein, Tab-Falle und Rückgabe an
den Auslöser. Ein neues Modal bekommt das automatisch — es muss dafür nichts tun,
außer seine Überschrift wie üblich in `.modal-head h2` zu setzen.

**Nach einer Änderung `refresh()`, nicht `navigate()`.** `navigate` ist für den
Ansichtswechsel und zeigt einen Spinner — die Liste fällt dabei auf die Höhe des
Indikators zusammen und die Scrollposition ist weg. `refresh()` lädt dieselbe
Ansicht neu und tauscht das Markup erst, wenn es fertig ist.

**Keine `style`-Attribute im Markup.** Die CSP hat kein `'unsafe-inline'` mehr,
ein Inline-Stil bliebe also wirkungslos — und zwar stumm. Gestylt wird über
Klassen in `style.css`; für umgeschaltete Sichtbarkeit gibt es `is-hidden`.
`element.style` aus JavaScript bleibt erlaubt (CSSOM, nicht Markup).
`tests/public/accessibility.test.js` und `tests/routes/headers.test.js` halten
beides offen.

**Modals sind ein Stapel.** `openModal` legt eine Ebene obendrauf, `closeModal`
nimmt die oberste. Wer aus einem Formular ein weiteres Modal öffnet, muss seine
Selektoren auf das eigene Overlay begrenzen (`$('#id', ov)`).

**`Referrer-Policy` nicht auf `no-referrer` stellen.** Helmets Standard wäre das,
und dann liefert OpenStreetMap statt Kartentiles ein „Access blocked"-Bild. Die
Policy steht in `app.js` **und** als `<meta name="referrer">` in `index.html`,
weil der Service Worker die Shell cacht und eine gecachte Antwort sonst die alte
Kopfzeile mitschleppt. `tests/routes/headers.test.js` sichert beides ab.

**Ordner löschen darf keine Notizen mitnehmen.** `notes.folder_id` ist
`ON DELETE SET NULL`; verwaiste Notizen landen bei „Ohne Ordner". Zeigt der
aktive Filter auf einen verschwundenen Ordner, fällt `router.js` auf „Alle" zurück.
**Kartentiles nicht cachen.** OpenStreetMaps Tile-Policy verbietet das. Die
OSM-Namensnennung in `map.js` ist Lizenzpflicht.

**Nominatim nur über `routes/geo.js`.** Direkt aus dem Browser wäre ein Verstoß
gegen die Nutzungsbedingungen (User-Agent) und würde die CSP aufweichen.

## Beim Entwickeln

**Änderungen an CSS und Frontend-JS brauchen zwei Reloads.** Der Service Worker
bedient statische Dateien nach *stale-while-revalidate*: der erste Reload zeigt
noch die alte Fassung und legt die neue in den Cache, der zweite zeigt sie. Das
ist Absicht — dadurch startet die App offline sofort — verwirrt beim Entwickeln
aber zuverlässig. Wer sicher sein will, leert den Cache:

```js
await Promise.all((await caches.keys()).map(k => caches.delete(k)));
```

**Der Browser-Tab läuft im Hintergrund mit gedrosselten Timern.** Toasts
verschwinden nach 3,5 Sekunden; wer per Skript prüft, misst leicht daneben und
hält funktionierenden Code für kaputt. Verlässlich ist ein `MutationObserver`
auf `#toasts`.
## Tests

`node --test`, Arrange-Act-Assert, deutsche Testnamen. Jede Datei läuft in einem
eigenen Prozess. `tests/helpers/setup.js` muss **als erstes** required werden: es
setzt `NODE_ENV=test`, ein Temp-`DATA_DIR` und `JWT_SECRET`, bevor `db.js` und
`middleware/auth.js` laden.

Getestet wird die echte App über einen ephemeren Port, kein Nachbau der Logik.
**Kein Test darf einen externen Dienst aufrufen** — deshalb lädt `app.js` unter
`NODE_ENV=test` die `.env` nicht, und `utils/nominatim.js` wird mit einem
untergeschobenen `fetch` geprüft.

Reine Funktionen werden direkt geprüft, ohne App und ohne Datei: `tests/utils/`,
`tests/public/` (dynamischer Import derselben Datei, die der Browser lädt) und
`tests/db/` gegen eine Datenbank im Speicher. Wo ein DOM nötig ist, gibt es
`jsdom` — siehe die Reihenfolge-Regel oben bei `markdown.js`.

Nicht getestet: Render-Funktionen und triviale Mapper.

## Konventionen

Allman-Klammern überall, auch in CSS. Zeilen maximal 120 Zeichen. Kommentare
erklären das *Warum*, nicht das *Was*. Oberfläche, Fehlermeldungen und
Dokumentation sind deutsch, Bezeichner im Code englisch.

## Git

Der Nutzer verwaltet Git selbst. Nicht initialisieren, nicht committen, nicht pushen.
