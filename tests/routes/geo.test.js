/* Der Geocoding-Proxy wird ohne konfigurierten User-Agent getestet: dadurch
   antwortet er sofort mit 503 und es geht keine Anfrage an Nominatim raus.
   Das genügt, um Auth, Eingabeprüfung und Drosselung zu prüfen; die Aufbereitung
   der Antworten deckt tests/utils/nominatim.test.js mit einem Stub ab. */
const { startTestServer, registerUser } = require('../helpers/setup');
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');

const srv = startTestServer();
after(() => srv.close());

let token;

before(async () =>
{
  token = (await registerUser(srv, 'geo')).token;
});

describe('Zugriffsschutz', () =>
{
  test('verlangt eine Anmeldung', async () =>
  {
    const res = await srv.req('GET', '/api/geo/search?q=Düsseldorf');

    assert.equal(res.status, 401, 'ein offener Proxy wäre fremdnutzbar');
  });
});

describe('Eingabeprüfung', () =>
{
  test('verlangt einen Suchbegriff', async () =>
  {
    const res = await srv.req('GET', '/api/geo/search', undefined, token);

    assert.equal(res.status, 400);
  });

  test('liefert bei unter drei Zeichen eine leere Liste ohne Anfrage', async () =>
  {
    const res = await srv.req('GET', '/api/geo/search?q=ab', undefined, token);

    assert.equal(res.status, 200);
    assert.deepEqual(res.data, []);
  });
});

describe('Fehlende Konfiguration', () =>
{
  test('meldet die Adresssuche als nicht verfügbar', async () =>
  {
    const res = await srv.req('GET', '/api/geo/search?q=Düsseldorf', undefined, token);

    assert.equal(res.status, 503);
    assert.match(res.data.error, /nicht konfiguriert/);
  });
});

describe('Drosselung', () =>
{
  test('bremst einen Nutzer nach 30 Anfragen pro Minute', async () =>
  {
    const own = (await registerUser(srv, 'geolimit')).token;

    let limited = null;
    for (let i = 0; i < 32; i++)
    {
      const res = await srv.req('GET', `/api/geo/search?q=Suche${i}`, undefined, own);
      if (res.status === 429)
      {
        limited = i;
        break;
      }
    }

    assert.equal(limited, 30, 'die 31. Anfrage muss abgewiesen werden');
  });
});
