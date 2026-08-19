# Wegzeichen

Selbst gehostete PWA für Notizen, Wanderwege, Orte und Reisen. Läuft als einzelner
Docker-Container, ist auf Android und Windows installierbar und bleibt unterwegs
ohne Netz lesbar.

Der Name ist der deutsche Begriff für die aufgemalten Markierungen an Wanderwegen —
und wörtlich „Weg" + „Zeichen", die beiden Kernmodule der App.

## Was die App kann

- **Notizen in Markdown** mit Leseansicht, Editor samt Werkzeugleiste und Vorschau,
  Volltextsuche, Favoriten immer oben und kleinen Anhängen
  (PDF, Word, ODT, Text, Markdown, Bilder — max. 10 MB je Datei)
- **Wanderwege** mit Länge, Höhenmetern, Dauer, Schwierigkeit, Quelle und Notizen in Markdown
- **Orte** wie Hotels, Wälder, Aussichtspunkte oder Stände, gruppiert nach Land
- **Wunschliste und Besuchtes** in einem Feld: „Möchte ich hin" oder
  „War ich schon" mit Sterne-Bewertung und Besuchsdatum
- **Entfernung** als Luftlinie zu einem hinterlegten Heimatort, plus Deep-Link,
  der die Navigation direkt in Google Maps öffnet
- **Reiseblog** mit Zeitraum, berechneter Dauer, Bewertung, Etappenroute
  („Tag 1–4 Rom, Tag 5–8 Florenz") und einem Reisebericht in Markdown;
  Bilder bleiben als Cloud-Link außerhalb
- **Karte** für Orte und Wanderwege mit OpenStreetMap
- **Mehrbenutzerbetrieb** mit strikt getrennten Daten

Kein Google-Maps-API-Key, kein Abrechnungskonto, keine Fremd-CDNs: die Karte nutzt
OpenStreetMap, die Adresssuche Nominatim über einen eigenen Proxy, und Leaflet,
marked und DOMPurify liegen lokal im Image.

## Schnellstart lokal

```bash
npm install
```

```bash
npm run vendor:leaflet && npm run vendor:markdown
```

`.env.example` nach `.env` kopieren und mindestens `JWT_SECRET` setzen. Danach:

```bash
npm run dev
```

Die App läuft auf http://localhost:3000.

Zum Entwickeln ist Node 22 die geprüfte Fassung. Die App selbst läuft ab Node 20 —
darauf baut auch das Docker-Image (`node:20-alpine`). Nur das Glob-Muster im
Testskript braucht einen neueren Testrunner: `npm test` ist auf 22.17 geprüft.

## Betrieb mit Docker

```bash
docker compose up --build -d
```

Datenbank und Anhänge landen im Volume `wegzeichen-data` unter `/data`. Der
Leaflet-Vendor-Schritt läuft im Image automatisch, ein `npm install` auf dem
Server ist nicht nötig.

Für den ersten Start lohnt sich ein Admin-Konto — dazu `ADMIN_EMAIL` und
`ADMIN_PASSWORD` setzen. Beide werden nur ausgewertet, solange das Konto noch
nicht existiert.

## Umgebungsvariablen

| Variable | Pflicht | Bedeutung |
|---|---|---|
| `JWT_SECRET` | ja | Signaturschlüssel der Anmeldung. Ändern meldet alle Geräte ab. |
| `DATA_DIR` | im Container | Verzeichnis für `wegzeichen.db` und `attachments/`. Im Container `/data`. |
| `PORT` | nein | Standard 3000 |
| `CORS_ORIGIN` | nein | Erlaubte Origin. Ohne Angabe `http://localhost:$PORT`. |
| `TRUST_PROXY` | nein | Anzahl vorgelagerter Proxys. In Docker auf `1` vorbelegt, passt so. |
| `NOMINATIM_USER_AGENT` | für die Adresssuche | Identifizierender User-Agent mit Kontakt. Fehlt er, ist nur die Adresssuche deaktiviert — Karte und Kartenklick funktionieren weiter. |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | nein | Einmaliger Admin-Seed beim ersten Start |

## Betrieb hinter einem Reverse Proxy

Nichts zu tun — `TRUST_PROXY=1` ist in der `docker-compose.yml` voreingestellt.
Der Wert sorgt dafür, dass Express die echte Client-Adresse aus
`X-Forwarded-For` liest statt überall die des Proxys zu sehen; ohne ihn würde der
Brute-Force-Schutz der Anmeldung alle Nutzer gemeinsam treffen, statt einzelne.
Anfassen musst du ihn nur, wenn mehrere Proxys gestapelt sind.

Ein Minimalbeispiel für Caddy:

```
wegzeichen.example.de {
	reverse_proxy localhost:3000
}
```

HTTPS ist nicht optional, wenn die App auf dem Telefon offline funktionieren
soll: Service Worker und die Installation als App verlangen einen sicheren
Kontext. Über `http://` auf einer LAN-Adresse registriert der Browser keinen
Service Worker — dann gibt es weder Offline-Lesen noch eine echte Installation.

`NOMINATIM_USER_AGENT` ist keine Schikane: die
[Nominatim-Nutzungsbedingungen](https://operations.osmfoundation.org/policies/nominatim/)
verlangen eine identifizierende Kennung samt Kontaktmöglichkeit. Der Proxy hält
zusätzlich den Mindestabstand von einer Sekunde zwischen zwei Abfragen ein.

## Offline-Verhalten

| Situation | Verhalten |
|---|---|
| Lesen ohne Netz | Alle Notizen, Orte, Wanderwege, Reisen und Entfernungen sind da, mit Hinweisbanner |
| Bereits geöffnete Anhänge | Bleiben offline verfügbar |
| Speichern ohne Netz | Wird abgelehnt, mit deutlichem Hinweis dass nichts gespeichert wurde |
| Kartenhintergrund ohne Netz | Fehlt. OpenStreetMaps Tile-Policy verbietet Vorab-Caching; Koordinaten, Entfernung und Maps-Link funktionieren trotzdem |

## Tests

```bash
npm test
```

424 Tests, ohne Netzzugriff. Schwerpunkte sind die Datentrennung zwischen Nutzern,
die Anhang-Limits samt Path-Traversal-Schutz, das Säubern des gerenderten Markdowns
und die Entfernungsberechnung.
Die Tests laden `.env` absichtlich nicht, damit sie unabhängig von der lokalen
Konfiguration laufen.

Einzelne Bereiche:

```bash
node --test "tests/routes/isolation.test.js"
```

## Icons

Das App-Icon liegt als SVG unter `public/icons/icon.svg`. Chrome akzeptiert das
für die PWA-Installation. Wer PNG-Varianten bevorzugt, legt `icon-192.png` und
`icon-512.png` daneben und ergänzt sie in `public/manifest.json`.

## Dokumentation

- [Docs/architecture.md](Docs/architecture.md) — Aufbau, Datenmodell, Entscheidungen
- [Docs/features.md](Docs/features.md) — Funktionen im Detail
- [CHANGELOG.md](CHANGELOG.md) — Änderungen

## Lizenz

[MIT](LICENSE) — © 2026 r3v3nloper. Die mitgelieferten Bibliotheken behalten ihre
eigenen Lizenzen: Leaflet (BSD-2-Clause), marked (MIT), DOMPurify (MPL-2.0 oder
Apache-2.0). Kartendaten kommen von OpenStreetMap und stehen unter der ODbL; die
Namensnennung in der Karte ist Lizenzpflicht und darf nicht entfernt werden.
