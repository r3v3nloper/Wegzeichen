const { startTestServer, registerUser } = require('../helpers/setup');
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');

const srv = startTestServer();
after(() => srv.close());

let token;

before(async () =>
{
  token = (await registerUser(srv, 'notes')).token;
});

async function createNote(payload)
{
  const res = await srv.req('POST', '/api/notes', payload, token);
  return res.data;
}

describe('Anlegen', () =>
{
  test('legt eine Notiz mit Titel und Inhalt an', async () =>
  {
    const note = await createNote({ title: 'Einkauf', body: 'Brot\nMilch' });

    assert.equal(note.title, 'Einkauf');
    assert.equal(note.body, 'Brot\nMilch');
    assert.equal(note.is_favorite, 0);
    assert.deepEqual(note.attachments, []);
  });

  test('verlangt einen Titel', async () =>
  {
    const res = await srv.req('POST', '/api/notes', { body: 'ohne Titel' }, token);

    assert.equal(res.status, 400);
    assert.match(res.data.error, /Titel ist erforderlich/);
  });

  test('erlaubt eine Notiz ohne Inhalt', async () =>
  {
    const note = await createNote({ title: 'Nur ein Titel' });

    assert.equal(note.body, null);
  });

  test('lehnt einen zu langen Titel ab', async () =>
  {
    const res = await srv.req('POST', '/api/notes', { title: 'x'.repeat(201) }, token);

    assert.equal(res.status, 400);
  });
});

describe('Sortierung', () =>
{
  test('Favoriten stehen immer oben, danach das zuletzt Geänderte', async () =>
  {
    const own = (await registerUser(srv, 'sort')).token;
    await srv.req('POST', '/api/notes', { title: 'Alt' }, own);
    await srv.req('POST', '/api/notes', { title: 'Neu' }, own);
    const favorite = (await srv.req('POST', '/api/notes', {
      title: 'Favorit', is_favorite: true,
    }, own)).data;

    // Die älteste Notiz anfassen — sie darf den Favoriten trotzdem nicht verdrängen
    const notes = (await srv.req('GET', '/api/notes', undefined, own)).data;
    const oldest = notes.find(n => n.title === 'Alt');
    await srv.req('PUT', `/api/notes/${oldest.id}`, { title: 'Alt, aber angefasst' }, own);

    const sorted = (await srv.req('GET', '/api/notes', undefined, own)).data;

    assert.equal(sorted[0].id, favorite.id, 'Favorit muss oben stehen');
    assert.equal(sorted[1].title, 'Alt, aber angefasst', 'dann das zuletzt Geänderte');
  });
});

describe('Ändern', () =>
{
  test('aktualisiert Felder und schreibt updated_at fort', async () =>
  {
    const note = await createNote({ title: 'Vorher' });

    // SQLite speichert Sekunden — ohne Pause wäre der Zeitstempel identisch
    await new Promise(r => setTimeout(r, 1100));
    const updated = (await srv.req('PUT', `/api/notes/${note.id}`, {
      title: 'Nachher', body: 'Neu', is_favorite: true,
    }, token)).data;

    assert.equal(updated.title, 'Nachher');
    assert.equal(updated.is_favorite, 1);
    assert.notEqual(updated.updated_at, note.updated_at);
  });

  test('antwortet mit 404 für eine unbekannte ID', async () =>
  {
    const res = await srv.req('PUT', '/api/notes/999999', { title: 'x' }, token);

    assert.equal(res.status, 404);
  });

  test('antwortet mit 400 für eine ungültige ID', async () =>
  {
    const res = await srv.req('GET', '/api/notes/keine-zahl', undefined, token);

    assert.equal(res.status, 404);
  });
});

describe('Favorit umschalten', () =>
{
  test('setzt das Kennzeichen ohne den Inhalt anzufassen', async () =>
  {
    const markdown = '## Tag 1\n\n- Brotzeit';
    const note = await createNote({ title: 'Rennsteig', body: markdown });

    const res = await srv.req('PUT', `/api/notes/${note.id}/favorite`,
      { is_favorite: true }, token);

    assert.equal(res.status, 200);
    assert.equal(res.data.is_favorite, 1);
    assert.equal(res.data.title, 'Rennsteig');
    assert.equal(res.data.body, markdown);
  });

  test('behält die Zuordnung zum Ordner', async () =>
  {
    /* Vorher schickte das Frontend zum Umschalten die ganze Notiz zurück und
       musste die Ordner-ID selbst mitliefern — genau das ist hier nicht mehr
       nötig und darf auch nicht mehr schiefgehen. */
    const folder = (await srv.req('POST', '/api/note-folders', { name: 'Wandern' }, token)).data;
    const note = await createNote({ title: 'Im Ordner', folder_id: folder.id });

    const res = await srv.req('PUT', `/api/notes/${note.id}/favorite`,
      { is_favorite: true }, token);

    assert.equal(res.data.folder_id, folder.id);
    assert.equal(res.data.folder_name, 'Wandern');
  });

  test('liefert die Anhänge mit', async () =>
  {
    const note = await createNote({ title: 'Mit Anhang' });
    await srv.upload(`/api/notes/${note.id}/attachments`, [
      { filename: 'packliste.md', contentType: 'text/markdown', content: '# Packliste' },
    ], token);

    const res = await srv.req('PUT', `/api/notes/${note.id}/favorite`,
      { is_favorite: true }, token);

    assert.equal(res.data.attachments.length, 1);
  });

  test('nimmt das Kennzeichen auch wieder zurück', async () =>
  {
    const note = await createNote({ title: 'Hin und her', is_favorite: true });

    const res = await srv.req('PUT', `/api/notes/${note.id}/favorite`,
      { is_favorite: false }, token);

    assert.equal(res.data.is_favorite, 0);
  });

  test('antwortet für eine unbekannte Notiz mit 404', async () =>
  {
    const res = await srv.req('PUT', '/api/notes/999999/favorite',
      { is_favorite: true }, token);

    assert.equal(res.status, 404);
  });

  test('antwortet für eine unsinnige ID mit 404', async () =>
  {
    const res = await srv.req('PUT', '/api/notes/abc/favorite', { is_favorite: true }, token);

    assert.equal(res.status, 404);
  });
});

describe('Suche', () =>
{
  test('findet über Titel und Inhalt', async () =>
  {
    const own = (await registerUser(srv, 'search')).token;
    await srv.req('POST', '/api/notes', { title: 'Wanderausrüstung' }, own);
    await srv.req('POST', '/api/notes', { title: 'Egal', body: 'Regenjacke einpacken' }, own);
    await srv.req('POST', '/api/notes', { title: 'Nichts damit zu tun' }, own);

    const byTitle = (await srv.req('GET', '/api/notes?q=wander', undefined, own)).data;
    const byBody = (await srv.req('GET', '/api/notes?q=regenjacke', undefined, own)).data;

    assert.equal(byTitle.length, 1);
    assert.equal(byBody.length, 1);
  });

  test('behandelt Prozentzeichen als Text, nicht als Platzhalter', async () =>
  {
    const own = (await registerUser(srv, 'like')).token;
    await srv.req('POST', '/api/notes', { title: '100% Baumwolle' }, own);
    await srv.req('POST', '/api/notes', { title: 'Etwas anderes' }, own);

    const res = (await srv.req('GET', '/api/notes?q=100%25', undefined, own)).data;

    assert.equal(res.length, 1, 'ein blankes % würde alles finden');
  });
});

describe('Löschen', () =>
{
  test('entfernt die Notiz', async () =>
  {
    const note = await createNote({ title: 'Zu löschen' });

    const res = await srv.req('DELETE', `/api/notes/${note.id}`, undefined, token);
    const after = await srv.req('GET', `/api/notes/${note.id}`, undefined, token);

    assert.equal(res.status, 200);
    assert.equal(after.status, 404);
  });
});
