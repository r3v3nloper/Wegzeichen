/* Express-App (ohne listen) — separat vom Server-Start, damit Tests
   die echte App auf einem ephemeren Port hochfahren können */
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');

/* Im Test wird .env absichtlich NICHT geladen: die Tests sollen unabhängig von
   der lokalen Entwicklerkonfiguration laufen — sonst würde etwa ein gesetzter
   NOMINATIM_USER_AGENT echte Anfragen an OpenStreetMap auslösen. */
if (process.env.NODE_ENV !== 'test')
{
  require('dotenv').config();
}

const { ValidationError } = require('./utils/validate');
const { router: authRoutes } = require('./routes/auth');
const usersRoutes = require('./routes/users');
const adminRoutes = require('./routes/admin');
const metaRoutes = require('./routes/meta');
const notesRoutes = require('./routes/notes');
const noteFoldersRoutes = require('./routes/noteFolders');
const { router: spotsRoutes } = require('./routes/spots');
const tripsRoutes = require('./routes/trips');
const searchRoutes = require('./routes/search');
const geoRoutes = require('./routes/geo');

const app = express();
const PORT = process.env.PORT || 3000;

/* Hinter einem Reverse Proxy (HTTPS-Terminierung) ist req.ip sonst immer die
   Adresse des Proxys — der IP-Rate-Limit der Anmeldung würde damit alle Nutzer
   in denselben Eimer werfen und nach zehn Fehlversuchen irgendeines Besuchers
   jeden aussperren.

   Bewusst nicht standardmäßig an: mit blindem Vertrauen könnte jeder per
   X-Forwarded-For eine beliebige Adresse behaupten und die Drosselung umgehen.
   Der Wert ist die Anzahl der vorgelagerten Proxys — bei genau einem also `1`. */
const trustProxy = process.env.TRUST_PROXY;
if (trustProxy)
{
  const hops = Number(trustProxy);
  app.set('trust proxy', Number.isInteger(hops) ? hops : trustProxy);
}

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      // 'unsafe-inline' ist nötig, weil das SPA-Markup Inline-style-Attribute nutzt
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      // https: nötig für OpenStreetMap-Kartentiles; data: für Inline-Grafiken
      imgSrc: ["'self'", 'data:', 'https:'],
      // Font-Hosts nötig, weil der Service Worker sie beim Install in den Cache lädt.
      // Nominatim läuft absichtlich über den eigenen Proxy und braucht hier nichts.
      connectSrc: ["'self'", 'https://fonts.googleapis.com', 'https://fonts.gstatic.com'],
      // Entfernt: würde Deployments über plain HTTP im LAN brechen
      upgradeInsecureRequests: null,
    },
  },
  // Anhänge werden mit Content-Disposition ausgeliefert; die Standard-Policy
  // würde das Öffnen eines PDFs in einem neuen Tab blockieren
  crossOriginResourcePolicy: { policy: 'same-origin' },

  /* Helmets Standard wäre 'no-referrer' — damit gingen die Kartentiles ohne
     Referer raus und OpenStreetMap blockt sie mit „Access blocked". Diese
     Policy sendet nur die Herkunft (Schema, Host, Port), niemals den Pfad,
     und auch das nur, wenn dabei kein Sicherheitsniveau verloren geht. */
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));
app.use(cors({ origin: process.env.CORS_ORIGIN || `http://localhost:${PORT}` }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/meta', metaRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/note-folders', noteFoldersRoutes);
app.use('/api/spots', spotsRoutes);
app.use('/api/trips', tripsRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/geo', geoRoutes);

// SPA fallback
app.get('*', (req, res) =>
{
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/* Zentrale Fehlerbehandlung: Eingabefehler werden zu 400 mit der deutschen
   Meldung aus utils/validate, alles andere zu einem generischen 500 —
   damit keine Stacktraces oder SQL-Fragmente nach außen gelangen */
app.use((err, req, res, next) =>
{
  if (err instanceof ValidationError)
  {
    return res.status(400).json({ error: err.message });
  }
  if (err && err.type === 'entity.too.large')
  {
    return res.status(413).json({ error: 'Anfrage zu groß' });
  }
  console.error(err);
  res.status(500).json({ error: 'Serverfehler' });
});

module.exports = app;
