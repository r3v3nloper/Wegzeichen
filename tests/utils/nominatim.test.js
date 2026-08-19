/* Testet den echten Nominatim-Zugriff mit einem untergeschobenen fetch —
   ohne den externen Dienst zu belasten. */
const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert');
const { search, GeocodingUnavailableError } = require('../../utils/nominatim');

const USER_AGENT = 'Wegzeichen-Test/0.1 (test@example.com)';
const originalFetch = globalThis.fetch;

let calls;

function stubFetch(handler)
{
  globalThis.fetch = async (url, options) =>
  {
    calls.push({ url: String(url), options, at: Date.now() });
    return handler ? handler(url, options) : jsonResponse([]);
  };
}

function jsonResponse(body, ok = true)
{
  return {
    ok,
    json: async () => body,
  };
}

const SAMPLE = [{
  display_name: 'Altstadt, Düsseldorf, Nordrhein-Westfalen, Deutschland',
  lat: '51.22591',
  lon: '6.77357',
  address: { country_code: 'de', city: 'Düsseldorf' },
}];

beforeEach(() =>
{
  calls = [];
});

afterEach(() =>
{
  globalThis.fetch = originalFetch;
});

describe('Konfiguration', () =>
{
  test('verweigert die Suche ohne User-Agent', async () =>
  {
    stubFetch();

    await assert.rejects(() => search('Düsseldorf', ''), GeocodingUnavailableError);
    assert.equal(calls.length, 0, 'ohne User-Agent darf kein Request rausgehen');
  });

  test('sendet den konfigurierten User-Agent mit', async () =>
  {
    stubFetch(() => jsonResponse(SAMPLE));

    await search('Nominatim Kopfzeile', USER_AGENT);

    assert.equal(calls[0].options.headers['User-Agent'], USER_AGENT);
  });

  test('fragt deutsche Bezeichnungen mit Adressdetails an', async () =>
  {
    stubFetch(() => jsonResponse(SAMPLE));

    await search('Sprache und Details', USER_AGENT);

    assert.match(calls[0].url, /accept-language=de/);
    assert.match(calls[0].url, /addressdetails=1/);
    assert.match(calls[0].url, /format=jsonv2/);
  });
});

describe('Ergebnisaufbereitung', () =>
{
  test('wandelt die Antwort in das App-Format', async () =>
  {
    stubFetch(() => jsonResponse(SAMPLE));

    const results = await search('Aufbereitung', USER_AGENT);

    assert.deepEqual(results, [{
      label: 'Altstadt, Düsseldorf, Nordrhein-Westfalen, Deutschland',
      lat: 51.22591,
      lng: 6.77357,
      country: 'DE',
      region: 'Düsseldorf',
    }]);
  });

  test('verträgt eine Antwort ohne Adressdetails', async () =>
  {
    stubFetch(() => jsonResponse([{ display_name: 'Irgendwo', lat: '1', lon: '2' }]));

    const results = await search('Ohne Details', USER_AGENT);

    assert.equal(results[0].country, null);
    assert.equal(results[0].region, null);
  });

  test('liefert eine leere Liste bei einer unerwarteten Antwort', async () =>
  {
    stubFetch(() => jsonResponse({ unerwartet: true }));

    const results = await search('Unerwartet', USER_AGENT);

    assert.deepEqual(results, []);
  });
});

describe('Fehlerbehandlung', () =>
{
  test('meldet einen HTTP-Fehler als nicht erreichbar', async () =>
  {
    stubFetch(() => jsonResponse(null, false));

    await assert.rejects(() => search('HTTP-Fehler', USER_AGENT), GeocodingUnavailableError);
  });

  test('meldet einen Netzwerkabbruch als nicht erreichbar', async () =>
  {
    stubFetch(() =>
    {
      throw new Error('ECONNREFUSED');
    });

    await assert.rejects(() => search('Abbruch', USER_AGENT), GeocodingUnavailableError);
  });

  test('ein Fehler blockiert nicht die folgenden Anfragen', async () =>
  {
    stubFetch(() =>
    {
      throw new Error('ECONNREFUSED');
    });
    await assert.rejects(() => search('Erster Fehler', USER_AGENT));

    stubFetch(() => jsonResponse(SAMPLE));
    const results = await search('Danach wieder gut', USER_AGENT);

    assert.equal(results.length, 1, 'die Warteschlange darf nicht abreißen');
  });
});

describe('Zwischenspeicher', () =>
{
  test('fragt denselben Begriff nur einmal ab', async () =>
  {
    stubFetch(() => jsonResponse(SAMPLE));

    await search('Zwischenspeicher Test', USER_AGENT);
    await search('Zwischenspeicher Test', USER_AGENT);

    assert.equal(calls.length, 1);
  });

  test('ignoriert Groß- und Kleinschreibung', async () =>
  {
    stubFetch(() => jsonResponse(SAMPLE));

    await search('GROSS Und Klein', USER_AGENT);
    await search('gross und klein', USER_AGENT);

    assert.equal(calls.length, 1);
  });
});

describe('Nutzungsbedingungen', () =>
{
  test('hält mindestens eine Sekunde zwischen zwei Abfragen ein', async () =>
  {
    stubFetch(() => jsonResponse(SAMPLE));

    await search('Abstand eins', USER_AGENT);
    await search('Abstand zwei', USER_AGENT);

    const gap = calls[1].at - calls[0].at;

    assert.ok(gap >= 1000, `Abstand war ${gap} ms — Nominatim erlaubt 1 Anfrage pro Sekunde`);
  });
});
