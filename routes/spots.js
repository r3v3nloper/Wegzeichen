const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const loadOwned = require('../middleware/owned');
const { findOwned, setFavoriteOwned, likePattern } = require('../utils/ownership');
const v = require('../utils/validate');

const router = express.Router();
router.use(authMiddleware);

const loadSpot = loadOwned('spots', 'Eintrag nicht gefunden');

const KINDS = ['trail', 'place'];
const STATUSES = ['wishlist', 'visited'];
const DIFFICULTIES = ['leicht', 'mittel', 'schwer'];

const MAX_NAME = 200;
const MAX_DESCRIPTION = 5000;

/* Felder, die nur für einen der beiden Aspekte eine Bedeutung haben. Trägt ein
   Eintrag den Aspekt nicht, werden sie geleert — sonst hätte er Werte, die
   seine Ansicht nie anzeigt.

   Ein Ziel darf beide Aspekte haben: die Drachenschlucht ist ein Ort, den man
   anfährt, und gleichzeitig ein Weg, den man abläuft. */
const FIELDS_BY_KIND = {
  trail: ['length_km', 'ascent_m', 'duration_min', 'difficulty'],
  place: ['category'],
};

/* Mindestens ein Aspekt muss gesetzt sein, sonst tauchte der Eintrag in keiner
   Liste auf. Fehlen beide Angaben komplett, gilt „Ort" als Vorgabe. */
function readKinds(body)
{
  const noneGiven = v.isBlank(body.is_trail) && v.isBlank(body.is_place);
  if (noneGiven)
  {
    return { is_trail: 0, is_place: 1 };
  }

  const kinds = {
    is_trail: v.boolFlag(body.is_trail),
    is_place: v.boolFlag(body.is_place),
  };
  if (!kinds.is_trail && !kinds.is_place)
  {
    v.fail('Ein Eintrag muss Wanderweg, Ort oder beides sein');
  }
  return kinds;
}

function readBody(body, kinds)
{
  const { lat, lng } = v.coordinates(body.lat, body.lng);
  const status = v.enumValue(body.status, STATUSES, 'Status', 'wishlist');

  const data = {
    is_trail: kinds.is_trail,
    is_place: kinds.is_place,
    name: v.requiredText(body.name, 'Name', MAX_NAME),
    description: v.optionalText(body.description, 'Beschreibung', MAX_DESCRIPTION),
    country: v.countryCode(body.country),
    region: v.optionalText(body.region, 'Region', 120),
    address: v.optionalText(body.address, 'Adresse', 300),
    lat,
    lng,
    category: v.optionalText(body.category, 'Kategorie', 60),
    status,
    /* Bewertung und Besuchsdatum gehören zu „war ich schon", das geplante Datum
       zu „will ich hin". Ein Statuswechsel räumt jeweils die andere Seite ab:
       nach dem Besuch ist der Plan erledigt, und wer zurücksetzt, war nicht da. */
    rating: status === 'visited' ? v.rating(body.rating) : null,
    visited_at: status === 'visited' ? v.optionalIsoDate(body.visited_at, 'Besuchsdatum') : null,
    planned_at: status === 'wishlist'
      ? v.optionalIsoDate(body.planned_at, 'Geplantes Datum')
      : null,
    source_url: v.optionalUrl(body.source_url, 'Quelle', 500),
    is_favorite: v.boolFlag(body.is_favorite),
    length_km: v.optionalNumber(body.length_km, 'Länge', 0, 100000),
    ascent_m: v.optionalInt(body.ascent_m, 'Höhenmeter', 0, 30000),
    duration_min: v.optionalInt(body.duration_min, 'Dauer', 0, 100000),
    difficulty: v.isBlank(body.difficulty)
      ? null
      : v.enumValue(body.difficulty, DIFFICULTIES, 'Schwierigkeit'),
  };

  // Wer kein Wanderweg ist, hat keine Weglänge; wer kein Ort ist, keine Kategorie
  Object.entries(FIELDS_BY_KIND)
    .filter(([forKind]) => !kinds[`is_${forKind}`])
    .forEach(([, fields]) => fields.forEach(field =>
    {
      data[field] = null;
    }));

  return data;
}

const COLUMNS = [
  'is_trail', 'is_place',
  'name', 'description', 'country', 'region', 'address', 'lat', 'lng', 'category',
  'status', 'rating', 'visited_at', 'planned_at', 'source_url', 'is_favorite',
  'length_km', 'ascent_m', 'duration_min', 'difficulty',
];

/* ── GET /api/spots?kind=&country=&status=&q= ──────────────────────────────── */
router.get('/', (req, res) =>
{
  const conditions = ['user_id = ?'];
  const params = [req.userId];

  /* `kind` filtert auf den Aspekt, nicht auf eine ausschließliche Art:
     ?kind=trail liefert alles, was ein Wanderweg ist — auch wenn es
     zusätzlich ein Ort ist. */
  if (!v.isBlank(req.query.kind))
  {
    const aspect = v.enumValue(req.query.kind, KINDS, 'Art');
    conditions.push(`is_${aspect} = 1`);
  }
  if (!v.isBlank(req.query.country))
  {
    conditions.push('country = ?');
    params.push(v.countryCode(req.query.country));
  }
  if (!v.isBlank(req.query.status))
  {
    conditions.push('status = ?');
    params.push(v.enumValue(req.query.status, STATUSES, 'Status'));
  }

  const term = v.optionalText(req.query.q, 'Suchbegriff', 200);
  if (term)
  {
    conditions.push(`(name LIKE ? ESCAPE '\\' OR COALESCE(description, '') LIKE ? ESCAPE '\\'
      OR COALESCE(region, '') LIKE ? ESCAPE '\\')`);
    params.push(likePattern(term), likePattern(term), likePattern(term));
  }

  const rows = db.prepare(`
    SELECT * FROM spots
    WHERE ${conditions.join(' AND ')}
    ORDER BY is_favorite DESC, name COLLATE NOCASE
  `).all(...params);

  res.json(rows);
});

/* ── GET /api/spots/:id ───────────────────────────────────────────────────── */
router.get('/:id', loadSpot, (req, res) =>
{
  res.json(req.entity);
});

/* ── POST /api/spots ──────────────────────────────────────────────────────── */
router.post('/', (req, res) =>
{
  const data = readBody(req.body, readKinds(req.body));

  const result = db.prepare(`
    INSERT INTO spots (user_id, ${COLUMNS.join(', ')})
    VALUES (?, ${COLUMNS.map(() => '?').join(', ')})
  `).run(req.userId, ...COLUMNS.map(c => data[c]));

  res.json(findOwned('spots', Number(result.lastInsertRowid), req.userId));
});

/* ── PUT /api/spots/:id ──
   Die Aspekte sind änderbar: aus einem Ort darf nachträglich auch ein
   Wanderweg werden. Fehlen beide Angaben im Body, bleibt es beim Bestehenden. */
router.put('/:id', loadSpot, (req, res) =>
{
  const id = req.entity.id;
  const kinds = v.isBlank(req.body.is_trail) && v.isBlank(req.body.is_place)
    ? { is_trail: req.entity.is_trail, is_place: req.entity.is_place }
    : readKinds(req.body);
  const data = readBody(req.body, kinds);

  db.prepare(`
    UPDATE spots SET ${COLUMNS.map(c => `${c} = ?`).join(', ')},
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(...COLUMNS.map(c => data[c]), id, req.userId);

  res.json(findOwned('spots', id, req.userId));
});

/* ── PUT /api/spots/:id/favorite ──
   Nur das Kennzeichen — siehe die gleichnamige Route bei den Notizen. */
router.put('/:id/favorite', loadSpot, (req, res) =>
{
  setFavoriteOwned('spots', req.entity.id, req.userId, v.boolFlag(req.body.is_favorite));
  res.json(findOwned('spots', req.entity.id, req.userId));
});

/* ── DELETE /api/spots/:id ────────────────────────────────────────────────── */
router.delete('/:id', loadSpot, (req, res) =>
{
  db.prepare('DELETE FROM spots WHERE id = ? AND user_id = ?').run(req.entity.id, req.userId);
  res.json({ success: true });
});

module.exports = { router, KINDS, STATUSES, DIFFICULTIES };
