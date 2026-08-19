/* Betrieb hinter einem Reverse Proxy. Ohne `trust proxy` sieht Express bei
   jeder Anfrage die Adresse des Proxys — der Brute-Force-Schutz der Anmeldung
   würde dann alle Nutzer gemeinsam aussperren. */
process.env.TRUST_PROXY = '1';

const { startTestServer } = require('../helpers/setup');
const { test, after, describe } = require('node:test');
const assert = require('node:assert');

const srv = startTestServer();
after(() => srv.close());

/* Der Limiter greift nach 10 Fehlversuchen je Adresse */
const FAILURE_LIMIT = 10;

function failedLogin(forwardedFor)
{
  return fetch(`${srv.base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': forwardedFor },
    body: JSON.stringify({ email: 'niemand@example.com', password: 'falsch-falsch' }),
  });
}

describe('Reverse-Proxy-Konfiguration', () =>
{
  test('übernimmt die Anzahl der Proxy-Stufen aus TRUST_PROXY', () =>
  {
    const app = require('../../app');

    assert.equal(app.get('trust proxy'), 1);
  });

  test('drosselt je echter Client-Adresse statt gemeinsam', async () =>
  {
    for (let i = 0; i < FAILURE_LIMIT; i++)
    {
      const res = await failedLogin('203.0.113.10');
      assert.equal(res.status, 401, `Versuch ${i + 1} sollte nur abgelehnt werden`);
    }

    const blocked = await failedLogin('203.0.113.10');
    const otherClient = await failedLogin('203.0.113.99');

    assert.equal(blocked.status, 429, 'die erschöpfte Adresse muss gesperrt werden');
    assert.equal(otherClient.status, 401,
      'eine andere Adresse darf davon nicht betroffen sein');
  });
});
