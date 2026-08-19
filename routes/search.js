const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { likePattern } = require('../utils/ownership');
const v = require('../utils/validate');

const router = express.Router();
router.use(authMiddleware);

const MIN_TERM_LENGTH = 2;
const LIMIT_PER_TYPE = 15;

/* Einfache LIKE-Suche über alle Module. Bei den Datenmengen einer privaten
   Sammlung ist das schnell genug; FTS5 wäre hier verfrühte Optimierung. */
router.get('/', (req, res) =>
{
  const term = v.optionalText(req.query.q, 'Suchbegriff', 200);
  if (!term || term.length < MIN_TERM_LENGTH)
  {
    return res.json({ notes: [], spots: [], trips: [] });
  }

  const pattern = likePattern(term);

  const notes = db.prepare(`
    SELECT id, title, body, is_favorite, updated_at
    FROM notes
    WHERE user_id = ?
      AND (title LIKE ? ESCAPE '\\' OR COALESCE(body, '') LIKE ? ESCAPE '\\')
    ORDER BY is_favorite DESC, updated_at DESC
    LIMIT ${LIMIT_PER_TYPE}
  `).all(req.userId, pattern, pattern);

  const spots = db.prepare(`
    SELECT *
    FROM spots
    WHERE user_id = ?
      AND (name LIKE ? ESCAPE '\\' OR COALESCE(description, '') LIKE ? ESCAPE '\\'
        OR COALESCE(region, '') LIKE ? ESCAPE '\\' OR COALESCE(address, '') LIKE ? ESCAPE '\\')
    ORDER BY is_favorite DESC, name COLLATE NOCASE
    LIMIT ${LIMIT_PER_TYPE}
  `).all(req.userId, pattern, pattern, pattern, pattern);

  /* Reisen matchen auch über ihre Etappen — „Kyoto" soll die Japan-Reise finden,
     auch wenn der Ort nur in einer Etappe steht */
  const trips = db.prepare(`
    SELECT DISTINCT t.*
    FROM trips t
    LEFT JOIN trip_stages st ON st.trip_id = t.id
    WHERE t.user_id = ?
      AND (t.title LIKE ? ESCAPE '\\' OR COALESCE(t.summary, '') LIKE ? ESCAPE '\\'
        OR COALESCE(st.location_name, '') LIKE ? ESCAPE '\\')
    ORDER BY t.is_favorite DESC, t.start_date DESC
    LIMIT ${LIMIT_PER_TYPE}
  `).all(req.userId, pattern, pattern, pattern);

  res.json({ notes, spots, trips });
});

module.exports = router;
