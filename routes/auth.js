const express = require('express');
const bcrypt = require('bcryptjs');
const { rateLimit } = require('express-rate-limit');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { signToken } = authMiddleware;

const router = express.Router();

/* Gleicht das Antwort-Timing bei unbekannter E-Mail an einen echten Hash-Vergleich an,
   damit sich registrierte E-Mails nicht über die Antwortzeit erraten lassen */
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer', 10);

/* Brute-Force-Schutz: max. 10 fehlgeschlagene Versuche pro IP in 15 Minuten */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Zu viele Versuche — bitte in 15 Minuten erneut versuchen' },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PROFILE_FIELDS = ['username', 'email', 'password_hash'];

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

router.post('/register', authLimiter, async (req, res) =>
{
  const { username, email, password } = req.body;
  if (!username || !email || !password)
  {
    return res.status(400).json({ error: 'Alle Felder sind erforderlich' });
  }
  if (password.length < 6 || password.length > 1000)
  {
    return res.status(400).json({ error: 'Passwort muss zwischen 6 und 1000 Zeichen lang sein' });
  }
  const trimmedName = username.trim();
  if (trimmedName.length < 3 || trimmedName.length > 50)
  {
    return res.status(400).json({ error: 'Benutzername muss zwischen 3 und 50 Zeichen lang sein' });
  }
  const trimmedEmail = email.toLowerCase().trim();
  if (!EMAIL_RE.test(trimmedEmail))
  {
    return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
  }

  try
  {
    const hash = await bcrypt.hash(password, 10);
    const result = db.prepare(
      'INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)'
    ).run(trimmedName, trimmedEmail, hash);

    const token = signToken(result.lastInsertRowid, 0);
    res.json({
      token,
      user: publicUser({
        id: result.lastInsertRowid, username: trimmedName, email: trimmedEmail, is_admin: 0
      })
    });
  }
  catch (err)
  {
    if (err.message.includes('UNIQUE'))
    {
      if (err.message.includes('username'))
      {
        return res.status(400).json({ error: 'Benutzername bereits vergeben' });
      }
      return res.status(400).json({ error: 'E-Mail bereits registriert' });
    }
    res.status(500).json({ error: 'Serverfehler' });
  }
});

router.post('/login', authLimiter, async (req, res) =>
{
  const { email, password } = req.body;
  if (!email || !password)
  {
    return res.status(400).json({ error: 'Alle Felder sind erforderlich' });
  }

  try
  {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase().trim());
    const valid = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
    if (!user || !valid)
    {
      return res.status(401).json({ error: 'Ungültige Anmeldedaten' });
    }

    const token = signToken(user.id, user.token_version);
    res.json({ token, user: publicUser(user) });
  }
  catch
  {
    res.status(500).json({ error: 'Serverfehler' });
  }
});

router.get('/me', authMiddleware, (req, res) =>
{
  const user = db.prepare(`
    SELECT id, username, email, is_admin, home_label, home_lat, home_lng, created_at
    FROM users WHERE id = ?
  `).get(req.userId);
  if (!user)
  {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }
  res.json({ ...publicUser(user), created_at: user.created_at });
});

router.put('/profile', authMiddleware, async (req, res) =>
{
  const { username, email, currentPassword, newPassword } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);
  if (!user)
  {
    return res.status(404).json({ error: 'Benutzer nicht gefunden' });
  }

  if (newPassword)
  {
    if (!currentPassword)
    {
      return res.status(400).json({ error: 'Aktuelles Passwort erforderlich' });
    }
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid)
    {
      return res.status(400).json({ error: 'Aktuelles Passwort ist falsch' });
    }
    if (newPassword.length < 6 || newPassword.length > 1000)
    {
      return res.status(400).json({ error: 'Neues Passwort muss zwischen 6 und 1000 Zeichen haben' });
    }
  }

  const updates = {};
  if (username && username.trim() !== user.username)
  {
    const trimmed = username.trim();
    if (trimmed.length < 3 || trimmed.length > 50)
    {
      return res.status(400).json({ error: 'Benutzername muss zwischen 3 und 50 Zeichen lang sein' });
    }
    updates.username = trimmed;
  }
  if (email && email.toLowerCase().trim() !== user.email)
  {
    const trimmed = email.toLowerCase().trim();
    if (!EMAIL_RE.test(trimmed))
    {
      return res.status(400).json({ error: 'Ungültige E-Mail-Adresse' });
    }
    updates.email = trimmed;
  }
  if (newPassword)
  {
    updates.password_hash = await bcrypt.hash(newPassword, 10);
  }

  if (!Object.keys(updates).length)
  {
    return res.json({ user: publicUser(user) });
  }

  try
  {
    const safeKeys = Object.keys(updates).filter(k => PROFILE_FIELDS.includes(k));
    const passwordChanged = safeKeys.includes('password_hash');
    let sets = safeKeys.map(k => `${k} = ?`).join(', ');
    if (passwordChanged)
    {
      // Erhöht die Token-Version → alle bestehenden Tokens werden ungültig
      sets += ', token_version = token_version + 1';
    }
    const vals = safeKeys.map(k => updates[k]);
    db.prepare(`UPDATE users SET ${sets} WHERE id = ?`).run(...vals, req.userId);
    const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(req.userId);

    const response = { user: publicUser(updated) };
    if (passwordChanged)
    {
      // Frischer Token, damit die aktuelle Sitzung nicht ausgeloggt wird
      response.token = signToken(updated.id, updated.token_version);
    }
    res.json(response);
  }
  catch (err)
  {
    if (err.message.includes('UNIQUE'))
    {
      if (err.message.includes('username'))
      {
        return res.status(400).json({ error: 'Benutzername bereits vergeben' });
      }
      return res.status(400).json({ error: 'E-Mail bereits registriert' });
    }
    res.status(500).json({ error: 'Serverfehler' });
  }
});

module.exports = { router, publicUser };
