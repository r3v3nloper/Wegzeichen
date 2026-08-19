/* Der Service Worker cacht eine handgepflegte Dateiliste. Wird eine neue
   Datei angelegt und dort vergessen, fehlt sie offline — und zwar erst beim
   Nutzer im Funkloch. Dieser Test macht das sofort sichtbar. */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const SW_SOURCE = fs.readFileSync(path.join(PUBLIC_DIR, 'sw.js'), 'utf8');
const API_SOURCE = fs.readFileSync(path.join(PUBLIC_DIR, 'js', 'api.js'), 'utf8');

/* Liest das STATIC-Array aus dem Quelltext — den Service Worker selbst kann
   Node nicht laden, weil er `self` und `caches` erwartet. */
function staticEntries()
{
  const block = SW_SOURCE.match(/const STATIC = \[([\s\S]*?)\];/);
  assert.ok(block, 'STATIC-Array in sw.js nicht gefunden');
  return [...block[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
}

function ownFiles(dir, prefix = '')
{
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  {
    const url = `${prefix}/${entry.name}`;
    return entry.isDirectory() ? ownFiles(path.join(dir, entry.name), url) : [url];
  });
}

const STATIC = staticEntries();

describe('Cache-Liste des Service Workers', () =>
{
  test('enthält jedes JavaScript-Modul der App', () =>
  {
    const modules = ownFiles(path.join(PUBLIC_DIR, 'js'), '/js')
      .filter(file => file.endsWith('.js'));

    const missing = modules.filter(file => !STATIC.includes(file));

    assert.deepEqual(missing, [],
      `Diese Module fehlen in STATIC in public/sw.js: ${missing.join(', ')}`);
  });

  test('enthält das Stylesheet und die App-Shell', () =>
  {
    ['/', '/index.html', '/css/style.css', '/manifest.json'].forEach(entry =>
      assert.ok(STATIC.includes(entry), `${entry} fehlt in STATIC`));
  });

  test('enthält Leaflet samt Stylesheet und Marker-Grafiken', () =>
  {
    ['/vendor/leaflet/leaflet.js', '/vendor/leaflet/leaflet.css',
      '/vendor/leaflet/images/marker-icon.png'].forEach(entry =>
      assert.ok(STATIC.includes(entry), `${entry} fehlt in STATIC`));
  });

  test('enthält marked und DOMPurify', () =>
  {
    /* Ohne die beiden bliebe die Notizansicht offline leer — sie rendert
       Markdown, und geladen werden sie aus public/vendor, nicht von einem CDN. */
    ['/vendor/marked/marked.esm.js', '/vendor/dompurify/purify.es.mjs'].forEach(entry =>
      assert.ok(STATIC.includes(entry),
        `${entry} fehlt in STATIC — "npm run vendor:markdown" ausgeführt?`));
  });

  test('verweist nur auf Dateien, die es wirklich gibt', () =>
  {
    const localEntries = STATIC.filter(entry => entry.startsWith('/') && entry !== '/');

    const broken = localEntries.filter(entry =>
      !fs.existsSync(path.join(PUBLIC_DIR, entry)));

    assert.deepEqual(broken, [],
      `STATIC verweist auf nicht vorhandene Dateien: ${broken.join(', ')}`);
  });

  test('cacht keine Kartentiles von OpenStreetMap', () =>
  {
    /* Deren Tile-Policy verbietet Vorab-Caching — ein Eintrag hier wäre
       ein Lizenzverstoß, nicht nur ein technisches Detail. */
    assert.equal(STATIC.some(entry => entry.includes('tile.openstreetmap.org')), false);
  });
});

describe('Gemeinsame Konstanten', () =>
{
  test('der API-Cache-Name ist in sw.js und api.js identisch', () =>
  {
    const inSw = SW_SOURCE.match(/const API_CACHE = '([^']+)'/)?.[1];
    const inApi = API_SOURCE.match(/API_CACHE_NAME = '([^']+)'/)?.[1];

    assert.ok(inSw, 'API_CACHE nicht in sw.js gefunden');
    assert.equal(inApi, inSw,
      'api.js leert beim Kontowechsel den Cache über diesen Namen — er muss passen');
  });

  test('der Offline-Header ist in sw.js und api.js identisch', () =>
  {
    const inSw = SW_SOURCE.match(/const OFFLINE_HEADER = '([^']+)'/)?.[1];
    const inApi = API_SOURCE.match(/OFFLINE_HEADER = '([^']+)'/)?.[1];

    assert.ok(inSw, 'OFFLINE_HEADER nicht in sw.js gefunden');
    assert.equal(inApi, inSw);
  });
});

describe('Strategie', () =>
{
  test('lesende API-Aufrufe fallen offline auf den Cache zurück', () =>
  {
    /* Die Vorlage AniGa antwortet hier mit einem harten 503. Für Wegzeichen ist
       genau dieser Rückfall die Zusage „im Wald ohne Netz lesbar". */
    assert.match(SW_SOURCE, /handleApiRead/);
    assert.match(SW_SOURCE, /cacheName: API_CACHE/);
  });

  test('jeder Cache-Zugriff ignoriert den Vary-Header', () =>
  {
    /* Die cors-Middleware setzt `Vary: Origin` auf jede Antwort. Ohne ignoreVary
       findet caches.match nichts, sobald sich Anfrage-Header unterscheiden —
       offline käme dann für JS-Module die index.html zurück. */
    assert.match(SW_SOURCE, /MATCH_OPTIONS = \{ ignoreVary: true \}/);

    const matchCalls = [...SW_SOURCE.matchAll(/caches\.match\([^)]*\)/g)].map(m => m[0]);
    const withoutOptions = matchCalls.filter(call => !call.includes('MATCH_OPTIONS'));

    assert.deepEqual(withoutOptions, [],
      `Diese caches.match-Aufrufe ignorieren Vary nicht: ${withoutOptions.join(' | ')}`);
  });

  test('nur Navigationen fallen auf die App-Shell zurück', () =>
  {
    /* Ein Skript, das HTML zurückbekommt, stirbt an einem MIME-Fehler statt
       sauber zu scheitern. */
    assert.match(SW_SOURCE, /request\.mode === 'navigate'/);
  });

  test('schreibende API-Aufrufe werden offline nicht stillschweigend verworfen', () =>
  {
    assert.match(SW_SOURCE, /handleApiWrite/);
    assert.match(SW_SOURCE, /Änderung wurde nicht gespeichert/);
  });
});
