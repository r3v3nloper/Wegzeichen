/* Testet public/js/geo.js — dieselbe Datei, die der Browser lädt.
   Der ESM-Import erfolgt dynamisch, weil die Tests CommonJS sind. */
const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const url = require('url');

let geo;

before(async () =>
{
  const file = path.join(__dirname, '..', '..', 'public', 'js', 'geo.js');
  geo = await import(url.pathToFileURL(file).href);
});

const DUESSELDORF = { lat: 51.2277, lng: 6.7735 };
const KOELN = { lat: 50.9375, lng: 6.9603 };

describe('haversineKm', () =>
{
  test('rechnet eine bekannte Strecke korrekt', () =>
  {
    const km = geo.haversineKm(DUESSELDORF, KOELN);

    // Luftlinie Düsseldorf–Köln liegt bei etwa 34 km
    assert.ok(km > 33 && km < 36, `erwartete ~34 km, war ${km}`);
  });

  test('liefert 0 für identische Punkte', () =>
  {
    assert.equal(geo.haversineKm(DUESSELDORF, DUESSELDORF), 0);
  });

  test('rechnet über den Antimeridian die kurze Strecke', () =>
  {
    const km = geo.haversineKm({ lat: 0, lng: 179 }, { lat: 0, lng: -179 });

    // Zwei Längengrade am Äquator sind rund 222 km — nicht der halbe Erdumfang
    assert.ok(km > 200 && km < 240, `erwartete ~222 km, war ${km}`);
  });

  test('rechnet die Pol-zu-Pol-Distanz', () =>
  {
    const km = geo.haversineKm({ lat: 90, lng: 0 }, { lat: -90, lng: 0 });

    assert.ok(Math.abs(km - 20015) < 50, `erwartete ~20015 km, war ${km}`);
  });

  test('liefert null wenn Koordinaten fehlen', () =>
  {
    assert.equal(geo.haversineKm(null, KOELN), null);
    assert.equal(geo.haversineKm(DUESSELDORF, { lat: null, lng: null }), null);
    assert.equal(geo.haversineKm(DUESSELDORF, { lat: 5 }), null);
  });

  test('behandelt 0 als gültige Koordinate', () =>
  {
    const km = geo.haversineKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 });

    assert.ok(km > 110 && km < 112, `erwartete ~111 km, war ${km}`);
  });
});

describe('formatDistance', () =>
{
  test('zeigt Meter unterhalb eines Kilometers', () =>
  {
    assert.equal(geo.formatDistance(0.42), '420 m');
  });

  test('zeigt eine Dezimalstelle mit Komma unter 10 km', () =>
  {
    assert.equal(geo.formatDistance(3.44), '3,4 km');
  });

  test('rundet ab 10 km auf ganze Kilometer', () =>
  {
    assert.equal(geo.formatDistance(34.2), '34 km');
  });

  test('setzt einen Tausendertrenner', () =>
  {
    assert.equal(geo.formatDistance(1240), '1.240 km');
  });

  test('liefert Leerstring ohne Wert', () =>
  {
    assert.equal(geo.formatDistance(null), '');
    assert.equal(geo.formatDistance(undefined), '');
    assert.equal(geo.formatDistance(NaN), '');
  });
});

describe('Karten-Links', () =>
{
  test('baut einen Navigationslink aus Koordinaten', () =>
  {
    const link = geo.mapsDirectionsUrl({ lat: 51.2277, lng: 6.7735 });

    assert.equal(link, 'https://www.google.com/maps/dir/?api=1&destination=51.2277,6.7735');
  });

  test('fällt ohne Koordinaten auf Name und Adresse zurück', () =>
  {
    const link = geo.mapsDirectionsUrl({ name: 'Hotel Alt Köln', address: 'Domplatz 1' });

    assert.match(link, /destination=Hotel%20Alt%20K%C3%B6ln%20Domplatz%201/);
  });

  test('liefert null wenn weder Koordinaten noch Name vorliegen', () =>
  {
    assert.equal(geo.mapsDirectionsUrl({}), null);
  });
});

describe('withDistances', () =>
{
  test('ergänzt die Entfernung zum Bezugspunkt', () =>
  {
    const result = geo.withDistances([{ name: 'Köln', ...KOELN }], DUESSELDORF);

    assert.ok(result[0].distanceKm > 33 && result[0].distanceKm < 36);
  });

  test('setzt null ohne Bezugspunkt statt Einträge zu verwerfen', () =>
  {
    const result = geo.withDistances([{ name: 'Köln', ...KOELN }], null);

    assert.equal(result.length, 1);
    assert.equal(result[0].distanceKm, null);
  });
});

describe('groupByCountry', () =>
{
  const nameOf = code => ({ DE: 'Deutschland', IT: 'Italien', AT: 'Österreich' })[code];

  test('gruppiert und sortiert nach deutschem Ländernamen', () =>
  {
    const groups = geo.groupByCountry([
      { name: 'a', country: 'IT' },
      { name: 'b', country: 'DE' },
      { name: 'c', country: 'AT' },
      { name: 'd', country: 'DE' },
    ], nameOf);

    assert.deepEqual(groups.map(g => g.code), ['DE', 'IT', 'AT']);
    assert.equal(groups[0].items.length, 2);
  });

  test('hängt Einträge ohne Land am Ende an', () =>
  {
    const groups = geo.groupByCountry([
      { name: 'ohne', country: null },
      { name: 'mit', country: 'DE' },
    ], nameOf);

    assert.equal(groups[1].code, '');
    assert.equal(groups[1].name, 'Ohne Land');
  });
});

describe('sortItems', () =>
{
  test('sortiert Einträge ohne Entfernung nach hinten', () =>
  {
    const sorted = geo.sortItems([
      { name: 'weit', distanceKm: 100 },
      { name: 'unbekannt', distanceKm: null },
      { name: 'nah', distanceKm: 5 },
    ], 'distance');

    assert.deepEqual(sorted.map(s => s.name), ['nah', 'weit', 'unbekannt']);
  });

  test('sortiert Bewertungen absteigend, Unbewertete zuletzt', () =>
  {
    const sorted = geo.sortItems([
      { name: 'mittel', rating: 3 },
      { name: 'ohne', rating: null },
      { name: 'top', rating: 5 },
    ], 'rating');

    assert.deepEqual(sorted.map(s => s.name), ['top', 'mittel', 'ohne']);
  });

  test('verändert das Original nicht', () =>
  {
    const input = [{ name: 'b' }, { name: 'a' }];
    geo.sortItems(input, 'name');

    assert.equal(input[0].name, 'b');
  });
});
