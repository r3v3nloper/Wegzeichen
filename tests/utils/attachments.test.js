const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'wegzeichen-att-'));

const { test, describe } = require('node:test');
const assert = require('node:assert');
const files = require('../../utils/attachments');

describe('isAllowed', () =>
{
  test('lässt PDF mit passender Endung durch', () =>
  {
    assert.equal(files.isAllowed('application/pdf', 'rechnung.pdf'), true);
  });

  test('lehnt ausführbare Dateien ab', () =>
  {
    assert.equal(files.isAllowed('application/x-msdownload', 'virus.exe'), false);
  });

  test('lehnt SVG ab, weil es Skript enthalten kann', () =>
  {
    assert.equal(files.isAllowed('image/svg+xml', 'logo.svg'), false);
  });

  test('lehnt HTML ab', () =>
  {
    assert.equal(files.isAllowed('text/html', 'seite.html'), false);
  });

  test('lehnt erlaubten MIME-Typ mit fremder Endung ab', () =>
  {
    assert.equal(files.isAllowed('application/pdf', 'nutzlast.exe'), false);
  });

  test('behandelt Endungen unabhängig von Groß- und Kleinschreibung', () =>
  {
    assert.equal(files.isAllowed('image/jpeg', 'BILD.JPG'), true);
  });
});

describe('sanitizeOriginalName', () =>
{
  test('entfernt Pfadanteile', () =>
  {
    assert.equal(files.sanitizeOriginalName('../../etc/passwd'), 'passwd');
    assert.equal(files.sanitizeOriginalName('C:\\Users\\erik\\datei.pdf'), 'datei.pdf');
  });

  test('entfernt Anführungszeichen, die den Download-Header brechen würden', () =>
  {
    assert.equal(files.sanitizeOriginalName('da"tei.pdf'), 'datei.pdf');
  });

  test('entfernt Steuerzeichen', () =>
  {
    assert.equal(files.sanitizeOriginalName('datei\r\n.pdf'), 'datei.pdf');
  });

  test('fällt auf einen Namen zurück, wenn nichts übrig bleibt', () =>
  {
    assert.equal(files.sanitizeOriginalName(''), 'datei');
    assert.equal(files.sanitizeOriginalName('"""'), 'datei');
  });

  test('kürzt übermäßig lange Namen', () =>
  {
    assert.equal(files.sanitizeOriginalName('a'.repeat(500)).length, 200);
  });
});

describe('decodeUploadFilename', () =>
{
  test('dreht die latin1-Fehldekodierung von multer zurück', () =>
  {
    // So kommt "Höhenprofil.txt" bei multer an
    assert.equal(files.decodeUploadFilename('HÃ¶henprofil.txt'), 'Höhenprofil.txt');
  });

  test('lässt reine ASCII-Namen unverändert', () =>
  {
    assert.equal(files.decodeUploadFilename('report_2026.pdf'), 'report_2026.pdf');
  });
});

describe('readUploadName', () =>
{
  test('dekodiert und entschärft in einem Schritt', () =>
  {
    assert.equal(files.readUploadName('../HÃ¶he".txt'), 'Höhe.txt');
  });
});

describe('generateStoredName', () =>
{
  test('hängt die zum Typ passende Endung an', () =>
  {
    assert.match(files.generateStoredName('application/pdf'), /^[0-9a-f-]{36}\.pdf$/);
  });

  test('liefert bei jedem Aufruf einen anderen Namen', () =>
  {
    const a = files.generateStoredName('text/plain');
    const b = files.generateStoredName('text/plain');
    assert.notEqual(a, b);
  });
});

describe('resolveStoredPath', () =>
{
  test('löst einen normalen Namen im Anhang-Verzeichnis auf', () =>
  {
    const resolved = files.resolveStoredPath('abc.pdf');

    assert.ok(resolved.startsWith(path.resolve(files.attachmentDir())));
  });

  test('verweigert das Verlassen des Verzeichnisses', () =>
  {
    ['../geheim.txt', '../../etc/passwd', '..\\..\\windows\\system32\\config']
      .forEach(name => assert.equal(files.resolveStoredPath(name), null, name));
  });

  test('verweigert absolute Pfade', () =>
  {
    assert.equal(files.resolveStoredPath(path.join(os.tmpdir(), 'fremd.txt')), null);
  });
});

describe('writeFile, readFile und deleteFile', () =>
{
  test('schreiben, lesen und löschen eine Datei', async () =>
  {
    const name = files.generateStoredName('text/plain');

    files.writeFile(name, Buffer.from('Inhalt'));
    const stream = files.readFile(name);
    const chunks = [];
    for await (const chunk of stream)
    {
      chunks.push(chunk);
    }

    assert.equal(Buffer.concat(chunks).toString(), 'Inhalt');

    files.deleteFile(name);
    assert.equal(files.readFile(name), null);
  });

  test('das Löschen einer fehlenden Datei wirft nicht', () =>
  {
    assert.doesNotThrow(() => files.deleteFile('gibt-es-nicht.pdf'));
  });

  test('writeFile verweigert einen Pfad außerhalb des Verzeichnisses', () =>
  {
    assert.throws(() => files.writeFile('../ausbruch.txt', Buffer.from('x')));
  });
});
