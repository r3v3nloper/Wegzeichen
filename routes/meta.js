const express = require('express');
const { listCountries } = require('../utils/countries');

const router = express.Router();

/* Länderliste einmal berechnen — sie ändert sich zur Laufzeit nicht */
const COUNTRIES = listCountries();

/* ── GET /api/meta/countries ──
   Ohne Auth, damit der Service Worker die Liste schon vor dem Login cachen kann. */
router.get('/countries', (req, res) =>
{
  res.set('Cache-Control', 'public, max-age=86400');
  res.json(COUNTRIES);
});

module.exports = router;
