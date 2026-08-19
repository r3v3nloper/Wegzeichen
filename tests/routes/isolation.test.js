/* Der wichtigste Test dieser App: Wegzeichen ist mehrbenutzerfähig mit strikt
   getrennten Daten. Jede Ressource wird für jede Methode geprüft — ein
   fehlender user_id-Filter in einer einzigen Abfrage würde hier auffallen. */
const { startTestServer, registerUser } = require('../helpers/setup');
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');

const srv = startTestServer();
after(() => srv.close());

let alice;
let bob;
let aliceNote;
let aliceSpot;
let aliceTrip;
let aliceAttachmentId;
let aliceFolder;

before(async () =>
{
  alice = await registerUser(srv, 'alice');
  bob = await registerUser(srv, 'bob');

  aliceFolder = (await srv.req('POST', '/api/note-folders', {
    name: 'Alices Ordner',
  }, alice.token)).data;

  aliceNote = (await srv.req('POST', '/api/notes', {
    title: 'Alices Geheimnis', body: 'Streng vertraulich', folder_id: aliceFolder.id,
  }, alice.token)).data;

  aliceSpot = (await srv.req('POST', '/api/spots', {
    is_place: true, name: 'Alices Hotel', country: 'DE', lat: 51, lng: 7,
  }, alice.token)).data;

  aliceTrip = (await srv.req('POST', '/api/trips', {
    title: 'Alices Reise', stages: [{ location_name: 'Rom', day_from: 1, day_to: 3 }],
  }, alice.token)).data;

  const upload = await srv.upload(`/api/notes/${aliceNote.id}/attachments`, [
    { filename: 'geheim.txt', contentType: 'text/plain', content: 'vertraulich' },
  ], alice.token);
  aliceAttachmentId = upload.data[0].id;
});

describe('Notizen', () =>
{
  test('Bob sieht Alices Notiz nicht in seiner Liste', async () =>
  {
    const res = await srv.req('GET', '/api/notes', undefined, bob.token);

    assert.equal(res.data.length, 0);
  });

  test('Bob kann Alices Notiz nicht einzeln lesen', async () =>
  {
    const res = await srv.req('GET', `/api/notes/${aliceNote.id}`, undefined, bob.token);

    assert.equal(res.status, 404);
  });

  test('Bob kann Alices Notiz nicht ändern', async () =>
  {
    const res = await srv.req('PUT', `/api/notes/${aliceNote.id}`, {
      title: 'Gekapert',
    }, bob.token);

    assert.equal(res.status, 404);

    const unchanged = await srv.req('GET', `/api/notes/${aliceNote.id}`, undefined, alice.token);
    assert.equal(unchanged.data.title, 'Alices Geheimnis');
  });

  test('Bob kann Alices Notiz nicht zum Favoriten machen', async () =>
  {
    const res = await srv.req('PUT', `/api/notes/${aliceNote.id}/favorite`, {
      is_favorite: true,
    }, bob.token);

    assert.equal(res.status, 404);

    const unchanged = await srv.req('GET', `/api/notes/${aliceNote.id}`, undefined, alice.token);
    assert.equal(unchanged.data.is_favorite, 0);
  });

  test('Bob kann Alices Notiz nicht löschen', async () =>
  {
    const res = await srv.req('DELETE', `/api/notes/${aliceNote.id}`, undefined, bob.token);

    assert.equal(res.status, 404);

    const stillThere = await srv.req('GET', `/api/notes/${aliceNote.id}`, undefined, alice.token);
    assert.equal(stillThere.status, 200);
  });
});

describe('Notiz-Ordner', () =>
{
  test('Bob sieht Alices Ordner nicht in seiner Liste', async () =>
  {
    const res = await srv.req('GET', '/api/note-folders', undefined, bob.token);

    assert.equal(res.data.folders.length, 0);
    assert.equal(res.data.total, 0);
  });

  test('Bob kann Alices Ordner nicht umbenennen oder löschen', async () =>
  {
    const rename = await srv.req('PUT', `/api/note-folders/${aliceFolder.id}`, {
      name: 'Gekapert',
    }, bob.token);
    const remove = await srv.req('DELETE', `/api/note-folders/${aliceFolder.id}`,
      undefined, bob.token);

    assert.equal(rename.status, 404);
    assert.equal(remove.status, 404);
  });

  test('Bob kann seine Notiz nicht in Alices Ordner legen', async () =>
  {
    const created = await srv.req('POST', '/api/notes', {
      title: 'Bobs Notiz', folder_id: aliceFolder.id,
    }, bob.token);

    assert.equal(created.status, 200);
    // Die fremde Zuordnung wird verworfen, statt den Ordnernamen zu verraten
    assert.equal(created.data.folder_id, null);
    assert.equal(created.data.folder_name, null);
  });

  test('Bob kann Alices Notizen nicht über deren Ordner-ID filtern', async () =>
  {
    const res = await srv.req('GET', `/api/notes?folder=${aliceFolder.id}`,
      undefined, bob.token);

    assert.equal(res.data.length, 0);
  });
});

describe('Anhänge', () =>
{
  test('Bob kann Alices Anhang nicht herunterladen', async () =>
  {
    const res = await srv.raw(
      `/api/notes/${aliceNote.id}/attachments/${aliceAttachmentId}/file`, bob.token
    );

    assert.equal(res.status, 404);
  });

  test('Bob kann Alices Anhang nicht löschen', async () =>
  {
    const res = await srv.req(
      'DELETE', `/api/notes/${aliceNote.id}/attachments/${aliceAttachmentId}`,
      undefined, bob.token
    );

    assert.equal(res.status, 404);
  });

  test('Bob kann keine Datei an Alices Notiz hängen', async () =>
  {
    const res = await srv.upload(`/api/notes/${aliceNote.id}/attachments`, [
      { filename: 'fremd.txt', contentType: 'text/plain', content: 'x' },
    ], bob.token);

    assert.equal(res.status, 404);
  });

  test('Alice kann ihren Anhang weiterhin herunterladen', async () =>
  {
    const res = await srv.raw(
      `/api/notes/${aliceNote.id}/attachments/${aliceAttachmentId}/file`, alice.token
    );

    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'vertraulich');
  });
});

describe('Orte und Wanderwege', () =>
{
  test('Bob sieht Alices Ort nicht in seiner Liste', async () =>
  {
    const res = await srv.req('GET', '/api/spots', undefined, bob.token);

    assert.equal(res.data.length, 0);
  });

  test('Bob kann Alices Ort nicht lesen, ändern oder löschen', async () =>
  {
    const read = await srv.req('GET', `/api/spots/${aliceSpot.id}`, undefined, bob.token);
    const write = await srv.req('PUT', `/api/spots/${aliceSpot.id}`, {
      name: 'Gekapert',
    }, bob.token);
    const remove = await srv.req('DELETE', `/api/spots/${aliceSpot.id}`, undefined, bob.token);

    assert.equal(read.status, 404);
    assert.equal(write.status, 404);
    assert.equal(remove.status, 404);
  });

  test('Bob kann Alices Ort nicht zum Favoriten machen', async () =>
  {
    const res = await srv.req('PUT', `/api/spots/${aliceSpot.id}/favorite`, {
      is_favorite: true,
    }, bob.token);

    assert.equal(res.status, 404);

    const unchanged = await srv.req('GET', `/api/spots/${aliceSpot.id}`, undefined, alice.token);
    assert.equal(unchanged.data.is_favorite, 0);
  });
});

describe('Reisen', () =>
{
  test('Bob sieht Alices Reise nicht in seiner Liste', async () =>
  {
    const res = await srv.req('GET', '/api/trips', undefined, bob.token);

    assert.equal(res.data.length, 0);
  });

  test('Bob kann Alices Reise nicht lesen, ändern oder löschen', async () =>
  {
    const read = await srv.req('GET', `/api/trips/${aliceTrip.id}`, undefined, bob.token);
    const write = await srv.req('PUT', `/api/trips/${aliceTrip.id}`, {
      title: 'Gekapert',
    }, bob.token);
    const remove = await srv.req('DELETE', `/api/trips/${aliceTrip.id}`, undefined, bob.token);

    assert.equal(read.status, 404);
    assert.equal(write.status, 404);
    assert.equal(remove.status, 404);
  });

  test('Bob kann Alices Reise nicht zum Favoriten machen', async () =>
  {
    const res = await srv.req('PUT', `/api/trips/${aliceTrip.id}/favorite`, {
      is_favorite: true,
    }, bob.token);

    assert.equal(res.status, 404);

    const unchanged = await srv.req('GET', `/api/trips/${aliceTrip.id}`, undefined, alice.token);
    assert.equal(unchanged.data.is_favorite, 0);
  });

  test('Bob kann eine Etappe nicht mit Alices Ort verknüpfen', async () =>
  {
    const created = await srv.req('POST', '/api/trips', {
      title: 'Bobs Reise',
      stages: [{ location_name: 'Irgendwo', spot_id: aliceSpot.id }],
    }, bob.token);

    assert.equal(created.status, 200);
    // Die fremde Verknüpfung wird stillschweigend verworfen statt übernommen
    assert.equal(created.data.stages[0].spot_id, null);
    assert.equal(created.data.stages[0].spot_name, null);
  });
});

describe('Globale Suche', () =>
{
  test('findet keine Einträge anderer Nutzer', async () =>
  {
    const res = await srv.req('GET', '/api/search?q=Alices', undefined, bob.token);

    assert.equal(res.data.notes.length, 0);
    assert.equal(res.data.spots.length, 0);
    assert.equal(res.data.trips.length, 0);
  });

  test('findet die eigenen Einträge', async () =>
  {
    const res = await srv.req('GET', '/api/search?q=Alices', undefined, alice.token);

    assert.equal(res.data.notes.length, 1);
    assert.equal(res.data.spots.length, 1);
    assert.equal(res.data.trips.length, 1);
  });
});

describe('Adminrechte', () =>
{
  test('ein normaler Nutzer kommt nicht an die Nutzerverwaltung', async () =>
  {
    const res = await srv.req('GET', '/api/admin/users', undefined, bob.token);

    assert.equal(res.status, 403);
  });

  test('ein normaler Nutzer kann kein Konto löschen', async () =>
  {
    const res = await srv.req('DELETE', `/api/admin/users/${alice.user.id}`,
      undefined, bob.token);

    assert.equal(res.status, 403);
  });

  test('ein normaler Nutzer kann kein fremdes Passwort setzen', async () =>
  {
    const res = await srv.req('PUT', `/api/admin/users/${alice.user.id}/password`,
      { password: 'uebernahmeVersuch1' }, bob.token);

    assert.equal(res.status, 403);

    // Alices altes Passwort muss weiter gelten
    const login = await srv.req('POST', '/api/auth/login', {
      email: alice.user.email, password: 'geheim123',
    });
    assert.equal(login.status, 200);
  });
});
