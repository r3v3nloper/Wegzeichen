const express = require('express');
const { rateLimit } = require('express-rate-limit');
const authMiddleware = require('../middleware/auth');
const { search, GeocodingUnavailableError } = require('../utils/nominatim');
const v = require('../utils/validate');

const router = express.Router();

/* Auth zuerst: ein offener Geocoding-Proxy wäre fremdnutzbar und würde die
   Nominatim-Kontingente der Instanz auf unser Konto verbrauchen. */
router.use(authMiddleware);

/* Zweite Bremse neben dem 1-Sekunden-Abstand in utils/nominatim: begrenzt,
   wieviel ein einzelner Nutzer überhaupt in die Warteschlange legen kann. */
const geoLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  keyGenerator: req => String(req.userId),
  message: { error: 'Zu viele Suchanfragen — bitte kurz warten' },
});

/* ── GET /api/geo/search?q=… ──────────────────────────────────────────────── */
router.get('/search', geoLimiter, async (req, res, next) =>
{
  try
  {
    const query = v.requiredText(req.query.q, 'Suchbegriff', 200);
    if (query.length < 3)
    {
      return res.json([]);
    }
    const results = await search(query, process.env.NOMINATIM_USER_AGENT);
    res.json(results);
  }
  catch (err)
  {
    if (err instanceof GeocodingUnavailableError)
    {
      return res.status(503).json({ error: err.message });
    }
    next(err);
  }
});

module.exports = router;
