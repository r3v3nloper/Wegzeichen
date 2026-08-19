/* Ablage der Notiz-Anhänge auf der Platte.
   Die Dateien liegen unter DATA_DIR/attachments mit einem generierten Namen;
   der Originalname steht nur in der Datenbank. Damit kann ein hochgeladener
   Name niemals einen Pfad beeinflussen. */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const MEGABYTE = 1024 * 1024;

const LIMITS = {
  maxFileBytes: 10 * MEGABYTE,
  maxFilesPerNote: 5,
  maxBytesPerUser: 200 * MEGABYTE,
};

/* Erlaubte Typen mit der Endung, unter der die Datei abgelegt wird.
   Bewusst ohne HTML und SVG: beide könnten Skript enthalten. */
const ALLOWED_TYPES = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.oasis.opendocument.text': '.odt',
  'text/plain': '.txt',
  'text/markdown': '.md',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
};

const ALLOWED_EXTENSIONS = new Set(Object.values(ALLOWED_TYPES));

function attachmentDir()
{
  return path.join(process.env.DATA_DIR || path.join(__dirname, '..'), 'attachments');
}

function ensureDir()
{
  fs.mkdirSync(attachmentDir(), { recursive: true });
}

function isAllowed(mimeType, originalName)
{
  const extension = path.extname(originalName || '').toLowerCase();
  return !!ALLOWED_TYPES[mimeType] && ALLOWED_EXTENSIONS.has(extension);
}

/* Originalname nur für die Anzeige: Pfadanteile und Steuerzeichen entfernen,
   damit ein Download-Header nicht manipulierbar ist */
function sanitizeOriginalName(name)
{
  const base = path.basename(String(name || 'datei'));
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"\\]/g, '').trim();
  return (cleaned || 'datei').slice(0, 200);
}

/* multer beziehungsweise busboy dekodiert Dateinamen aus dem Multipart-Header
   als latin1. „Höhenprofil.txt" kommt dadurch als „HÃ¶henprofil.txt" an und
   muss zurück nach UTF-8 gedreht werden. Für reine ASCII-Namen ist das ein
   No-op. */
function decodeUploadFilename(raw)
{
  return Buffer.from(String(raw ?? ''), 'latin1').toString('utf8');
}

/* Einstiegspunkt für Namen aus einem Upload: dekodieren und entschärfen */
function readUploadName(raw)
{
  return sanitizeOriginalName(decodeUploadFilename(raw));
}

function generateStoredName(mimeType)
{
  return `${crypto.randomUUID()}${ALLOWED_TYPES[mimeType] || ''}`;
}

/* Löst einen gespeicherten Namen zu einem absoluten Pfad auf und stellt sicher,
   dass er das Anhang-Verzeichnis nicht verlässt. Die Namen stammen aus der
   eigenen Datenbank — die Prüfung ist die zweite Verteidigungslinie. */
function resolveStoredPath(storedName)
{
  const dir = attachmentDir();
  const resolved = path.resolve(dir, storedName);
  const prefix = path.resolve(dir) + path.sep;
  if (!resolved.startsWith(prefix))
  {
    return null;
  }
  return resolved;
}

function writeFile(storedName, buffer)
{
  const target = resolveStoredPath(storedName);
  if (!target)
  {
    throw new Error('Ungültiger Speicherpfad');
  }
  ensureDir();
  fs.writeFileSync(target, buffer);
}

function deleteFile(storedName)
{
  const target = resolveStoredPath(storedName);
  if (!target)
  {
    return;
  }
  try
  {
    fs.unlinkSync(target);
  }
  catch
  {
    // Datei fehlt schon — der Datenbankeintrag wird trotzdem entfernt
  }
}

function readFile(storedName)
{
  const target = resolveStoredPath(storedName);
  if (!target || !fs.existsSync(target))
  {
    return null;
  }
  return fs.createReadStream(target);
}

module.exports = {
  LIMITS,
  ALLOWED_TYPES,
  attachmentDir,
  ensureDir,
  isAllowed,
  sanitizeOriginalName,
  decodeUploadFilename,
  readUploadName,
  generateStoredName,
  resolveStoredPath,
  writeFile,
  deleteFile,
  readFile,
};
