const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const adminMiddleware = require('../middleware/admin');
const v = require('../utils/validate');
const files = require('../utils/attachments');

const router = express.Router();
router.use(adminMiddleware);

const BCRYPT_ROUNDS = 10;

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

/* Lädt das Zielkonto und prüft die Grenzen, die für beide Eingriffe gelten.

   Ein Admin fasst das Konto eines anderen Admins nicht an — beim Löschen war
   das immer so, beim Passwort fehlte die Grenze: über eine geratene ID ließ
   sich damit ein zweiter Admin aussperren, obwohl die Nutzerliste
   Administratoren gar nicht anzeigt.

   `selfMessage` unterscheidet die beiden Fälle: „löschen" und „Passwort setzen"
   brauchen für das eigene Konto verschiedene Hinweise. */
function loadTargetUser(selfMessage)
{
  return (req, res, next) =>
  {
    const targetId = v.parseIdParam(req.params.id);
    if (targetId === null)
    {
      return res.status(400).json({ error: 'Ungültige ID' });
    }
    if (targetId === req.userId)
    {
      return res.status(400).json({ error: selfMessage });
    }

    const target = db.prepare('SELECT id, is_admin FROM users WHERE id = ?').get(targetId);
    if (!target)
    {
      return res.status(404).json({ error: 'Nutzer nicht gefunden' });
    }
    if (target.is_admin)
    {
      return res.status(403).json({ error: 'Ein Admin-Konto ist hier nicht änderbar' });
    }

    req.targetUser = target;
    next();
  };
}

/* ── DELETE /api/admin/users/:id ──────────────────────────────────────────── */
router.delete('/users/:id', loadTargetUser('Eigenes Konto kann nicht gelöscht werden'),
  (req, res) =>
  {
    /* CASCADE entfernt die Datenbankzeilen der Anhänge, nicht aber die Dateien —
       die müssen vor dem Löschen ermittelt und danach entfernt werden */
    const stored = db.prepare(`
      SELECT a.stored_name
      FROM note_attachments a
      JOIN notes n ON n.id = a.note_id
      WHERE n.user_id = ?
    `).all(req.targetUser.id);

    db.prepare('DELETE FROM users WHERE id = ?').run(req.targetUser.id);
    stored.forEach(row => files.deleteFile(row.stored_name));

    res.json({ success: true });
  });

/* ── PUT /api/admin/users/:id/password ────────────────────────────────────── */
router.put('/users/:id/password',
  loadTargetUser('Das eigene Passwort wird im Profil geändert'),
  async (req, res, next) =>
  {
    try
    {
      const hash = await bcrypt.hash(v.password(req.body.password), BCRYPT_ROUNDS);

      // token_version + 1 → alle bestehenden Sitzungen des Nutzers werden ungültig
      db.prepare(`
        UPDATE users SET password_hash = ?, token_version = token_version + 1
        WHERE id = ?
      `).run(hash, req.targetUser.id);

      res.json({ success: true });
    }
    catch (err)
    {
      next(err);
    }
  });

module.exports = router;
