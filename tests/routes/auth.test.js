const { startTestServer, registerUser } = require('../helpers/setup');
const { test, after, describe } = require('node:test');
const assert = require('node:assert');

const srv = startTestServer();
after(() => srv.close());

describe('Registrierung und Login', () =>
{
  test('legt einen Nutzer an und liefert einen Token', async () =>
  {
    const { status, token, user } = await registerUser(srv, 'auth1');

    assert.equal(status, 200);
    assert.ok(token);
    assert.equal(user.username, 'userauth1');
    assert.equal(user.is_admin, false);
  });

  test('gibt niemals den Passwort-Hash heraus', async () =>
  {
    const { user } = await registerUser(srv, 'auth2');

    assert.equal(user.password_hash, undefined);
    assert.equal(user.token_version, undefined);
  });

  test('lehnt eine doppelte E-Mail ab', async () =>
  {
    await registerUser(srv, 'auth3');
    const second = await srv.req('POST', '/api/auth/register', {
      username: 'andererName', email: 'userauth3@example.com', password: 'geheim123',
    });

    assert.equal(second.status, 400);
    assert.match(second.data.error, /E-Mail/);
  });

  test('lehnt ein zu kurzes Passwort ab', async () =>
  {
    const res = await srv.req('POST', '/api/auth/register', {
      username: 'kurzpw', email: 'kurzpw@example.com', password: '12345',
    });

    assert.equal(res.status, 400);
  });

  test('lehnt einen zu kurzen Benutzernamen ab', async () =>
  {
    const res = await srv.req('POST', '/api/auth/register', {
      username: 'ab', email: 'kurzname@example.com', password: 'geheim123',
    });

    assert.equal(res.status, 400);
    assert.match(res.data.error, /Benutzername/);
  });

  test('lehnt eine unsinnige E-Mail-Adresse ab', async () =>
  {
    const res = await srv.req('POST', '/api/auth/register', {
      username: 'kaputtemail', email: 'keine-adresse', password: 'geheim123',
    });

    assert.equal(res.status, 400);
    assert.match(res.data.error, /E-Mail/);
  });

  test('lehnt einen doppelten Benutzernamen ab', async () =>
  {
    await registerUser(srv, 'doppelt');
    const res = await srv.req('POST', '/api/auth/register', {
      username: 'userdoppelt', email: 'andere@example.com', password: 'geheim123',
    });

    assert.equal(res.status, 400);
    assert.match(res.data.error, /Benutzername/);
  });

  test('speichert die E-Mail in Kleinschreibung', async () =>
  {
    /* Sonst hinge die Anmeldung davon ab, wie der Nutzer seine Adresse tippt. */
    const created = await srv.req('POST', '/api/auth/register', {
      username: 'grossklein', email: '  GrossKlein@Example.COM ', password: 'geheim123',
    });
    assert.equal(created.data.user.email, 'grossklein@example.com');

    const res = await srv.req('POST', '/api/auth/login', {
      email: 'GROSSKLEIN@example.com', password: 'geheim123',
    });

    assert.equal(res.status, 200);
  });

  test('behält Leerzeichen im Passwort', async () =>
  {
    /* Ein getrimmtes Passwort wäre ein anderes — der Nutzer käme beim nächsten
       Anmelden nicht mehr herein. */
    await srv.req('POST', '/api/auth/register', {
      username: 'leerzeichen', email: 'leerzeichen@example.com', password: '  geheim123  ',
    });

    const withSpaces = await srv.req('POST', '/api/auth/login', {
      email: 'leerzeichen@example.com', password: '  geheim123  ',
    });
    const trimmed = await srv.req('POST', '/api/auth/login', {
      email: 'leerzeichen@example.com', password: 'geheim123',
    });

    assert.equal(withSpaces.status, 200);
    assert.equal(trimmed.status, 401);
  });

  test('meldet mit korrekten Daten an', async () =>
  {
    await registerUser(srv, 'auth4');
    const res = await srv.req('POST', '/api/auth/login', {
      email: 'userauth4@example.com', password: 'geheim123',
    });

    assert.equal(res.status, 200);
    assert.ok(res.data.token);
  });

  test('weist ein falsches Passwort ab', async () =>
  {
    await registerUser(srv, 'auth5');
    const res = await srv.req('POST', '/api/auth/login', {
      email: 'userauth5@example.com', password: 'falsch-falsch',
    });

    assert.equal(res.status, 401);
  });
});

describe('Geschützte Endpunkte', () =>
{
  test('weisen Anfragen ohne Token ab', async () =>
  {
    const res = await srv.req('GET', '/api/auth/me');

    assert.equal(res.status, 401);
  });

  test('weisen einen manipulierten Token ab', async () =>
  {
    const res = await srv.req('GET', '/api/auth/me', undefined, 'kein.echter.token');

    assert.equal(res.status, 401);
  });

  test('liefern das eigene Profil', async () =>
  {
    const { token } = await registerUser(srv, 'auth6');
    const res = await srv.req('GET', '/api/auth/me', undefined, token);

    assert.equal(res.status, 200);
    assert.equal(res.data.username, 'userauth6');
  });
});

describe('Passwortwechsel', () =>
{
  test('macht alte Tokens ungültig und liefert einen frischen', async () =>
  {
    const { token: oldToken } = await registerUser(srv, 'auth7');

    const changed = await srv.req('PUT', '/api/auth/profile', {
      currentPassword: 'geheim123', newPassword: 'nochgeheimer456',
    }, oldToken);
    assert.equal(changed.status, 200);
    assert.ok(changed.data.token);

    const withOld = await srv.req('GET', '/api/auth/me', undefined, oldToken);
    const withNew = await srv.req('GET', '/api/auth/me', undefined, changed.data.token);

    assert.equal(withOld.status, 401, 'alter Token muss abgelehnt werden');
    assert.equal(withNew.status, 200, 'neuer Token muss funktionieren');
  });

  test('verlangt das korrekte aktuelle Passwort', async () =>
  {
    const { token } = await registerUser(srv, 'auth8');
    const res = await srv.req('PUT', '/api/auth/profile', {
      currentPassword: 'komplett-falsch', newPassword: 'nochgeheimer456',
    }, token);

    assert.equal(res.status, 400);
  });
});

describe('Profil ändern', () =>
{
  test('ändert Benutzername und E-Mail', async () =>
  {
    const { token } = await registerUser(srv, 'profil1');

    const res = await srv.req('PUT', '/api/auth/profile', {
      username: 'neuerName', email: 'neu1@example.com',
    }, token);

    assert.equal(res.status, 200);
    assert.equal(res.data.user.username, 'neuerName');
    assert.equal(res.data.user.email, 'neu1@example.com');
    // Ohne Passwortwechsel bleibt der bestehende Token gültig
    assert.equal(res.data.token, undefined);
  });

  test('nimmt unveränderte Werte widerspruchslos an', async () =>
  {
    /* Das Formular schickt immer alle Felder mit. Würden unveränderte Werte in
       das UPDATE wandern, scheiterte es am UNIQUE-Index auf dem eigenen Namen. */
    const { token, user } = await registerUser(srv, 'profil2');

    const res = await srv.req('PUT', '/api/auth/profile', {
      username: user.username, email: user.email,
    }, token);

    assert.equal(res.status, 200);
    assert.equal(res.data.user.username, user.username);
  });

  test('lehnt einen bereits vergebenen Benutzernamen ab', async () =>
  {
    await registerUser(srv, 'profil3');
    const { token } = await registerUser(srv, 'profil4');

    const res = await srv.req('PUT', '/api/auth/profile', {
      username: 'userprofil3',
    }, token);

    assert.equal(res.status, 400);
    assert.match(res.data.error, /Benutzername/);
  });

  test('lehnt eine unsinnige E-Mail-Adresse ab', async () =>
  {
    const { token } = await registerUser(srv, 'profil5');

    const res = await srv.req('PUT', '/api/auth/profile', { email: 'keine-adresse' }, token);

    assert.equal(res.status, 400);
    assert.match(res.data.error, /E-Mail/);
  });

  test('verlangt für ein neues Passwort das aktuelle', async () =>
  {
    const { token } = await registerUser(srv, 'profil6');

    const res = await srv.req('PUT', '/api/auth/profile', {
      newPassword: 'nochgeheimer456',
    }, token);

    assert.equal(res.status, 400);
    assert.match(res.data.error, /Aktuelles Passwort/);
  });

  test('lehnt ein zu kurzes neues Passwort ab', async () =>
  {
    const { token } = await registerUser(srv, 'profil7');

    const res = await srv.req('PUT', '/api/auth/profile', {
      currentPassword: 'geheim123', newPassword: '123',
    }, token);

    assert.equal(res.status, 400);
    assert.match(res.data.error, /Neues Passwort/);
  });
});

describe('Heimatort', () =>
{
  test('speichert Bezeichnung und Koordinaten', async () =>
  {
    const { token } = await registerUser(srv, 'home1');
    const res = await srv.req('PUT', '/api/users/home', {
      label: 'Zuhause', lat: 51.2277, lng: 6.7735,
    }, token);

    assert.equal(res.status, 200);
    assert.equal(res.data.user.home_label, 'Zuhause');
    assert.equal(res.data.user.home_lat, 51.2277);
  });

  test('lehnt einen halben Koordinatensatz ab', async () =>
  {
    const { token } = await registerUser(srv, 'home2');
    const res = await srv.req('PUT', '/api/users/home', { label: 'Halb', lat: 51.2 }, token);

    assert.equal(res.status, 400);
    assert.match(res.data.error, /zusammen/);
  });

  test('lehnt Koordinaten außerhalb des gültigen Bereichs ab', async () =>
  {
    const { token } = await registerUser(srv, 'home3');
    const res = await srv.req('PUT', '/api/users/home', { lat: 91, lng: 0 }, token);

    assert.equal(res.status, 400);
  });

  test('löscht den Heimatort bei leeren Koordinaten', async () =>
  {
    const { token } = await registerUser(srv, 'home4');
    await srv.req('PUT', '/api/users/home', { label: 'Weg', lat: 10, lng: 10 }, token);

    const res = await srv.req('PUT', '/api/users/home', { label: null }, token);

    assert.equal(res.status, 200);
    assert.equal(res.data.user.home_lat, null);
  });
});

describe('Länderliste', () =>
{
  test('enthält Deutschland mit deutschem Namen', async () =>
  {
    const res = await srv.req('GET', '/api/meta/countries');

    assert.equal(res.status, 200);
    const de = res.data.find(c => c.code === 'DE');
    assert.equal(de.name, 'Deutschland');
  });

  test('enthält keine Zusammenschlüsse wie die EU', async () =>
  {
    const res = await srv.req('GET', '/api/meta/countries');

    assert.equal(res.data.some(c => c.code === 'EU'), false);
  });
});
