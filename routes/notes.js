const express = require('express');
const db = require('../db');
const authMiddleware = require('../middleware/auth');
const { findOwned, likePattern } = require('../utils/ownership');
const { router: attachmentsRouter, publicAttachment } = require('./attachments');
const v = require('../utils/validate');
const files = require('../utils/attachments');

const router = express.Router();
router.use(authMiddleware);

const MAX_TITLE = 200;
const MAX_BODY = 50000;

/* Anhänge sind eine Unterressource der Notiz und erben deren Zugriffsprüfung */
router.use('/:noteId/attachments', attachmentsRouter);

function attachmentsFor(noteId)
{
  return db.prepare(
    'SELECT * FROM note_attachments WHERE note_id = ? ORDER BY created_at, id'
  ).all(noteId).map(publicAttachment);
}

/* Einzelne Notiz samt Ordnernamen — der JOIN filtert auf den Besitzer, damit
   eine veraltete Zuordnung nichts Fremdes ausliest. */
function ownedNote(id, userId)
{
  return db.prepare(`
    SELECT n.*, f.name AS folder_name
    FROM notes n
    LEFT JOIN note_folders f ON f.id = n.folder_id AND f.user_id = n.user_id
    WHERE n.id = ? AND n.user_id = ?
  `).get(id, userId);
}

/* Die Zuordnung darf nur auf eigene Ordner zeigen — sonst ließe sich über eine
   geratene ID der Ordnername eines anderen Nutzers auslesen. Ein fremder oder
   unbekannter Ordner wird stillschweigend zu „ohne Ordner". */
function readFolderId(raw, userId)
{
  const id = v.optionalInt(raw, 'Ordner', 1, Number.MAX_SAFE_INTEGER);
  if (id === null || !findOwned('note_folders', id, userId))
  {
    return null;
  }
  return id;
}

function readBody(body, userId)
{
  return {
    title: v.requiredText(body.title, 'Titel', MAX_TITLE),
    body: v.optionalText(body.body, 'Inhalt', MAX_BODY),
    isFavorite: v.boolFlag(body.is_favorite),
    folderId: readFolderId(body.folder_id, userId),
  };
}

/* ── GET /api/notes?q=&folder= ──
   Favoriten stehen immer oben, danach das zuletzt Geänderte.
   `folder=none` liefert die Notizen ohne Ordner. */
router.get('/', (req, res) =>
{
  const conditions = ['n.user_id = ?'];
  const params = [req.userId];

  const term = v.optionalText(req.query.q, 'Suchbegriff', 200);
  if (term)
  {
    conditions.push(`(n.title LIKE ? ESCAPE '\\' OR COALESCE(n.body, '') LIKE ? ESCAPE '\\')`);
    params.push(likePattern(term), likePattern(term));
  }

  const folder = v.optionalText(req.query.folder, 'Ordner', 20);
  if (folder === 'none')
  {
    conditions.push('n.folder_id IS NULL');
  }
  else if (folder)
  {
    conditions.push('n.folder_id = ?');
    params.push(v.optionalInt(folder, 'Ordner', 1, Number.MAX_SAFE_INTEGER));
  }

  const rows = db.prepare(`
    SELECT n.*, f.name AS folder_name,
      (SELECT COUNT(*) FROM note_attachments a WHERE a.note_id = n.id) AS attachmentCount
    FROM notes n
    LEFT JOIN note_folders f ON f.id = n.folder_id AND f.user_id = n.user_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY n.is_favorite DESC, n.updated_at DESC
  `).all(...params);

  res.json(rows);
});

/* ── GET /api/notes/:id ───────────────────────────────────────────────────── */
router.get('/:id', (req, res) =>
{
  const id = v.parseIdParam(req.params.id);
  const note = id === null ? null : ownedNote(id, req.userId);
  if (!note)
  {
    return res.status(404).json({ error: 'Notiz nicht gefunden' });
  }
  res.json({ ...note, attachments: attachmentsFor(note.id) });
});

/* ── POST /api/notes ──────────────────────────────────────────────────────── */
router.post('/', (req, res) =>
{
  const data = readBody(req.body, req.userId);
  const result = db.prepare(
    'INSERT INTO notes (user_id, folder_id, title, body, is_favorite) VALUES (?, ?, ?, ?, ?)'
  ).run(req.userId, data.folderId, data.title, data.body, data.isFavorite);

  const note = ownedNote(Number(result.lastInsertRowid), req.userId);
  res.json({ ...note, attachments: [] });
});

/* ── PUT /api/notes/:id ───────────────────────────────────────────────────── */
router.put('/:id', (req, res) =>
{
  const id = v.parseIdParam(req.params.id);
  const existing = id === null ? null : findOwned('notes', id, req.userId);
  if (!existing)
  {
    return res.status(404).json({ error: 'Notiz nicht gefunden' });
  }

  const data = readBody(req.body, req.userId);
  db.prepare(`
    UPDATE notes SET folder_id = ?, title = ?, body = ?, is_favorite = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(data.folderId, data.title, data.body, data.isFavorite, id, req.userId);

  res.json({ ...ownedNote(id, req.userId), attachments: attachmentsFor(id) });
});

/* ── DELETE /api/notes/:id ──
   Die Datenbankzeilen der Anhänge verschwinden per CASCADE, die Dateien auf
   der Platte müssen ausdrücklich weg — sonst bleiben Waisen liegen. */
router.delete('/:id', (req, res) =>
{
  const id = v.parseIdParam(req.params.id);
  const note = id === null ? null : findOwned('notes', id, req.userId);
  if (!note)
  {
    return res.status(404).json({ error: 'Notiz nicht gefunden' });
  }

  const stored = db.prepare('SELECT stored_name FROM note_attachments WHERE note_id = ?')
    .all(id);
  db.prepare('DELETE FROM notes WHERE id = ? AND user_id = ?').run(id, req.userId);
  stored.forEach(row => files.deleteFile(row.stored_name));

  res.json({ success: true });
});

module.exports = router;
