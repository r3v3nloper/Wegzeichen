const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { findOwned } = require('../utils/ownership');
const v = require('../utils/validate');

const router = express.Router();
router.use(authMiddleware);

const MAX_TITLE = 200;
const MAX_SUMMARY = 20000;
const MAX_STAGES = 200;
const MAX_DAY = 3650;

function readTrip(body)
{
  const startDate = v.optionalIsoDate(body.start_date, 'Startdatum');
  const endDate = v.optionalIsoDate(body.end_date, 'Enddatum');
  if (startDate && endDate && endDate < startDate)
  {
    v.fail('Das Enddatum liegt vor dem Startdatum');
  }

  return {
    title: v.requiredText(body.title, 'Titel', MAX_TITLE),
    summary: v.optionalText(body.summary, 'Beschreibung', MAX_SUMMARY),
    country: v.countryCode(body.country),
    start_date: startDate,
    end_date: endDate,
    rating: v.rating(body.rating),
    photos_url: v.optionalUrl(body.photos_url, 'Bilder-Link', 500),
    is_favorite: v.boolFlag(body.is_favorite),
  };
}

const TRIP_COLUMNS = ['title', 'summary', 'country', 'start_date', 'end_date',
  'rating', 'photos_url', 'is_favorite'];

/* Etappen werden beim Speichern komplett ersetzt. Bei einer Handvoll Einträgen
   pro Reise ist das einfacher und weniger fehleranfällig als ein Abgleich
   einzelner Zeilen — und die Reihenfolge stimmt danach garantiert. */
function readStages(rawStages, userId)
{
  if (rawStages === undefined || rawStages === null)
  {
    return null;
  }
  if (!Array.isArray(rawStages))
  {
    v.fail('Etappen müssen als Liste übergeben werden');
  }
  if (rawStages.length > MAX_STAGES)
  {
    v.fail(`Maximal ${MAX_STAGES} Etappen pro Reise`);
  }

  return rawStages.map((stage, index) =>
  {
    const dayFrom = v.optionalInt(stage.day_from, 'Tag von', 1, MAX_DAY);
    const dayTo = v.optionalInt(stage.day_to, 'Tag bis', 1, MAX_DAY);
    if (dayFrom !== null && dayTo !== null && dayTo < dayFrom)
    {
      v.fail('„Tag bis" liegt vor „Tag von"');
    }

    const { lat, lng } = v.coordinates(stage.lat, stage.lng);

    /* Die Verknüpfung darf nur auf eigene Orte zeigen — sonst ließen sich über
       eine geratene ID die Einträge anderer Nutzer sichtbar machen. */
    let spotId = v.optionalInt(stage.spot_id, 'Verknüpfter Ort', 1, Number.MAX_SAFE_INTEGER);
    if (spotId !== null && !findOwned('spots', spotId, userId))
    {
      spotId = null;
    }

    return {
      sort_order: index,
      day_from: dayFrom,
      day_to: dayTo,
      location_name: v.requiredText(stage.location_name, 'Ort der Etappe', MAX_TITLE),
      lat,
      lng,
      notes: v.optionalText(stage.notes, 'Notiz zur Etappe', 2000),
      spot_id: spotId,
    };
  });
}

function replaceStages(tripId, stages)
{
  const remove = db.prepare('DELETE FROM trip_stages WHERE trip_id = ?');
  const insert = db.prepare(`
    INSERT INTO trip_stages
      (trip_id, sort_order, day_from, day_to, location_name, lat, lng, notes, spot_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  db.transaction(() =>
  {
    remove.run(tripId);
    stages.forEach(s => insert.run(tripId, s.sort_order, s.day_from, s.day_to,
      s.location_name, s.lat, s.lng, s.notes, s.spot_id));
  })();
}

/* Etappen mit dem Namen des verknüpften Ortes. Der JOIN filtert zusätzlich auf
   den Besitzer, damit eine veraltete Verknüpfung nichts Fremdes ausliest. */
function stagesFor(tripId, userId)
{
  return db.prepare(`
    SELECT st.*, s.name AS spot_name, s.is_trail AS spot_is_trail
    FROM trip_stages st
    LEFT JOIN spots s ON s.id = st.spot_id AND s.user_id = ?
    WHERE st.trip_id = ?
    ORDER BY st.sort_order, st.id
  `).all(userId, tripId);
}

/* ── GET /api/trips ──
   Favoriten oben, danach die jüngste Reise. Reisen ohne Datum wandern nach
   hinten statt vor alles andere. */
router.get('/', (req, res) =>
{
  const rows = db.prepare(`
    SELECT t.*,
      (SELECT COUNT(*) FROM trip_stages st WHERE st.trip_id = t.id) AS stageCount
    FROM trips t
    WHERE t.user_id = ?
    ORDER BY t.is_favorite DESC,
      CASE WHEN t.start_date IS NULL THEN 1 ELSE 0 END,
      t.start_date DESC,
      t.created_at DESC
  `).all(req.userId);

  res.json(rows);
});

/* ── GET /api/trips/:id ───────────────────────────────────────────────────── */
router.get('/:id', (req, res) =>
{
  const id = v.parseIdParam(req.params.id);
  const trip = id === null ? null : findOwned('trips', id, req.userId);
  if (!trip)
  {
    return res.status(404).json({ error: 'Reise nicht gefunden' });
  }
  res.json({ ...trip, stages: stagesFor(id, req.userId) });
});

/* ── POST /api/trips ──────────────────────────────────────────────────────── */
router.post('/', (req, res) =>
{
  const data = readTrip(req.body);
  const stages = readStages(req.body.stages, req.userId);

  const result = db.prepare(`
    INSERT INTO trips (user_id, ${TRIP_COLUMNS.join(', ')})
    VALUES (?, ${TRIP_COLUMNS.map(() => '?').join(', ')})
  `).run(req.userId, ...TRIP_COLUMNS.map(c => data[c]));

  const id = Number(result.lastInsertRowid);
  if (stages)
  {
    replaceStages(id, stages);
  }

  res.json({ ...findOwned('trips', id, req.userId), stages: stagesFor(id, req.userId) });
});

/* ── PUT /api/trips/:id ──
   Fehlt `stages` im Body, bleiben die bestehenden Etappen unberührt. */
router.put('/:id', (req, res) =>
{
  const id = v.parseIdParam(req.params.id);
  const existing = id === null ? null : findOwned('trips', id, req.userId);
  if (!existing)
  {
    return res.status(404).json({ error: 'Reise nicht gefunden' });
  }

  const data = readTrip(req.body);
  const stages = readStages(req.body.stages, req.userId);

  db.prepare(`
    UPDATE trips SET ${TRIP_COLUMNS.map(c => `${c} = ?`).join(', ')},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(...TRIP_COLUMNS.map(c => data[c]), id, req.userId);

  if (stages)
  {
    replaceStages(id, stages);
  }

  res.json({ ...findOwned('trips', id, req.userId), stages: stagesFor(id, req.userId) });
});

/* ── DELETE /api/trips/:id ──
   Die Etappen verschwinden per CASCADE. */
router.delete('/:id', (req, res) =>
{
  const id = v.parseIdParam(req.params.id);
  const trip = id === null ? null : findOwned('trips', id, req.userId);
  if (!trip)
  {
    return res.status(404).json({ error: 'Reise nicht gefunden' });
  }

  db.prepare('DELETE FROM trips WHERE id = ? AND user_id = ?').run(id, req.userId);
  res.json({ success: true });
});

module.exports = router;
