const fs = require('fs');
const path = require('path');
const { startTestServer, registerUser } = require('../helpers/setup');
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');
const { LIMITS, attachmentDir } = require('../../utils/attachments');

const srv = startTestServer();
after(() => srv.close());

let token;
let noteId;

before(async () =>
{
  token = (await registerUser(srv, 'att')).token;
  noteId = (await srv.req('POST', '/api/notes', { title: 'Mit Anhängen' }, token)).data.id;
});

function upload(files, targetNote = noteId, useToken = token)
{
  return srv.upload(`/api/notes/${targetNote}/attachments`, files, useToken);
}

const textFile = (name, content = 'Inhalt') =>
  ({ filename: name, contentType: 'text/plain', content });

describe('Hochladen', () =>
{
  test('nimmt eine erlaubte Datei an', async () =>
  {
    const res = await upload([textFile('notiz.txt', 'Hallo Welt')]);

    assert.equal(res.status, 200);
    assert.equal(res.data[0].original_name, 'notiz.txt');
    assert.equal(res.data[0].size_bytes, 10);
    // Der gespeicherte Name darf niemals nach außen gelangen
    assert.equal(res.data[0].stored_name, undefined);
  });

  test('legt die Datei unter einem generierten Namen ab', async () =>
  {
    const note = (await srv.req('POST', '/api/notes', { title: 'Ablage' }, token)).data;
    await upload([textFile('mein dokument.txt')], note.id);

    const stored = fs.readdirSync(attachmentDir());

    assert.equal(stored.some(name => name.includes('mein dokument')), false,
      'der Originalname darf nicht als Dateiname verwendet werden');
    assert.ok(stored.some(name => /^[0-9a-f-]{36}\.txt$/.test(name)));
  });

  test('lehnt einen unerlaubten Dateityp ab', async () =>
  {
    const res = await upload([
      { filename: 'virus.exe', contentType: 'application/x-msdownload', content: 'MZ' },
    ]);

    assert.equal(res.status, 400);
    assert.match(res.data.error, /Dateityp nicht erlaubt/);
  });

  test('lehnt eine umbenannte Datei mit erlaubtem MIME-Typ ab', async () =>
  {
    const res = await upload([
      { filename: 'nutzlast.exe', contentType: 'application/pdf', content: 'MZ' },
    ]);

    assert.equal(res.status, 400);
  });

  test('lehnt eine zu große Datei ab', async () =>
  {
    const res = await upload([
      textFile('riesig.txt', 'x'.repeat(LIMITS.maxFileBytes + 1024)),
    ]);

    assert.equal(res.status, 400);
    assert.match(res.data.error, /zu groß/);
  });

  test('verlangt mindestens eine Datei', async () =>
  {
    const res = await upload([]);

    assert.equal(res.status, 400);
    assert.match(res.data.error, /Keine Datei/);
  });

  test('begrenzt die Anzahl der Anhänge pro Notiz', async () =>
  {
    const note = (await srv.req('POST', '/api/notes', { title: 'Voll' }, token)).data;

    for (let i = 0; i < LIMITS.maxFilesPerNote; i++)
    {
      const res = await upload([textFile(`datei${i}.txt`)], note.id);
      assert.equal(res.status, 200, `Datei ${i} sollte durchgehen`);
    }

    const overflow = await upload([textFile('eine-zuviel.txt')], note.id);

    assert.equal(overflow.status, 400);
    assert.match(overflow.data.error, /Maximal 5 Anhänge/);
  });

  test('zählt bereits vorhandene Anhänge bei einem Sammel-Upload mit', async () =>
  {
    const note = (await srv.req('POST', '/api/notes', { title: 'Sammel' }, token)).data;
    await upload([textFile('a.txt'), textFile('b.txt'), textFile('c.txt')], note.id);

    const res = await upload([textFile('d.txt'), textFile('e.txt'), textFile('f.txt')], note.id);

    assert.equal(res.status, 400, '3 vorhandene + 3 neue überschreiten das Limit von 5');
  });
});

describe('Herunterladen', () =>
{
  test('liefert den Inhalt mit Schutz-Headern', async () =>
  {
    const note = (await srv.req('POST', '/api/notes', { title: 'Download' }, token)).data;
    const attachment = (await upload([textFile('brief.txt', 'Sehr geehrte')], note.id)).data[0];

    const res = await srv.raw(
      `/api/notes/${note.id}/attachments/${attachment.id}/file`, token
    );

    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'Sehr geehrte');
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
    assert.match(res.headers.get('content-disposition'), /attachment/);
    assert.match(res.headers.get('content-disposition'), /brief\.txt/);
  });

  test('setzt den Dateinamen UTF-8-kodiert in den Header', async () =>
  {
    const note = (await srv.req('POST', '/api/notes', { title: 'Umlaut' }, token)).data;
    const attachment = (await upload([textFile('Höhenprofil.txt')], note.id)).data[0];

    const res = await srv.raw(
      `/api/notes/${note.id}/attachments/${attachment.id}/file`, token
    );

    assert.match(res.headers.get('content-disposition'), /UTF-8''H%C3%B6henprofil\.txt/);
  });

  test('lehnt eine ungültige Anhang-ID ab', async () =>
  {
    const res = await srv.raw(`/api/notes/${noteId}/attachments/0/file`, token);

    assert.equal(res.status, 400);
  });

  test('kann keinen Anhang einer fremden Notiz über die ID ziehen', async () =>
  {
    const noteA = (await srv.req('POST', '/api/notes', { title: 'A' }, token)).data;
    const noteB = (await srv.req('POST', '/api/notes', { title: 'B' }, token)).data;
    const attachment = (await upload([textFile('a.txt')], noteA.id)).data[0];

    // Gültiger Anhang, aber die falsche Notiz im Pfad
    const res = await srv.raw(
      `/api/notes/${noteB.id}/attachments/${attachment.id}/file`, token
    );

    assert.equal(res.status, 404);
  });

  test('verlangt eine Anmeldung', async () =>
  {
    const res = await srv.raw(`/api/notes/${noteId}/attachments/1/file`);

    assert.equal(res.status, 401);
  });
});

describe('Löschen', () =>
{
  test('entfernt Metadaten und Datei', async () =>
  {
    const note = (await srv.req('POST', '/api/notes', { title: 'Weg damit' }, token)).data;
    const attachment = (await upload([textFile('temp.txt')], note.id)).data[0];
    const before = fs.readdirSync(attachmentDir()).length;

    const res = await srv.req(
      'DELETE', `/api/notes/${note.id}/attachments/${attachment.id}`, undefined, token
    );

    assert.equal(res.status, 200);
    assert.equal(fs.readdirSync(attachmentDir()).length, before - 1);

    const detail = await srv.req('GET', `/api/notes/${note.id}`, undefined, token);
    assert.equal(detail.data.attachments.length, 0);
  });

  test('räumt die Dateien mit, wenn die Notiz gelöscht wird', async () =>
  {
    const note = (await srv.req('POST', '/api/notes', { title: 'Kaskade' }, token)).data;
    await upload([textFile('x.txt'), textFile('y.txt')], note.id);
    const before = fs.readdirSync(attachmentDir()).length;

    await srv.req('DELETE', `/api/notes/${note.id}`, undefined, token);

    assert.equal(fs.readdirSync(attachmentDir()).length, before - 2,
      'CASCADE räumt nur die Datenbank — die Dateien muss die Route selbst entfernen');
  });

  test('räumt die Dateien mit, wenn ein Konto gelöscht wird', async () =>
  {
    const adminToken = await makeAdmin();
    const victim = await registerUser(srv, 'opfer');
    const note = (await srv.req('POST', '/api/notes', { title: 'Opfer' }, victim.token)).data;
    await upload([textFile('opfer.txt')], note.id, victim.token);
    const before = fs.readdirSync(attachmentDir()).length;

    const res = await srv.req('DELETE', `/api/admin/users/${victim.user.id}`,
      undefined, adminToken);

    assert.equal(res.status, 200);
    assert.equal(fs.readdirSync(attachmentDir()).length, before - 1);
  });
});

/* Der Admin-Seed läuft nur beim Start mit gesetztem ADMIN_PASSWORD; für den Test
   wird ein normaler Nutzer direkt in der Datenbank zum Admin gemacht. */
async function makeAdmin()
{
  const admin = await registerUser(srv, 'chef');
  const db = require('../../db');
  db.prepare('UPDATE users SET is_admin = 1 WHERE id = ?').run(admin.user.id);
  return admin.token;
}

describe('Ablageverzeichnis', () =>
{
  test('liegt unter DATA_DIR', () =>
  {
    assert.equal(attachmentDir(), path.join(process.env.DATA_DIR, 'attachments'));
  });
});
