const express = require('express');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const v = require('../utils/validate');
const { signToken } = authMiddleware;

const router = express.Router();

/* Gleicht das Antwort-Timing bei unbekannter E-Mail an einen echten Hash-Vergleich an,
   damit sich registrierte E-Mails nicht über die Antwortzeit erraten lassen */
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', 10);

const BCRYPT_ROUNDS = 10;

/* Brute-Force-Schutz: max. 10 fehlgeschlagene Versuche pro IP in 15 Minuten */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Zu viele Versuche — bitte in 15 Minuten erneut versuchen' },
});

/* Spalten, die die Profiländerung anfassen darf. Das UPDATE wird über diese
   Liste gebaut, nicht über die Schlüssel des Requests — so kann kein Feld aus
   dem Body in das Statement gelangen. */
const PROFILE_COLUMNS = ['username', 'email', 'password_hash'];

/* Öffentliche Nutzerdarstellung — hält password_hash und token_version
   zuverlässig aus allen Antworten heraus */
function publicUser(user)
{
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    is_admin: !!user.is_admin,
    home_label: user.home_label ?? null,
    home_lat: user.home_lat ?? null,
    home_lng: user.home_lng ?? null,
  };
}

function findUser(id)
{
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

/* Registrierung und Profiländerung können am selben UNIQUE-Index scheitern.
   Liefert die passende Meldung oder null, wenn der Fehler ein anderer war. */
function uniqueUserConflict(err)
{
  const message = String(err?.message || '');
  if (!message.includes('UNIQUE'))
  {
    return null;
  }
  return message.includes('username')
    ? 'Benutzername bereits vergeben'
    : 'E-Mail bereits registriert';
}

/* Einheitlicher Fehlerausgang: der Namenskonflikt wird zu einer verständlichen
   Meldung, alles andere geht an die Fehler-Middleware — die macht aus einer
   ValidationError einen 400 und aus allem Übrigen einen 500 ohne Innereien. */
function handleWriteError(err, res, next)
{
  const conflict = uniqueUserConflict(err);
  if (conflict)
  {
    return res.status(400).json({ error: conflict });
  }
  return next(err);
}

/* ── POST /api/auth/register ──────────────────────────────────────────────── */
router.post('/register', authLimiter, async (req, res, next) =>
{
  try
  {
    const username = v.username(req.body.username);
    const email = v.email(req.body.email);
    const hash = await bcrypt.hash(v.password(req.body.password), BCRYPT_ROUNDS);

    const result = db.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    ).run(username, email, hash);

    const created = findUser(Number(result.lastInsertRowid));
    res.json({
      token: signToken(created.id, created.token_version),
      user: publicUser(created),
    });
  }
  catch (err)
  {
    handleWriteError(err, res, next);
  }
});

/* ── POST /api/auth/login ──
   Hier wird das Format absichtlich nicht geprüft: eine Anmeldung soll bei
   falschen Daten immer gleich antworten, egal ob die Adresse gültig aussieht. */
router.post('/login', authLimiter, async (req, res, next) =>
{
  if (v.isBlank(req.body.email) || v.isBlank(req.body.password))
  {
    return res.status(400).json({ error: 'E-Mail und Passwort sind erforderlich' });
  }

  try
  {
    const email = String(req.body.email).trim().toLowerCase();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    const valid = await bcrypt.compare(String(req.body.password),
      user ? user.password_hash : DUMMY_HASH);

    if (!user || !valid)
    {
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }

    res.json({ token: signToken(user.id, user.token_version), user: publicUser(user) });
  }
  catch (err)
  {
    next(err);
  }
});

/* ── GET /api/auth/me ─────────────────────────────────────────────────────── */
router.get('/me', authMiddleware, (req, res) =>
{
  const user = findUser(req.userId);
  if (!user)
  {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }
  res.json({ ...publicUser(user), created_at: user.created_at });
});

/* Sammelt die tatsächlichen Änderungen. Unverändert mitgeschickte Werte fallen
   heraus — sonst würde ein gleichgebliebener Benutzername am UNIQUE-Index
   scheitern, obwohl der Nutzer nur seine E-Mail ändern wollte. */
async function collectProfileUpdates(body, user)
{
  const updates = {};

  if (!v.isBlank(body.username))
  {
    const username = v.username(body.username);
    if (username !== user.username)
    {
      updates.username = username;
    }
  }

  if (!v.isBlank(body.email))
  {
    const email = v.email(body.email);
    if (email !== user.email)
    {
      updates.email = email;
    }
  }

  if (!v.isBlank(body.newPassword))
  {
    /* Das aktuelle Passwort ist Pflicht: ein gestohlener Token soll nicht
       reichen, um den Zugang dauerhaft zu übernehmen. */
    if (v.isBlank(body.currentPassword))
    {
      v.fail('Aktuelles Passwort erforderlich');
    }
    const valid = await bcrypt.compare(String(body.currentPassword), user.password_hash);
    if (!valid)
    {
      v.fail('Aktuelles Passwort ist falsch');
    }
    updates.password_hash = await bcrypt.hash(
      v.password(body.newPassword, 'Neues Passwort'), BCRYPT_ROUNDS);
  }

  return updates;
}

function applyProfileUpdates(userId, updates)
{
  const columns = PROFILE_COLUMNS.filter(column => updates[column] !== undefined);
  const assignments = columns.map(column => `${column} = ?`);

  if (updates.password_hash)
  {
    // Erhöht die Token-Version → alle zuvor ausgestellten Tokens werden ungültig
    assignments.push('token_version = token_version + 1');
  }

  db.prepare(`UPDATE users SET ${assignments.join(', ')} WHERE id = ?`)
    .run(...columns.map(column => updates[column]), userId);

  return findUser(userId);
}

/* ── PUT /api/auth/profile ────────────────────────────────────────────────── */
router.put('/profile', authMiddleware, async (req, res, next) =>
{
  const user = findUser(req.userId);
  if (!user)
  {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }

  try
  {
    const updates = await collectProfileUpdates(req.body, user);
    if (!Object.keys(updates).length)
    {
      return res.json({ user: publicUser(user) });
    }

    const updated = applyProfileUpdates(req.userId, updates);
    const response = { user: publicUser(updated) };

    if (updates.password_hash)
    {
      // Frischer Token, damit die eigene Sitzung den Wechsel überlebt
      response.token = signToken(updated.id, updated.token_version);
    }
    res.json(response);
  }
  catch (err)
  {
    handleWriteError(err, res, next);
  }
});

module.exports = { router, publicUser };
