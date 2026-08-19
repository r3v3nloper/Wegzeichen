const express = require('express');
const db = require('../db');
const { upload, handleUploadErrors } = require('../middleware/upload');
const { findOwned } = require('../utils/ownership');
const v = require('../utils/validate');
const files = require('../utils/attachments');

/* Wird von routes/notes.js unter /notes/:noteId/attachments eingehängt.
   mergeParams macht :noteId hier verfügbar. */
const router = express.Router({ mergeParams: true });

/* Jede Route dieses Routers prüft zuerst, dass die Notiz dem Nutzer gehört —
   sonst wären Anhänge über eine geratene Notiz-ID erreichbar. */
router.use((req, res, next) =>
{
  const noteId = v.parseIdParam(req.params.noteId);
  if (noteId === null)
  {
    return res.status(400).json({ error: 'Ungültige Notiz-ID' });
  }
  const note = findOwned('notes', noteId, req.userId);
  if (!note)
  {
    return res.status(404).json({ error: 'Notiz nicht gefunden' });
  }
  req.note = note;
  next();
});

function userUsageBytes(userId)
{
  const row = db.prepare(`
    SELECT COALESCE(SUM(a.size_bytes), 0) AS total
    FROM note_attachments a
    JOIN notes n ON n.id = a.note_id
    WHERE n.user_id = ?
  `).get(userId);
  return row.total;
}

function countForNote(noteId)
{
  return db.prepare('SELECT COUNT(*) AS c FROM note_attachments WHERE note_id = ?')
    .get(noteId).c;
}

function publicAttachment(row)
{
  return {
    id: row.id,
    original_name: row.original_name,
    mime_type: row.mime_type,
    size_bytes: row.size_bytes,
    created_at: row.created_at,
  };
}

/* ── POST /api/notes/:noteId/attachments ──────────────────────────────────── */
router.post('/', upload.array('files'), handleUploadErrors, (req, res) =>
{
  const uploaded = req.files || [];
  if (!uploaded.length)
  {
    return res.status(400).json({ error: 'Keine Datei übermittelt' });
  }

  const alreadyStored = countForNote(req.note.id);
  if (alreadyStored + uploaded.length > files.LIMITS.maxFilesPerNote)
  {
    return res.status(400).json({
      error: `Maximal ${files.LIMITS.maxFilesPerNote} Anhänge pro Notiz`
        + ` (${alreadyStored} vorhanden)`,
    });
  }

  /* Namen einmal an der Systemgrenze entschärfen; danach wird nur noch mit
     dem bereinigten Namen gearbeitet */
  const incoming = uploaded.map(file => ({
    name: files.readUploadName(file.originalname),
    mimeType: file.mimetype,
    size: file.size,
    buffer: file.buffer,
  }));

  const rejected = incoming.find(f => !files.isAllowed(f.mimeType, f.name));
  if (rejected)
  {
    return res.status(400).json({ error: `Dateityp nicht erlaubt: ${rejected.name}` });
  }

  const incomingBytes = incoming.reduce((sum, f) => sum + f.size, 0);
  if (userUsageBytes(req.userId) + incomingBytes > files.LIMITS.maxBytesPerUser)
  {
    const megabytes = Math.round(files.LIMITS.maxBytesPerUser / (1024 * 1024));
    return res.status(400).json({ error: `Speicherkontingent von ${megabytes} MB erschöpft` });
  }

  /* Erst alle Dateien schreiben, dann die Metadaten in einer Transaktion —
     bricht das Schreiben ab, sind noch keine Datenbankzeilen entstanden. */
  const prepared = incoming.map(file =>
  {
    const storedName = files.generateStoredName(file.mimeType);
    files.writeFile(storedName, file.buffer);
    return {
      storedName,
      originalName: file.name,
      mimeType: file.mimeType,
      size: file.size,
    };
  });

  const insert = db.prepare(`
    INSERT INTO note_attachments (note_id, original_name, stored_name, mime_type, size_bytes)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertAll = db.transaction(items =>
  {
    items.forEach(item => insert.run(
      req.note.id, item.originalName, item.storedName, item.mimeType, item.size
    ));
  });

  try
  {
    insertAll(prepared);
  }
  catch (err)
  {
    prepared.forEach(item => files.deleteFile(item.storedName));
    throw err;
  }

  const rows = db.prepare(
    'SELECT * FROM note_attachments WHERE note_id = ? ORDER BY created_at, id'
  ).all(req.note.id);
  res.json(rows.map(publicAttachment));
});

/* ── GET /api/notes/:noteId/attachments/:id/file ──────────────────────────── */
router.get('/:id/file', (req, res) =>
{
  const attachmentId = v.parseIdParam(req.params.id);
  if (attachmentId === null)
  {
    return res.status(400).json({ error: 'Ungültige ID' });
  }

  const row = db.prepare('SELECT * FROM note_attachments WHERE id = ? AND note_id = ?')
    .get(attachmentId, req.note.id);
  if (!row)
  {
    return res.status(404).json({ error: 'Anhang nicht gefunden' });
  }

  const stream = files.readFile(row.stored_name);
  if (!stream)
  {
    return res.status(410).json({ error: 'Datei ist nicht mehr vorhanden' });
  }

  /* nosniff und attachment verhindern, dass der Browser eine Datei als etwas
     anderes interpretiert als den gespeicherten Typ */
  res.set({
    'Content-Type': row.mime_type,
    'Content-Length': row.size_bytes,
    'X-Content-Type-Options': 'nosniff',
    'Content-Disposition':
      `attachment; filename*=UTF-8''${encodeURIComponent(row.original_name)}`,
  });
  stream.pipe(res);
});

/* ── DELETE /api/notes/:noteId/attachments/:id ────────────────────────────── */
router.delete('/:id', (req, res) =>
{
  const attachmentId = v.parseIdParam(req.params.id);
  if (attachmentId === null)
  {
    return res.status(400).json({ error: 'Ungültige ID' });
  }

  const row = db.prepare('SELECT * FROM note_attachments WHERE id = ? AND note_id = ?')
    .get(attachmentId, req.note.id);
  if (!row)
  {
    return res.status(404).json({ error: 'Anhang nicht gefunden' });
  }

  db.prepare('DELETE FROM note_attachments WHERE id = ?').run(attachmentId);
  files.deleteFile(row.stored_name);
  res.json({ success: true });
});

module.exports = { router, publicAttachment };
