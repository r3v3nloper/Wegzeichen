const { startTestServer, registerUser } = require('../helpers/setup');
const { test, before, after, describe } = require('node:test');
const assert = require('node:assert');

const srv = startTestServer();
after(() => srv.close());

let token;

before(async () =>
{
  token = (await registerUser(srv, 'spots')).token;
});

function create(payload, useToken = token)
{
  return srv.req('POST', '/api/spots', payload, useToken);
}

describe('Anlegen', () =>
{
  test('legt einen Wanderweg mit Kennzahlen an', async () =>
  {
    const res = await create({
      is_trail: true, name: 'Rothaarsteig', country: 'DE', region: 'Sauerland',
      lat: 51.1, lng: 8.3, length_km: 154.6, ascent_m: 3200, duration_min: 2400,
      difficulty: 'schwer',
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.is_trail, 1);
    assert.equal(res.data.is_place, 0);
    assert.equal(res.data.length_km, 154.6);
    assert.equal(res.data.difficulty, 'schwer');
    assert.equal(res.data.status, 'wishlist', 'ohne Angabe gilt Wunschliste');
  });

  test('verwirft die Kategorie bei einem Wanderweg', async () =>
  {
    const res = await create({
      is_trail: true, name: 'Mit Kategorie', category: 'Hotel', length_km: 10,
    });

    assert.equal(res.data.category, null);
    assert.equal(res.data.length_km, 10);
  });

  test('verwirft Wanderweg-Kennzahlen bei einem Ort', async () =>
  {
    const res = await create({
      is_place: true, name: 'Hotel Waldblick', category: 'Hotel',
      length_km: 42, ascent_m: 100, duration_min: 60, difficulty: 'leicht',
    });

    assert.equal(res.data.length_km, null);
    assert.equal(res.data.ascent_m, null);
    assert.equal(res.data.duration_min, null);
    assert.equal(res.data.difficulty, null);
    assert.equal(res.data.category, 'Hotel');
  });

  test('legt ein Ziel an, das Wanderweg und Ort gleichzeitig ist', async () =>
  {
    // Die Drachenschlucht fährt man an und läuft sie ab
    const res = await create({
      is_trail: true, is_place: true, name: 'Drachenschlucht', region: 'Eisenach',
      category: 'Schlucht', length_km: 3.2, duration_min: 75, difficulty: 'mittel',
    });

    assert.equal(res.status, 200);
    assert.equal(res.data.is_trail, 1);
    assert.equal(res.data.is_place, 1);
    assert.equal(res.data.category, 'Schlucht', 'als Ort bleibt die Kategorie');
    assert.equal(res.data.length_km, 3.2, 'als Wanderweg bleibt die Länge');
  });

  test('ohne Angabe gilt Ort', async () =>
  {
    const res = await create({ name: 'Ohne Angabe' });

    assert.equal(res.status, 200);
    assert.equal(res.data.is_place, 1);
    assert.equal(res.data.is_trail, 0);
  });

  test('lehnt einen Eintrag ohne jeden Aspekt ab', async () =>
  {
    const res = await create({ is_trail: false, is_place: false, name: 'Nichts davon' });

    assert.equal(res.status, 400, 'wäre in keiner Liste sichtbar');
    assert.match(res.data.error, /Wanderweg, Ort oder beides/);
  });

  test('verlangt einen Namen', async () =>
  {
    const res = await create({ is_place: true });

    assert.equal(res.status, 400);
    assert.match(res.data.error, /Name ist erforderlich/);
  });

  test('lehnt ein unbekanntes Land ab', async () =>
  {
    const res = await create({ is_place: true, name: 'Nirgendwo', country: 'XX' });

    assert.equal(res.status, 400);
    assert.match(res.data.error, /Unbekanntes Land/);
  });

  test('lehnt eine unplausible Koordinate ab', async () =>
  {
    const res = await create({ is_place: true, name: 'Weltraum', lat: 95, lng: 0 });

    assert.equal(res.status, 400);
  });

  test('lehnt ein halbes Koordinatenpaar ab', async () =>
  {
    const res = await create({ is_place: true, name: 'Halb', lat: 51 });

    assert.equal(res.status, 400);
    assert.match(res.data.error, /zusammen/);
  });

  test('lehnt eine javascript-URL als Quelle ab', async () =>
  {
    const res = await create({
      is_trail: true, name: 'Böse Quelle', source_url: 'javascript:alert(1)',
    });

    assert.equal(res.status, 400);
  });
});

describe('Status, Bewertung und Besuchsdatum', () =>
{
  test('übernimmt Bewertung und Datum bei besuchten Einträgen', async () =>
  {
    const res = await create({
      is_place: true, name: 'War da', status: 'visited', rating: 4, visited_at: '2026-05-17',
    });

    assert.equal(res.data.status, 'visited');
    assert.equal(res.data.rating, 4);
    assert.equal(res.data.visited_at, '2026-05-17');
  });

  test('leert Bewertung und Datum auf der Wunschliste', async () =>
  {
    const res = await create({
      is_place: true, name: 'Noch nicht da', status: 'wishlist',
      rating: 5, visited_at: '2026-01-01',
    });

    assert.equal(res.data.rating, null,
      'eine Bewertung für einen unbesuchten Ort ist bedeutungslos');
    assert.equal(res.data.visited_at, null);
  });

  test('leert die Bewertung beim Zurücksetzen auf die Wunschliste', async () =>
  {
    const created = (await create({
      is_trail: true, name: 'Doch nicht', status: 'visited', rating: 3,
    })).data;

    const updated = (await srv.req('PUT', `/api/spots/${created.id}`, {
      is_trail: true, name: 'Doch nicht', status: 'wishlist',
    }, token)).data;

    assert.equal(updated.rating, null);
  });

  test('lehnt eine Bewertung außerhalb von 1 bis 5 ab', async () =>
  {
    assert.equal((await create({
      is_place: true, name: 'Zu gut', status: 'visited', rating: 6,
    })).status, 400);
    assert.equal((await create({
      is_place: true, name: 'Zu schlecht', status: 'visited', rating: 0,
    })).status, 400);
  });

  test('lehnt ein Scheindatum ab', async () =>
  {
    const res = await create({
      is_place: true, name: 'Nie', status: 'visited', visited_at: '2026-02-31',
    });

    assert.equal(res.status, 400);
  });
});

describe('Geplantes Datum', () =>
{
  test('übernimmt einen Termin für ein Ziel auf der Wunschliste', async () =>
  {
    const res = await create({
      is_place: true, name: 'Drachenschlucht', planned_at: '2026-06-14',
    });

    assert.equal(res.data.planned_at, '2026-06-14');
  });

  test('verwirft einen Termin bei einem besuchten Ziel', async () =>
  {
    const res = await create({
      is_place: true, name: 'Schon da gewesen', status: 'visited', planned_at: '2026-06-14',
    });

    assert.equal(res.data.planned_at, null, 'was besucht ist, muss nicht mehr geplant werden');
  });

  test('räumt den Termin ab, sobald das Ziel als besucht gilt', async () =>
  {
    const created = (await create({
      is_trail: true, name: 'Wird besucht', planned_at: '2026-06-14',
    })).data;

    const updated = (await srv.req('PUT', `/api/spots/${created.id}`, {
      is_trail: true, name: 'Wird besucht', status: 'visited', visited_at: '2026-06-14',
    }, token)).data;

    assert.equal(updated.planned_at, null);
    assert.equal(updated.visited_at, '2026-06-14');
  });

  test('lehnt ein ungültiges Datum ab', async () =>
  {
    const res = await create({
      is_place: true, name: 'Krummes Datum', planned_at: '14.06.2026',
    });

    assert.equal(res.status, 400);
    assert.match(res.data.error, /JJJJ-MM-TT/);
  });

  test('ohne Termin bleibt das Feld leer', async () =>
  {
    const res = await create({ is_place: true, name: 'Ohne Termin' });

    assert.equal(res.data.planned_at, null);
  });
});

describe('Aspekte nachträglich ändern', () =>
{
  test('macht aus einem Ort zusätzlich einen Wanderweg', async () =>
  {
    const created = (await create({ is_place: true, name: 'Drachenschlucht' })).data;

    const updated = (await srv.req('PUT', `/api/spots/${created.id}`, {
      is_place: true, is_trail: true, name: 'Drachenschlucht', length_km: 3.2,
    }, token)).data;

    assert.equal(updated.is_trail, 1);
    assert.equal(updated.is_place, 1);
    assert.equal(updated.length_km, 3.2);
  });

  test('leert die Felder eines entfernten Aspekts', async () =>
  {
    const created = (await create({
      is_trail: true, is_place: true, name: 'Wird nur Ort',
      length_km: 10, category: 'Wald',
    })).data;

    const updated = (await srv.req('PUT', `/api/spots/${created.id}`, {
      is_trail: false, is_place: true, name: 'Wird nur Ort', category: 'Wald',
    }, token)).data;

    assert.equal(updated.is_trail, 0);
    assert.equal(updated.length_km, null, 'ohne Wanderweg-Aspekt keine Länge');
    assert.equal(updated.category, 'Wald');
  });

  test('behält die Aspekte, wenn der Body sie nicht nennt', async () =>
  {
    const created = (await create({ is_trail: true, name: 'Bleibt Weg' })).data;

    const updated = (await srv.req('PUT', `/api/spots/${created.id}`, {
      name: 'Bleibt Weg, umbenannt',
    }, token)).data;

    assert.equal(updated.is_trail, 1, 'der Favoriten-Umschalter schickt sie nicht mit');
    assert.equal(updated.is_place, 0);
  });

  test('lehnt das Entfernen beider Aspekte ab', async () =>
  {
    const created = (await create({ is_trail: true, name: 'Braucht einen Aspekt' })).data;

    const res = await srv.req('PUT', `/api/spots/${created.id}`, {
      is_trail: false, is_place: false, name: 'Braucht einen Aspekt',
    }, token);

    assert.equal(res.status, 400);
  });
});

describe('Filtern', () =>
{
  let ownToken;

  before(async () =>
  {
    ownToken = (await registerUser(srv, 'filter')).token;
    await create({ is_trail: true, name: 'Eifelsteig', country: 'DE' }, ownToken);
    await create({ is_trail: true, name: 'Dolomiten Höhenweg', country: 'IT',
      status: 'visited', rating: 5 }, ownToken);
    await create({ is_place: true, name: 'Hotel Rom', country: 'IT' }, ownToken);
  });

  test('nach Art', async () =>
  {
    const trails = (await srv.req('GET', '/api/spots?kind=trail', undefined, ownToken)).data;

    assert.equal(trails.length, 2);
    assert.ok(trails.every(s => s.is_trail === 1));
  });

  test('liefert ein Doppel-Ziel in beiden Aspekt-Filtern', async () =>
  {
    const own = (await registerUser(srv, 'beides')).token;
    await create({ is_trail: true, is_place: true, name: 'Drachenschlucht' }, own);
    await create({ is_trail: true, name: 'Nur ein Weg' }, own);

    const trails = (await srv.req('GET', '/api/spots?kind=trail', undefined, own)).data;
    const places = (await srv.req('GET', '/api/spots?kind=place', undefined, own)).data;

    assert.equal(trails.length, 2);
    assert.equal(places.length, 1);
    assert.equal(places[0].name, 'Drachenschlucht');
  });

  test('nach Land', async () =>
  {
    const italy = (await srv.req('GET', '/api/spots?country=IT', undefined, ownToken)).data;

    assert.equal(italy.length, 2);
  });

  test('nach Status', async () =>
  {
    const visited = (await srv.req('GET', '/api/spots?status=visited',
      undefined, ownToken)).data;

    assert.equal(visited.length, 1);
    assert.equal(visited[0].name, 'Dolomiten Höhenweg');
  });

  test('kombiniert Art und Land', async () =>
  {
    const res = (await srv.req('GET', '/api/spots?kind=place&country=IT',
      undefined, ownToken)).data;

    assert.equal(res.length, 1);
    assert.equal(res[0].name, 'Hotel Rom');
  });

  test('über den Suchbegriff', async () =>
  {
    const res = (await srv.req('GET', '/api/spots?q=höhenweg', undefined, ownToken)).data;

    assert.equal(res.length, 1);
  });

  test('lehnt einen unbekannten Filterwert ab', async () =>
  {
    const res = await srv.req('GET', '/api/spots?status=vielleicht', undefined, ownToken);

    assert.equal(res.status, 400);
  });

  test('sortiert Favoriten nach oben', async () =>
  {
    const own = (await registerUser(srv, 'favsort')).token;
    await create({ is_place: true, name: 'Aaa ohne Favorit' }, own);
    await create({ is_place: true, name: 'Zzz mit Favorit', is_favorite: true }, own);

    const res = (await srv.req('GET', '/api/spots', undefined, own)).data;

    assert.equal(res[0].name, 'Zzz mit Favorit');
  });
});

describe('Favorit umschalten', () =>
{
  test('setzt das Kennzeichen und lässt die Kennzahlen unberührt', async () =>
  {
    const spot = (await create({
      is_trail: true, name: 'Rheinsteig', length_km: 320, ascent_m: 8000,
      difficulty: 'mittel', status: 'visited', rating: 4, visited_at: '2026-05-01',
    })).data;

    const res = await srv.req('PUT', `/api/spots/${spot.id}/favorite`,
      { is_favorite: true }, token);

    assert.equal(res.status, 200);
    assert.equal(res.data.is_favorite, 1);
    assert.equal(res.data.length_km, 320);
    assert.equal(res.data.ascent_m, 8000);
    assert.equal(res.data.difficulty, 'mittel');
    assert.equal(res.data.rating, 4);
    assert.equal(res.data.visited_at, '2026-05-01');
  });

  test('behält beide Aspekte eines Doppel-Ziels', async () =>
  {
    const spot = (await create({
      is_trail: true, is_place: true, name: 'Drachenschlucht', category: 'Natur',
    })).data;

    const res = await srv.req('PUT', `/api/spots/${spot.id}/favorite`,
      { is_favorite: true }, token);

    assert.equal(res.data.is_trail, 1);
    assert.equal(res.data.is_place, 1);
    assert.equal(res.data.category, 'Natur');
  });

  test('antwortet für einen unbekannten Eintrag mit 404', async () =>
  {
    const res = await srv.req('PUT', '/api/spots/999999/favorite',
      { is_favorite: true }, token);

    assert.equal(res.status, 404);
  });
});

describe('Löschen', () =>
{
  test('entfernt den Eintrag', async () =>
  {
    const created = (await create({ is_place: true, name: 'Weg damit' })).data;

    await srv.req('DELETE', `/api/spots/${created.id}`, undefined, token);
    const after = await srv.req('GET', `/api/spots/${created.id}`, undefined, token);

    assert.equal(after.status, 404);
  });
});
