const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { publicUser } = require('./auth');
const v = require('../utils/validate');

const router = express.Router();
router.use(authMiddleware);

/* ── PUT /api/users/home — Heimatort als Bezugspunkt für alle Entfernungen ──
   Leere Koordinaten löschen den Heimatort; die Entfernungsanzeige entfällt dann. */
router.put('/home', (req, res) =>
{
  const { lat, lng } = v.coordinates(req.body.lat, req.body.lng);
  const label = v.optionalText(req.body.label, 'Bezeichnung', 120);

  db.prepare('UPDATE users SET home_label = ?, home_lat = ?, home_lng = ? WHERE id = ?')
    .run(label, lat, lng, req.userId);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  res.json({ user: publicUser(user) });
});

module.exports = router;
