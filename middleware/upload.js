const multer = require('multer');
const { LIMITS } = require('../utils/attachments');

/* Dateien landen im Speicher und werden erst nach der Typ- und Kontingent-
   prüfung geschrieben — so entstehen keine Waisen-Dateien auf der Platte,
   wenn eine Prüfung fehlschlägt. 10 MB pro Datei sind dafür unkritisch. */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: LIMITS.maxFileBytes,
    files: LIMITS.maxFilesPerNote,
  },
});

/* Übersetzt Multers eigene Fehler in die deutschen Meldungen der App.
   Muss direkt nach der Upload-Middleware stehen, damit Express den Fehler
   nicht an den generischen 500er weiterreicht. */
function handleUploadErrors(err, req, res, next)
{
  if (!(err instanceof multer.MulterError))
  {
    return next(err);
  }
  const megabytes = Math.round(LIMITS.maxFileBytes / (1024 * 1024));
  const messages = {
    LIMIT_FILE_SIZE: `Datei ist zu groß — maximal ${megabytes} MB`,
    LIMIT_FILE_COUNT: `Maximal ${LIMITS.maxFilesPerNote} Dateien pro Notiz`,
    LIMIT_UNEXPECTED_FILE: 'Unerwartetes Dateifeld',
  };
  res.status(400).json({ error: messages[err.code] || 'Upload fehlgeschlagen' });
}

module.exports = { upload, handleUploadErrors };
