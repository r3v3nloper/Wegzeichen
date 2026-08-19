const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { findOwned } = require('../utils/ownership');
const v = require('../utils/validate');

/* Eigener Pfad /api/note-folders statt /api/notes/folders: letzteres würde mit
   der Route /api/notes/:id kollidieren und wäre nur über die Reihenfolge der
   Registrierung auseinanderzuhalten. */
const router = express.Router();
router.use(authMiddleware);

const MAX_NAME = 60;

function listFolders(userId)
{
  return db.prepare(`
    SELECT f.id, f.name, f.created_at,
      (SELECT COUNT(*) FROM notes n WHERE n.folder_id = f.id) AS noteCount
    FROM note_folders f
    WHERE f.user_id = ?
    ORDER BY f.name COLLATE NOCASE
  `).all(userId);
}

/* Der UNIQUE-Index greift case-insensitiv; die Meldung soll das erklären,
   statt einen rohen Datenbankfehler durchzulassen. */
function handleDuplicate(err, res)
{
  if (String(err.message).includes('UNIQUE'))
  {
    return res.status(400).json({ error: 'Ein Ordner mit diesem Namen existiert schon' });
  }
  throw err;
}

/* ── GET /api/note-folders ──
   Liefert zusätzlich die Zahlen für „Alle" und „Ohne Ordner". Die lassen sich
   im Frontend nicht ableiten, weil die Notizliste dort schon gefiltert ist. */
router.get('/', (req, res) =>
{
  const counts = db.prepare(`
    SELECT COUNT(*) AS total,
      SUM(CASE WHEN folder_id IS NULL THEN 1 ELSE 0 END) AS unfiled
    FROM notes WHERE user_id = ?
  `).get(req.userId);

  res.json({
    folders: listFolders(req.userId),
    total: counts.total,
    unfiled: counts.unfiled || 0,
  });
});

/* ── POST /api/note-folders ──────────────────────────────────────────────── */
router.post('/', (req, res) =>
{
  const name = v.requiredText(req.body.name, 'Ordnername', MAX_NAME);

  try
  {
    const result = db.prepare('INSERT INTO note_folders (user_id, name) VALUES (?, ?)')
      .run(req.userId, name);
    res.json({ ...findOwned('note_folders', Number(result.lastInsertRowid), req.userId),
      noteCount: 0 });
  }
  catch (err)
  {
    handleDuplicate(err, res);
  }
});

/* ── PUT /api/note-folders/:id ──
   Umbenennen wirkt für alle enthaltenen Notizen auf einmal — genau der Grund,
   warum Ordner eine eigene Tabelle sind und kein Textfeld an der Notiz. */
router.put('/:id', (req, res) =>
{
  const id = v.parseIdParam(req.params.id);
  const existing = id === null ? null : findOwned('note_folders', id, req.userId);
  if (!existing)
  {
    return res.status(404).json({ error: 'Ordner nicht gefunden' });
  }

  const name = v.requiredText(req.body.name, 'Ordnername', MAX_NAME);

  try
  {
    db.prepare('UPDATE note_folders SET name = ? WHERE id = ? AND user_id = ?')
      .run(name, id, req.userId);
    res.json(listFolders(req.userId).find(f => f.id === id));
  }
  catch (err)
  {
    handleDuplicate(err, res);
  }
});

/* ── DELETE /api/note-folders/:id ──
   Die Notizen bleiben und rutschen per ON DELETE SET NULL nach „Ohne Ordner".
   Ein Ordner ist eine Einordnung, kein Behälter — löschen darf nichts vernichten. */
router.delete('/:id', (req, res) =>
{
  const id = v.parseIdParam(req.params.id);
  const folder = id === null ? null : findOwned('note_folders', id, req.userId);
  if (!folder)
  {
    return res.status(404).json({ error: 'Ordner nicht gefunden' });
  }

  db.prepare('DELETE FROM note_folders WHERE id = ? AND user_id = ?').run(id, req.userId);
  res.json({ success: true });
});

module.exports = router;
