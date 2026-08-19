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
db.js        Schema, Migrationen, Admin-Seed
middleware/  auth (JWT), admin, upload (multer)
routes/      auth, users, admin, meta, notes(+attachments), noteFolders,
             spots, trips, search, geo
utils/       validate, ownership, countries, attachments, nominatim
public/js/   state, api, router, shell, dom, geo, dates, map, modal,
             markdown(+-input, -editor), attachments + views/ + modals/
```

Details und Begründungen stehen in [Docs/architecture.md](Docs/architecture.md).

## Regeln, die beim Ändern zählen

**Jede Abfrage auf nutzerbezogene Daten filtert über `user_id`.** Dafür gibt es
`findOwned()` in `utils/ownership.js`. Fremdzugriffe antworten mit 404, nicht 403.
`tests/routes/isolation.test.js` deckt jede Ressource und Methode ab — dieser Test
darf nie ausgedünnt werden.

**Wanderwege und Orte teilen die Tabelle `spots`.** Ein Eintrag trägt die
Kennzeichen `is_trail` und `is_place` und darf beide haben (Drachenschlucht:
Ort *und* Weg). Neue aspektspezifische Felder gehören in `FIELDS_BY_KIND` in
`routes/spots.js`, damit sie ohne den Aspekt geleert werden. `views/spots.js`
bedient beide — nicht duplizieren. Wo beide Listen zusammenlaufen, über
`allSpots()` aus `state.js` entdoppeln.

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

**marked und DOMPurify liegen vendort in `public/vendor`.** Nach einem
`npm install` in einer frischen Arbeitskopie `npm run vendor:markdown` laufen
lassen, sonst fehlen die Dateien — kein CDN, das würde die CSP aufweichen.
Der Dockerfile macht das selbst.

**`public/js/markdown-input.js` bleibt frei von DOM und State.** Wie `geo.js`
und `dates.js` wird es direkt getestet; ein Zugriff auf `document` bricht das.

**Neue Frontend-Datei? In `STATIC` in `public/sw.js` eintragen.** Sonst fehlt sie
offline. `tests/public/sw.test.js` schlägt sonst fehl.

**Reihenfolge in `db.js` beachten.** Schema-Block, dann `addColumnIfMissing`,
dann Neuaufbau-Migrationen, dann Nachrüstungen die danach greifen müssen, und
**zuletzt** Indizes auf nachgerüstete Spalten. Ein `CREATE INDEX` im
Schema-Block läuft vor dem `ALTER TABLE` und bricht bei bestehenden Datenbanken
mit „no such column" ab. `tests/migration.test.js` deckt das ab — die übrigen
Tests starten mit frischer Datenbank und sehen es nicht.

**`public/js/geo.js` und `public/js/dates.js` bleiben frei von DOM und State.**
Beide werden direkt getestet; Zugriffe auf `document` oder `S` würden das brechen.

**Datumsrechnung nur über `dates.js`.** Kalendertage sind Zeichenketten im
Format `JJJJ-MM-TT`. Kein `new Date(iso)` zum Formatieren und kein
`toISOString()` für „heute" — beides verschiebt den Tag über die Zeitzone.

**Eingaben über `utils/validate.js` prüfen**, nicht in der Route von Hand. Die
Funktionen werfen `ValidationError`, die Fehler-Middleware macht daraus einen 400
mit deutscher Meldung.

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

Nicht getestet: Render-Funktionen und triviale Mapper.

## Konventionen

Allman-Klammern überall, auch in CSS. Zeilen maximal 120 Zeichen. Kommentare
erklären das *Warum*, nicht das *Was*. Oberfläche, Fehlermeldungen und
Dokumentation sind deutsch, Bezeichner im Code englisch.

## Git

Der Nutzer verwaltet Git selbst. Nicht initialisieren, nicht committen, nicht pushen.
