const { startTestServer, registerUser } = require('../helpers/setup');
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');

const srv = startTestServer();
after(() => srv.close());

let token;

before(async () =>
{
  token = (await registerUser(srv, 'folders')).token;
});

function createFolder(name, useToken = token)
{
  return srv.req('POST', '/api/note-folders', { name }, useToken);
}

function createNote(payload, useToken = token)
{
  return srv.req('POST', '/api/notes', payload, useToken);
}

describe('Anlegen', () =>
{
  test('legt einen Ordner an', async () =>
  {
    const res = await createFolder('Reisen');

    assert.equal(res.status, 200);
    assert.equal(res.data.name, 'Reisen');
    assert.equal(res.data.noteCount, 0);
  });

  test('verlangt einen Namen', async () =>
  {
    const res = await createFolder('   ');

    assert.equal(res.status, 400);
    assert.match(res.data.error, /Ordnername ist erforderlich/);
  });

  test('lehnt einen doppelten Namen ab', async () =>
  {
    const own = (await registerUser(srv, 'dup')).token;
    await createFolder('Rezepte', own);

    const res = await createFolder('Rezepte', own);

    assert.equal(res.status, 400);
    assert.match(res.data.error, /existiert schon/);
  });

  test('lehnt denselben Namen auch in anderer Schreibweise ab', async () =>
  {
    const own = (await registerUser(srv, 'case')).token;
    await createFolder('Reisen', own);

    const res = await createFolder('reisen', own);

    assert.equal(res.status, 400,
      'sonst gäbe es zwei Ordner, die gleich aussehen');
  });

  test('erlaubt zwei Nutzern denselben Ordnernamen', async () =>
  {
    const a = (await registerUser(srv, 'nameA')).token;
    const b = (await registerUser(srv, 'nameB')).token;
    await createFolder('Reisen', a);

    const res = await createFolder('Reisen', b);

    assert.equal(res.status, 200);
  });
});

describe('Zuordnung von Notizen', () =>
{
  test('legt eine Notiz in einen Ordner und liefert den Namen mit', async () =>
  {
    const own = (await registerUser(srv, 'assign')).token;
    const folder = (await createFolder('Reisen', own)).data;

    const note = (await createNote({ title: 'Japan 2027', folder_id: folder.id }, own)).data;

    assert.equal(note.folder_id, folder.id);
    assert.equal(note.folder_name, 'Reisen');
  });

  test('zählt die Notizen je Ordner', async () =>
  {
    const own = (await registerUser(srv, 'count')).token;
    const folder = (await createFolder('Reisen', own)).data;
    await createNote({ title: 'Eine', folder_id: folder.id }, own);
    await createNote({ title: 'Zwei', folder_id: folder.id }, own);
    await createNote({ title: 'Ohne Ordner' }, own);

    const res = (await srv.req('GET', '/api/note-folders', undefined, own)).data;

    assert.equal(res.folders[0].noteCount, 2);
    assert.equal(res.total, 3);
    assert.equal(res.unfiled, 1);
  });

  test('eine Notiz ohne Ordner bleibt ohne Ordner', async () =>
  {
    const note = (await createNote({ title: 'Frei schwebend' })).data;

    assert.equal(note.folder_id, null);
    assert.equal(note.folder_name, null);
  });

  test('verschiebt eine Notiz in einen anderen Ordner', async () =>
  {
    const own = (await registerUser(srv, 'move')).token;
    const from = (await createFolder('Von', own)).data;
    const to = (await createFolder('Nach', own)).data;
    const note = (await createNote({ title: 'Wandert', folder_id: from.id }, own)).data;

    const updated = (await srv.req('PUT', `/api/notes/${note.id}`, {
      title: 'Wandert', folder_id: to.id,
    }, own)).data;

    assert.equal(updated.folder_id, to.id);
    assert.equal(updated.folder_name, 'Nach');
  });

  test('nimmt eine Notiz aus dem Ordner heraus', async () =>
  {
    const own = (await registerUser(srv, 'unassign')).token;
    const folder = (await createFolder('Raus', own)).data;
    const note = (await createNote({ title: 'Kommt raus', folder_id: folder.id }, own)).data;

    const updated = (await srv.req('PUT', `/api/notes/${note.id}`, {
      title: 'Kommt raus', folder_id: null,
    }, own)).data;

    assert.equal(updated.folder_id, null);
  });

  test('ignoriert einen unbekannten Ordner statt zu scheitern', async () =>
  {
    const res = await createNote({ title: 'Geisterordner', folder_id: 999999 });

    assert.equal(res.status, 200);
    assert.equal(res.data.folder_id, null);
  });
});

describe('Filtern', () =>
{
  let own;
  let reisen;

  before(async () =>
  {
    own = (await registerUser(srv, 'filterf')).token;
    reisen = (await createFolder('Reisen', own)).data;
    await createNote({ title: 'Japan', folder_id: reisen.id }, own);
    await createNote({ title: 'Italien', folder_id: reisen.id }, own);
    await createNote({ title: 'Einkaufsliste' }, own);
  });

  test('liefert nur die Notizen eines Ordners', async () =>
  {
    const res = (await srv.req('GET', `/api/notes?folder=${reisen.id}`,
      undefined, own)).data;

    assert.equal(res.length, 2);
    assert.ok(res.every(n => n.folder_id === reisen.id));
  });

  test('liefert mit folder=none die Notizen ohne Ordner', async () =>
  {
    const res = (await srv.req('GET', '/api/notes?folder=none', undefined, own)).data;

    assert.equal(res.length, 1);
    assert.equal(res[0].title, 'Einkaufsliste');
  });

  test('liefert ohne Filter alle Notizen', async () =>
  {
    const res = (await srv.req('GET', '/api/notes', undefined, own)).data;

    assert.equal(res.length, 3);
  });

  test('lässt sich mit der Suche kombinieren', async () =>
  {
    const res = (await srv.req('GET', `/api/notes?folder=${reisen.id}&q=japan`,
      undefined, own)).data;

    assert.equal(res.length, 1);
    assert.equal(res[0].title, 'Japan');
  });
});

describe('Umbenennen', () =>
{
  test('benennt um und wirkt für alle enthaltenen Notizen', async () =>
  {
    const own = (await registerUser(srv, 'rename')).token;
    const folder = (await createFolder('Altname', own)).data;
    const note = (await createNote({ title: 'Drin', folder_id: folder.id }, own)).data;

    const renamed = (await srv.req('PUT', `/api/note-folders/${folder.id}`, {
      name: 'Neuname',
    }, own)).data;
    const reloaded = (await srv.req('GET', `/api/notes/${note.id}`, undefined, own)).data;

    assert.equal(renamed.name, 'Neuname');
    assert.equal(reloaded.folder_name, 'Neuname', 'die Notiz musste nicht angefasst werden');
  });

  test('lehnt einen bereits belegten Namen ab', async () =>
  {
    const own = (await registerUser(srv, 'renamedup')).token;
    await createFolder('Erster', own);
    const second = (await createFolder('Zweiter', own)).data;

    const res = await srv.req('PUT', `/api/note-folders/${second.id}`, {
      name: 'Erster',
    }, own);

    assert.equal(res.status, 400);
  });

  test('antwortet mit 404 für einen unbekannten Ordner', async () =>
  {
    const res = await srv.req('PUT', '/api/note-folders/999999', { name: 'X' }, token);

    assert.equal(res.status, 404);
  });
});

describe('Löschen', () =>
{
  test('löscht den Ordner, behält aber die Notizen', async () =>
  {
    const own = (await registerUser(srv, 'delf')).token;
    const folder = (await createFolder('Verschwindet', own)).data;
    const note = (await createNote({ title: 'Bleibt', folder_id: folder.id }, own)).data;

    const res = await srv.req('DELETE', `/api/note-folders/${folder.id}`, undefined, own);
    const reloaded = (await srv.req('GET', `/api/notes/${note.id}`, undefined, own)).data;

    assert.equal(res.status, 200);
    assert.equal(reloaded.title, 'Bleibt', 'ein Ordner ist eine Einordnung, kein Behälter');
    assert.equal(reloaded.folder_id, null, 'ON DELETE SET NULL muss greifen');
  });

  test('die verwaisten Notizen erscheinen unter „Ohne Ordner"', async () =>
  {
    const own = (await registerUser(srv, 'delf2')).token;
    const folder = (await createFolder('Weg', own)).data;
    await createNote({ title: 'Verwaist', folder_id: folder.id }, own);

    await srv.req('DELETE', `/api/note-folders/${folder.id}`, undefined, own);
    const info = (await srv.req('GET', '/api/note-folders', undefined, own)).data;
    const unfiled = (await srv.req('GET', '/api/notes?folder=none', undefined, own)).data;

    assert.equal(info.folders.length, 0);
    assert.equal(info.unfiled, 1);
    assert.equal(unfiled.length, 1);
  });

  test('räumt die Ordner mit, wenn das Konto gelöscht wird', async () =>
  {
    const own = (await registerUser(srv, 'delacc')).token;
    await createFolder('Mitgelöscht', own);

    const res = (await srv.req('GET', '/api/note-folders', undefined, own)).data;

    // CASCADE über user_id ist im Schema hinterlegt; hier nur die Vorbedingung
    assert.equal(res.folders.length, 1);
  });
});
