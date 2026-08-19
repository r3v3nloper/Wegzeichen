const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const adminMiddleware = require('../middleware/admin');
const v = require('../utils/validate');
const files = require('../utils/attachments');

const router = express.Router();
router.use(adminMiddleware);

/* ── GET /api/admin/users — Nutzer mit Anzahl ihrer Einträge ──────────────── */
router.get('/users', (req, res) =>
{
  const users = db.prepare(`
    SELECT u.id, u.username, u.email, u.created_at,
      (SELECT COUNT(*) FROM notes n WHERE n.user_id = u.id) AS noteCount,
      (SELECT COUNT(*) FROM spots s WHERE s.user_id = u.id) AS spotCount,
      (SELECT COUNT(*) FROM trips t WHERE t.user_id = u.id) AS tripCount
    FROM users u
    WHERE u.is_admin = 0
    ORDER BY u.created_at DESC
  `).all();
  res.json(users);
});

/* ── DELETE /api/admin/users/:id ──────────────────────────────────────────── */
router.delete('/users/:id', (req, res) =>
{
  const targetId = v.parseIdParam(req.params.id);
  if (targetId === null)
  {
    return res.status(400).json({ error: 'Ungültige ID' });
  }
  if (targetId === req.userId)
  {
    return res.status(400).json({ error: 'Eigenes Konto kann nicht gelöscht werden' });
  }

  const target = db.prepare('SELECT id, is_admin FROM users WHERE id = ?').get(targetId);
  if (!target)
  {
    return res.status(404).json({ error: 'Nutzer nicht gefunden' });
  }
  if (target.is_admin)
  {
    return res.status(403).json({ error: 'Admin kann nicht gelöscht werden' });
  }

  /* CASCADE entfernt die Datenbankzeilen der Anhänge, nicht aber die Dateien —
     die müssen vor dem Löschen ermittelt und danach entfernt werden */
  const stored = db.prepare(`
    SELECT a.stored_name
    FROM note_attachments a
    JOIN notes n ON n.id = a.note_id
    WHERE n.user_id = ?
  `).all(targetId);

  db.prepare('DELETE FROM users WHERE id = ?').run(targetId);
  stored.forEach(row => files.deleteFile(row.stored_name));

  res.json({ success: true });
});

/* ── PUT /api/admin/users/:id/password ────────────────────────────────────── */
router.put('/users/:id/password', async (req, res) =>
{
  const targetId = v.parseIdParam(req.params.id);
  if (targetId === null)
  {
    return res.status(400).json({ error: 'Ungültige ID' });
  }

  const { password } = req.body;
  if (!password || typeof password !== 'string' || password.length < 6 || password.length > 1000)
  {
    return res.status(400).json({ error: 'Passwort muss zwischen 6 und 1000 Zeichen haben' });
  }

  const target = db.prepare('SELECT id FROM users WHERE id = ?').get(targetId);
  if (!target)
  {
    return res.status(404).json({ error: 'Nutzer nicht gefunden' });
  }

  const hash = await bcrypt.hash(password, 10);
  // token_version + 1 → alle bestehenden Sitzungen des Nutzers werden ungültig
  db.prepare('UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?')
    .run(hash, targetId);
  res.json({ success: true });
});

module.exports = router;
