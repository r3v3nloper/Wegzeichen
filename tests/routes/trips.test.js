const { startTestServer, registerUser } = require('../helpers/setup');
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');

const srv = startTestServer();
after(() => srv.close());

let token;

before(async () =>
{
  token = (await registerUser(srv, 'trips')).token;
});

function create(payload, useToken = token)
{
  return srv.req('POST', '/api/trips', payload, useToken);
}

describe('Anlegen', () =>
{
  test('legt eine Reise mit Etappen an', async () =>
  {
    const res = await create({
      title: 'Tour durch Italien', country: 'IT',
      start_date: '2026-04-03', end_date: '2026-04-14', rating: 5,
      summary: 'Rom, Florenz, Cinque Terre',
      photos_url: 'https://cloud.example.com/album',
      stages: [
        { day_from: 1, day_to: 4, location_name: 'Rom', notes: 'Kolosseum' },
        { day_from: 5, day_to: 8, location_name: 'Florenz' },
        { day_from: 9, day_to: 12, location_name: 'Cinque Terre' },
      ],
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.stages.length, 3);
    assert.equal(res.data.rating, 5);
    assert.deepEqual(res.data.stages.map(s => s.location_name),
      ['Rom', 'Florenz', 'Cinque Terre']);
  });

  test('behält die Reihenfolge der übergebenen Etappen', async () =>
  {
    const res = await create({
      title: 'Reihenfolge',
      stages: [
        { location_name: 'Zuletzt eingegeben, zuerst gereist' },
        { location_name: 'Danach' },
        { location_name: 'Zum Schluss' },
      ],
    });

    assert.deepEqual(res.data.stages.map(s => s.sort_order), [0, 1, 2]);
  });

  test('verlangt einen Titel', async () =>
  {
    const res = await create({ summary: 'ohne Titel' });

    assert.equal(res.status, 400);
  });

  test('erlaubt eine Reise ohne Etappen und ohne Datum', async () =>
  {
    const res = await create({ title: 'Nur ein Eintrag' });

    assert.equal(res.status, 200);
    assert.deepEqual(res.data.stages, []);
    assert.equal(res.data.start_date, null);
  });

  test('verlangt einen Ort je Etappe', async () =>
  {
    const res = await create({
      title: 'Lückenhaft', stages: [{ day_from: 1, notes: 'ohne Ort' }],
    });

    assert.equal(res.status, 400);
    assert.match(res.data.error, /Ort der Etappe/);
  });
});

describe('Plausibilität der Zeitangaben', () =>
{
  test('lehnt ein Enddatum vor dem Startdatum ab', async () =>
  {
    const res = await create({
      title: 'Rückwärts', start_date: '2026-04-14', end_date: '2026-04-03',
    });

    assert.equal(res.status, 400);
    assert.match(res.data.error, /Enddatum liegt vor dem Startdatum/);
  });

  test('erlaubt eine Tagesreise mit gleichem Start und Ende', async () =>
  {
    const res = await create({
      title: 'Tagestour', start_date: '2026-04-03', end_date: '2026-04-03',
    });

    assert.equal(res.status, 200);
  });

  test('lehnt „Tag bis" vor „Tag von" ab', async () =>
  {
    const res = await create({
      title: 'Etappe rückwärts',
      stages: [{ location_name: 'Rom', day_from: 5, day_to: 2 }],
    });

    assert.equal(res.status, 400);
    assert.match(res.data.error, /Tag bis/);
  });

  test('erlaubt eine Etappe ohne Tagesangabe', async () =>
  {
    const res = await create({
      title: 'Ohne Tage', stages: [{ location_name: 'Irgendwo' }],
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.stages[0].day_from, null);
  });
});

describe('Verknüpfung mit gespeicherten Orten', () =>
{
  test('übernimmt einen eigenen Ort und liefert dessen Namen mit', async () =>
  {
    const spot = (await srv.req('POST', '/api/spots', {
      is_place: true, name: 'Hotel Rom', country: 'IT',
    }, token)).data;

    const res = await create({
      title: 'Mit Verknüpfung',
      stages: [{ location_name: 'Rom', spot_id: spot.id }],
    });

    assert.equal(res.data.stages[0].spot_id, spot.id);
    assert.equal(res.data.stages[0].spot_name, 'Hotel Rom');
    assert.equal(res.data.stages[0].spot_is_trail, 0);
  });

  test('setzt eine unbekannte Ort-ID auf null statt zu scheitern', async () =>
  {
    const res = await create({
      title: 'Kaputte Verknüpfung',
      stages: [{ location_name: 'Rom', spot_id: 999999 }],
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.stages[0].spot_id, null);
  });

  test('löst die Verknüpfung, wenn der Ort gelöscht wird', async () =>
  {
    const spot = (await srv.req('POST', '/api/spots', {
      is_place: true, name: 'Verschwindet',
    }, token)).data;
    const trip = (await create({
      title: 'Verwaiste Etappe',
      stages: [{ location_name: 'Da', spot_id: spot.id }],
    })).data;

    await srv.req('DELETE', `/api/spots/${spot.id}`, undefined, token);
    const after = (await srv.req('GET', `/api/trips/${trip.id}`, undefined, token)).data;

    assert.equal(after.stages[0].spot_id, null, 'ON DELETE SET NULL muss greifen');
    assert.equal(after.stages[0].location_name, 'Da', 'die Etappe selbst bleibt');
  });
});

describe('Ändern', () =>
{
  test('ersetzt die Etappen vollständig', async () =>
  {
    const trip = (await create({
      title: 'Umbau',
      stages: [{ location_name: 'Alt 1' }, { location_name: 'Alt 2' }],
    })).data;

    const updated = (await srv.req('PUT', `/api/trips/${trip.id}`, {
      title: 'Umbau', stages: [{ location_name: 'Neu' }],
    }, token)).data;

    assert.equal(updated.stages.length, 1);
    assert.equal(updated.stages[0].location_name, 'Neu');
  });

  test('lässt die Etappen unberührt, wenn sie nicht mitgeschickt werden', async () =>
  {
    const trip = (await create({
      title: 'Nur Kopfdaten', stages: [{ location_name: 'Bleibt' }],
    })).data;

    const updated = (await srv.req('PUT', `/api/trips/${trip.id}`, {
      title: 'Nur Kopfdaten geändert', is_favorite: true,
    }, token)).data;

    assert.equal(updated.stages.length, 1);
    assert.equal(updated.stages[0].location_name, 'Bleibt');
    assert.equal(updated.is_favorite, 1);
  });

  test('leert die Etappen bei einer leeren Liste', async () =>
  {
    const trip = (await create({
      title: 'Leerung', stages: [{ location_name: 'Weg' }],
    })).data;

    const updated = (await srv.req('PUT', `/api/trips/${trip.id}`, {
      title: 'Leerung', stages: [],
    }, token)).data;

    assert.equal(updated.stages.length, 0);
  });
});

describe('Favorit umschalten', () =>
{
  test('setzt das Kennzeichen und lässt die Etappen stehen', async () =>
  {
    /* Vorher musste das Frontend die Etappen beim Umschalten bewusst weglassen,
       damit sie nicht ersetzt werden. Diese Route kann sie gar nicht anfassen. */
    const trip = (await create({
      title: 'Toskana', summary: 'Zwei Wochen', start_date: '2026-09-01',
      stages: [
        { day_from: 1, day_to: 3, location_name: 'Florenz', notes: 'Uffizien' },
        { day_from: 4, day_to: 7, location_name: 'Siena' },
      ],
    })).data;

    const res = await srv.req('PUT', `/api/trips/${trip.id}/favorite`,
      { is_favorite: true }, token);

    assert.equal(res.status, 200);
    assert.equal(res.data.is_favorite, 1);
    assert.equal(res.data.stages.length, 2);
    assert.equal(res.data.stages[0].location_name, 'Florenz');
    assert.equal(res.data.stages[0].notes, 'Uffizien');
    assert.equal(res.data.summary, 'Zwei Wochen');
    assert.equal(res.data.start_date, '2026-09-01');
  });

  test('antwortet für eine unbekannte Reise mit 404', async () =>
  {
    const res = await srv.req('PUT', '/api/trips/999999/favorite',
      { is_favorite: true }, token);

    assert.equal(res.status, 404);
  });
});

describe('Sortierung der Liste', () =>
{
  test('Favoriten oben, dann die jüngste Reise, Reisen ohne Datum zuletzt', async () =>
  {
    const own = (await registerUser(srv, 'tripsort')).token;
    await create({ title: 'Ohne Datum' }, own);
    await create({ title: 'Alt', start_date: '2020-01-01' }, own);
    await create({ title: 'Neu', start_date: '2026-01-01' }, own);
    await create({ title: 'Favorit', start_date: '2010-01-01', is_favorite: true }, own);

    const list = (await srv.req('GET', '/api/trips', undefined, own)).data;

    assert.deepEqual(list.map(t => t.title), ['Favorit', 'Neu', 'Alt', 'Ohne Datum']);
  });

  test('liefert die Anzahl der Etappen mit', async () =>
  {
    const own = (await registerUser(srv, 'tripcount')).token;
    await create({
      title: 'Drei Etappen',
      stages: [{ location_name: 'a' }, { location_name: 'b' }, { location_name: 'c' }],
    }, own);

    const list = (await srv.req('GET', '/api/trips', undefined, own)).data;

    assert.equal(list[0].stageCount, 3);
  });
});

describe('Löschen', () =>
{
  test('entfernt die Reise samt Etappen', async () =>
  {
    const trip = (await create({
      title: 'Komplett weg', stages: [{ location_name: 'Rom' }],
    })).data;

    await srv.req('DELETE', `/api/trips/${trip.id}`, undefined, token);
    const after = await srv.req('GET', `/api/trips/${trip.id}`, undefined, token);

    assert.equal(after.status, 404);
  });
});
