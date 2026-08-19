/* Sicherheits- und Auslieferungs-Kopfzeilen. Diese Werte sind leicht
   versehentlich zu verstellen und brechen dann Dinge, die man erst spät
   bemerkt — allen voran die Kartendarstellung. */
const { startTestServer } = require('../helpers/setup');
const { test, after, describe } = require('node:test');
const assert = require('node:assert');

const srv = startTestServer();
after(() => srv.close());

async function headers(path = '/')
{
  const res = await srv.raw(path);
  return res.headers;
}

describe('Referrer-Policy', () =>
{
  test('sendet die Herkunft mit, damit OpenStreetMap die Tiles ausliefert', async () =>
  {
    const value = (await headers()).get('referrer-policy');

    /* Helmets Standard 'no-referrer' entfernt den Referer aus den
       Tile-Anfragen; OSM antwortet dann mit „Access blocked". */
    assert.notEqual(value, 'no-referrer',
      'ohne Referer blockt OpenStreetMap die Kartentiles');
    assert.equal(value, 'strict-origin-when-cross-origin');
  });

  test('steht auch im Dokument, weil die Shell gecacht wird', async () =>
  {
    const res = await srv.raw('/index.html');
    const html = await res.text();

    /* Eine gecachte Antwort trägt die alte HTTP-Kopfzeile mit sich —
       im Dokument gilt die Policy unabhängig davon. */
    assert.match(html,
      /<meta name="referrer" content="strict-origin-when-cross-origin"/);
  });
});

describe('Content-Security-Policy', () =>
{
  test('erlaubt Kartentiles über https', async () =>
  {
    const csp = (await headers()).get('content-security-policy');

    assert.match(csp, /img-src [^;]*https:/);
  });

  test('lädt Skripte nur aus eigener Herkunft', async () =>
  {
    const csp = (await headers()).get('content-security-policy');

    assert.match(csp, /script-src 'self'/);
  });

  test('erzwingt kein HTTPS-Upgrade', async () =>
  {
    const csp = (await headers()).get('content-security-policy');

    // Würde Deployments über plain HTTP im LAN brechen
    assert.equal(csp.includes('upgrade-insecure-requests'), false);
  });
});

describe('Weitere Schutz-Kopfzeilen', () =>
{
  test('verbietet MIME-Sniffing', async () =>
  {
    assert.equal((await headers()).get('x-content-type-options'), 'nosniff');
  });
});
