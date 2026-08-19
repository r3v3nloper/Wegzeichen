/* Die Nutzerverwaltung ist der Teil der API mit der größten Wirkung: sie löscht
   fremde Konten samt Inhalten und setzt fremde Passwörter. Geprüft war bisher
   nur, dass Unbefugte abgewiesen werden (tests/routes/isolation.test.js) — nicht,
   dass die Aktionen selbst richtig arbeiten. */
const { startTestServer, registerUser, registerAdmin } = require('../helpers/setup');
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const db = require('../../db');
const files = require('../../utils/attachments');

const srv = startTestServer();
after(() => srv.close());

let admin;

before(async () =>
{
  admin = await registerAdmin(srv, 'chef');
});

/* Legt einen Nutzer mit je einem Eintrag pro Modul an — inklusive Anhang, damit
   sich das Aufräumen der Dateien prüfen lässt. */
async function userWithData(suffix)
{
  const user = await registerUser(srv, suffix);

  const note = (await srv.req('POST', '/api/notes', {
    title: 'Notiz von ' + suffix, body: 'Inhalt',
  }, user.token)).data;

  await srv.req('POST', '/api/spots', {
    is_place: true, name: 'Ort von ' + suffix,
  }, user.token);

  await srv.req('POST', '/api/trips', {
    title: 'Reise von ' + suffix,
    stages: [{ location_name: 'Irgendwo', day_from: 1 }],
  }, user.token);

  await srv.upload(`/api/notes/${note.id}/attachments`, [
    { filename: 'packliste.md', contentType: 'text/markdown', content: '# Packliste' },
  ], user.token);

  const stored = db.prepare(`
    SELECT a.stored_name
    FROM note_attachments a
    JOIN notes n ON n.id = a.note_id
    WHERE n.user_id = ?
  `).all(user.user.id).map(row => row.stored_name);

  return { ...user, noteId: note.id, stored };
}

function countRows(table, userId)
{
  return db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE user_id = ?`).get(userId).c;
}

describe('Zugang zur Nutzerverwaltung', () =>
{
  test('weist Anfragen ohne Token ab', async () =>
  {
    const res = await srv.req('GET', '/api/admin/users');

    assert.equal(res.status, 401);
  });

  test('weist einen angemeldeten Nutzer ohne Adminrecht ab', async () =>
  {
    const user = await registerUser(srv, 'ohnerecht');
    const res = await srv.req('GET', '/api/admin/users', undefined, user.token);

    assert.equal(res.status, 403);
  });
});

describe('Nutzerliste', () =>
{
  test('führt normale Konten mit der Anzahl ihrer Einträge auf', async () =>
  {
    const user = await userWithData('liste1');

    const res = await srv.req('GET', '/api/admin/users', undefined, admin.token);

    assert.equal(res.status, 200);
    const entry = res.data.find(u => u.id === user.user.id);
    assert.ok(entry, 'der angelegte Nutzer muss in der Liste stehen');
    assert.equal(entry.noteCount, 1);
    assert.equal(entry.spotCount, 1);
    assert.equal(entry.tripCount, 1);
  });

  test('führt Administratoren nicht auf', async () =>
  {
    /* Sonst könnte ein Admin über die Liste das Konto eines anderen Admins
       ins Visier nehmen. */
    const res = await srv.req('GET', '/api/admin/users', undefined, admin.token);

    assert.equal(res.data.some(u => u.id === admin.user.id), false);
  });

  test('gibt keine Passwort-Hashes und keine Token-Version heraus', async () =>
  {
    const res = await srv.req('GET', '/api/admin/users', undefined, admin.token);

    res.data.forEach(u =>
    {
      assert.equal(u.password_hash, undefined);
      assert.equal(u.token_version, undefined);
    });
  });
});

describe('Konto löschen', () =>
{
  test('entfernt das Konto samt Notizen, Zielen und Reisen', async () =>
  {
    const user = await userWithData('weg1');
    const id = user.user.id;

    const res = await srv.req('DELETE', `/api/admin/users/${id}`, undefined, admin.token);

    assert.equal(res.status, 200);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM users WHERE id = ?').get(id).c, 0);
    assert.equal(countRows('notes', id), 0);
    assert.equal(countRows('spots', id), 0);
    assert.equal(countRows('trips', id), 0);
  });

  test('entfernt die Anhangsdateien von der Platte', async () =>
  {
    /* CASCADE räumt nur die Datenbankzeilen. Bleiben die Dateien liegen, wächst
       das Datenverzeichnis mit jedem gelöschten Konto — und zwar unsichtbar. */
    const user = await userWithData('weg2');
    const paths = user.stored.map(name => files.resolveStoredPath(name));
    assert.equal(paths.length, 1);
    assert.ok(fs.existsSync(paths[0]), 'die Datei muss vor dem Löschen existieren');

    await srv.req('DELETE', `/api/admin/users/${user.user.id}`, undefined, admin.token);

    assert.equal(fs.existsSync(paths[0]), false);
  });

  test('macht den Token des gelöschten Nutzers ungültig', async () =>
  {
    const user = await registerUser(srv, 'weg3');

    await srv.req('DELETE', `/api/admin/users/${user.user.id}`, undefined, admin.token);
    const res = await srv.req('GET', '/api/auth/me', undefined, user.token);

    assert.equal(res.status, 401);
  });

  test('lehnt das eigene Konto ab', async () =>
  {
    const res = await srv.req('DELETE', `/api/admin/users/${admin.user.id}`,
      undefined, admin.token);

    assert.equal(res.status, 400);
    assert.match(res.data.error, /Eigenes Konto/);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM users WHERE id = ?')
      .get(admin.user.id).c, 1);
  });

  test('lehnt das Konto eines anderen Admins ab', async () =>
  {
    const other = await registerAdmin(srv, 'chef2');

    const res = await srv.req('DELETE', `/api/admin/users/${other.user.id}`,
      undefined, admin.token);

    assert.equal(res.status, 403);
    assert.equal(db.prepare('SELECT COUNT(*) AS c FROM users WHERE id = ?')
      .get(other.user.id).c, 1);
  });

  test('antwortet für ein unbekanntes Konto mit 404', async () =>
  {
    const res = await srv.req('DELETE', '/api/admin/users/999999', undefined, admin.token);

    assert.equal(res.status, 404);
  });

  test('antwortet für eine unsinnige ID mit 400', async () =>
  {
    const res = await srv.req('DELETE', '/api/admin/users/abc', undefined, admin.token);

    assert.equal(res.status, 400);
  });
});

describe('Passwort setzen', () =>
{
  test('setzt ein Passwort, mit dem sich der Nutzer anmelden kann', async () =>
  {
    const user = await registerUser(srv, 'pw1');

    const res = await srv.req('PUT', `/api/admin/users/${user.user.id}/password`,
      { password: 'vomAdminGesetzt1' }, admin.token);

    assert.equal(res.status, 200);

    const login = await srv.req('POST', '/api/auth/login', {
      email: user.user.email, password: 'vomAdminGesetzt1',
    });
    assert.equal(login.status, 200);
  });

  test('macht die bestehenden Sitzungen des Nutzers ungültig', async () =>
  {
    /* Ein zurückgesetztes Passwort soll auch den aussperren, der sich mit dem
       alten schon angemeldet hatte. */
    const user = await registerUser(srv, 'pw2');

    await srv.req('PUT', `/api/admin/users/${user.user.id}/password`,
      { password: 'ganzNeuesPasswort2' }, admin.token);

    const res = await srv.req('GET', '/api/auth/me', undefined, user.token);
    assert.equal(res.status, 401);
  });

  test('das alte Passwort funktioniert danach nicht mehr', async () =>
  {
    const user = await registerUser(srv, 'pw3');

    await srv.req('PUT', `/api/admin/users/${user.user.id}/password`,
      { password: 'ganzNeuesPasswort3' }, admin.token);

    const res = await srv.req('POST', '/api/auth/login', {
      email: user.user.email, password: 'geheim123',
    });
    assert.equal(res.status, 401);
  });

  test('lehnt ein zu kurzes Passwort ab', async () =>
  {
    const user = await registerUser(srv, 'pw4');

    const res = await srv.req('PUT', `/api/admin/users/${user.user.id}/password`,
      { password: '123' }, admin.token);

    assert.equal(res.status, 400);
    assert.match(res.data.error, /Passwort/);
  });

  test('lehnt eine fehlende Angabe ab', async () =>
  {
    const user = await registerUser(srv, 'pw5');

    const res = await srv.req('PUT', `/api/admin/users/${user.user.id}/password`,
      {}, admin.token);

    assert.equal(res.status, 400);
  });

  test('lässt Leerzeichen im Passwort unangetastet', async () =>
  {
    const user = await registerUser(srv, 'pw6');

    await srv.req('PUT', `/api/admin/users/${user.user.id}/password`,
      { password: '  mitLeerzeichen6  ' }, admin.token);

    const withSpaces = await srv.req('POST', '/api/auth/login', {
      email: user.user.email, password: '  mitLeerzeichen6  ',
    });
    const trimmed = await srv.req('POST', '/api/auth/login', {
      email: user.user.email, password: 'mitLeerzeichen6',
    });

    assert.equal(withSpaces.status, 200);
    assert.equal(trimmed.status, 401);
  });

  test('lehnt das Konto eines Admins ab', async () =>
  {
    /* Dieselbe Grenze wie beim Löschen: ein Admin greift nicht in das Konto
       eines anderen Admins ein. Sein eigenes ändert er über das Profil. */
    const other = await registerAdmin(srv, 'chef3');

    const res = await srv.req('PUT', `/api/admin/users/${other.user.id}/password`,
      { password: 'uebernahmeVersuch1' }, admin.token);

    assert.equal(res.status, 403);

    const login = await srv.req('POST', '/api/auth/login', {
      email: other.user.email, password: 'geheim123',
    });
    assert.equal(login.status, 200, 'das alte Passwort muss weiter gelten');
  });

  test('antwortet für ein unbekanntes Konto mit 404', async () =>
  {
    const res = await srv.req('PUT', '/api/admin/users/999999/password',
      { password: 'irgendeinPasswort' }, admin.token);

    assert.equal(res.status, 404);
  });

  test('antwortet für eine unsinnige ID mit 400', async () =>
  {
    const res = await srv.req('PUT', '/api/admin/users/abc/password',
      { password: 'irgendeinPasswort' }, admin.token);

    assert.equal(res.status, 400);
  });
});
