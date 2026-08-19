/* Der Heimatort ist der Bezugspunkt jeder Entfernungsangabe in der App.

   Die Grundfälle — speichern, halber Koordinatensatz, Bereichsgrenzen, löschen —
   liegen bereits im Block „Heimatort" in tests/routes/auth.test.js. Hier stehen
   die Zusagen, auf die sich das Frontend darüber hinaus verlässt. */
const { startTestServer, registerUser } = require('../helpers/setup');
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');

const srv = startTestServer();
after(() => srv.close());

let token;

before(async () =>
{
  token = (await registerUser(srv, 'wohnort')).token;
});

function setHome(payload, useToken = token)
{
  return srv.req('PUT', '/api/users/home', payload, useToken);
}

describe('Heimatort setzen', () =>
{
  test('liefert den Ort auch bei der nächsten Profilabfrage', async () =>
  {
    /* Die App holt den Heimatort beim Start über /api/auth/me und rechnet damit
       alle Entfernungen. Käme er dort nicht mit, wären alle Angaben leer. */
    await setHome({ label: 'Düsseldorf', lat: 51.2277, lng: 6.7735 });

    const me = await srv.req('GET', '/api/auth/me', undefined, token);

    assert.equal(me.status, 200);
    assert.equal(me.data.home_label, 'Düsseldorf');
    assert.equal(me.data.home_lat, 51.2277);
    assert.equal(me.data.home_lng, 6.7735);
  });

  test('gibt keinen Passwort-Hash heraus', async () =>
  {
    const res = await setHome({ label: 'Ohne Hash', lat: 50, lng: 8 });

    assert.equal(res.data.user.password_hash, undefined);
    assert.equal(res.data.user.token_version, undefined);
  });

  test('überschreibt einen bestehenden Ort', async () =>
  {
    await setHome({ label: 'Erst hier', lat: 48.1, lng: 11.6 });
    const res = await setHome({ label: 'Jetzt dort', lat: 53.55, lng: 9.99 });

    assert.equal(res.data.user.home_label, 'Jetzt dort');
    assert.equal(res.data.user.home_lat, 53.55);
  });

  test('lehnt eine zu lange Bezeichnung ab', async () =>
  {
    const res = await setHome({ label: 'x'.repeat(121), lat: 51, lng: 7 });

    assert.equal(res.status, 400);
    assert.match(res.data.error, /Bezeichnung/);
  });

  test('nimmt die Ränder des Koordinatenbereichs an', async () =>
  {
    const res = await setHome({ label: 'Rand', lat: -90, lng: 180 });

    assert.equal(res.status, 200);
    assert.equal(res.data.user.home_lat, -90);
    assert.equal(res.data.user.home_lng, 180);
  });

  test('verlangt eine Anmeldung', async () =>
  {
    const res = await srv.req('PUT', '/api/users/home', { lat: 51, lng: 7 });

    assert.equal(res.status, 401);
  });
});

describe('Trennung der Nutzer', () =>
{
  test('jeder Nutzer hat seinen eigenen Heimatort', async () =>
  {
    const alice = await registerUser(srv, 'wohnalice');
    const bob = await registerUser(srv, 'wohnbob');

    await setHome({ label: 'Alices Zuhause', lat: 51, lng: 7 }, alice.token);
    await setHome({ label: 'Bobs Zuhause', lat: 48, lng: 11 }, bob.token);

    const alicesView = await srv.req('GET', '/api/auth/me', undefined, alice.token);
    const bobsView = await srv.req('GET', '/api/auth/me', undefined, bob.token);

    assert.equal(alicesView.data.home_label, 'Alices Zuhause');
    assert.equal(bobsView.data.home_label, 'Bobs Zuhause');
  });
});
