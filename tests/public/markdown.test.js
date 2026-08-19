/* Testet public/js/markdown.js — dieselbe Datei, die der Browser lädt.

   Geprüft werden die Umformung zu reinem Text (Listenauszüge) und die
   marked-Konfiguration. Das Säubern selbst braucht ein DOM: DOMPurify meldet
   in Node `isSupported: false`. Statt dafür jsdom aufzunehmen, sichert der
   letzte Block am Quelltext ab, dass renderMarkdown durch DOMPurify läuft und
   die Positivliste kein Skript-Tag enthält. */
const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const url = require('url');

const SOURCE_FILE = path.join(__dirname, '..', '..', 'public', 'js', 'markdown.js');
const SOURCE = fs.readFileSync(SOURCE_FILE, 'utf8');

let md;

before(async () =>
{
  md = await import(url.pathToFileURL(SOURCE_FILE).href);
});

describe('markdownToPlainText', () =>
{
  test('entfernt Überschriften-Zeichen', () =>
  {
    assert.equal(md.markdownToPlainText('## Tag 1'), 'Tag 1');
    assert.equal(md.markdownToPlainText('###### Tief'), 'Tief');
  });

  test('behält den Text von Hervorhebungen', () =>
  {
    assert.equal(md.markdownToPlainText('**wichtig** und *kursiv* und ~~weg~~'),
      'wichtig und kursiv und weg');
  });

  test('behält bei Verweisen nur den Verweistext', () =>
  {
    assert.equal(md.markdownToPlainText('Zur [Drachenschlucht](https://example.org/weg) gehen'),
      'Zur Drachenschlucht gehen');
  });

  test('lässt bei Bildern den Alternativtext stehen', () =>
  {
    assert.equal(md.markdownToPlainText('![Gipfelblick](/uploads/gipfel.jpg)'), 'Gipfelblick');
  });

  test('räumt Listen, Aufgaben und Zitate ab', () =>
  {
    const source = '- Brotzeit\n- [ ] Karte drucken\n1. Aufstieg\n> Regen ab Mittag';

    assert.equal(md.markdownToPlainText(source),
      'Brotzeit Karte drucken Aufstieg Regen ab Mittag');
  });

  test('wirft Codeblöcke samt Zäunen weg', () =>
  {
    const source = 'Vorher\n```bash\nnpm test\n```\nNachher';

    assert.equal(md.markdownToPlainText(source), 'Vorher Nachher');
  });

  test('behält Inline-Code als Text', () =>
  {
    assert.equal(md.markdownToPlainText('Die `gpx`-Datei liegt dabei'),
      'Die gpx-Datei liegt dabei');
  });

  test('macht aus einer Tabelle eine lesbare Zeile', () =>
  {
    const source = '| Tag | Ort |\n| --- | --- |\n| 1 | Eisenach |';

    assert.equal(md.markdownToPlainText(source), 'Tag Ort 1 Eisenach');
  });

  test('faltet Zeilenumbrüche zu einzelnen Leerzeichen', () =>
  {
    assert.equal(md.markdownToPlainText('Erste Zeile\n\n\nZweite Zeile'),
      'Erste Zeile Zweite Zeile');
  });

  test('liefert für leere Eingaben eine leere Zeichenkette', () =>
  {
    assert.equal(md.markdownToPlainText(null), '');
    assert.equal(md.markdownToPlainText(''), '');
    assert.equal(md.markdownToPlainText('   '), '');
  });
});

describe('markdownToHtml', () =>
{
  test('rendert Überschriften und Listen', () =>
  {
    const html = md.markdownToHtml('## Tag 1\n\n- Brotzeit');

    assert.match(html, /<h2>Tag 1<\/h2>/);
    assert.match(html, /<li>Brotzeit<\/li>/);
  });

  test('nimmt einen einzelnen Zeilenumbruch als Umbruch', () =>
  {
    /* Ohne breaks:true verlangt CommonMark zwei Leerzeichen am Zeilenende —
       in einer Notiz tippt das niemand. */
    assert.match(md.markdownToHtml('Erste Zeile\nZweite Zeile'), /<br\s*\/?>/);
  });

  test('rendert GFM-Tabellen und Aufgabenlisten', () =>
  {
    assert.match(md.markdownToHtml('| A | B |\n| - | - |\n| 1 | 2 |'), /<table>/);
    assert.match(md.markdownToHtml('- [x] erledigt'), /type="checkbox"/);
  });

  test('öffnet Verweise in einem neuen Tab ohne Zugriff auf die App', () =>
  {
    const html = md.markdownToHtml('[Weg](https://example.org)');

    assert.match(html, /target="_blank"/);
    assert.match(html, /rel="noopener noreferrer"/);
  });

  test('liefert für leere Eingaben eine leere Zeichenkette', () =>
  {
    assert.equal(md.markdownToHtml(''), '');
    assert.equal(md.markdownToHtml(null), '');
  });
});

describe('Säuberung', () =>
{
  test('renderMarkdown gibt HTML nur über DOMPurify aus', () =>
  {
    /* Notizinhalt ist Nutzertext. Fällt diese Zeile weg, landet rohes HTML aus
       einer Notiz direkt im Dokument. */
    assert.match(SOURCE, /DOMPurify\.sanitize\(html, SANITIZE_OPTIONS\)/);
  });

  test('die Positivliste enthält keine Tags, die Code ausführen können', () =>
  {
    const list = SOURCE.match(/ALLOWED_TAGS: \[([\s\S]*?)\]/)[1];
    const tags = [...list.matchAll(/'([^']+)'/g)].map(m => m[1]);

    ['script', 'iframe', 'object', 'embed', 'style', 'form', 'svg'].forEach(tag =>
      assert.equal(tags.includes(tag), false, `${tag} darf nicht erlaubt sein`));
  });

  test('erlaubte Adressen beschränken sich auf http, https, mailto und tel', () =>
  {
    // Sonst wären javascript:-Verweise in einer Notiz möglich
    const pattern = SOURCE.match(/ALLOWED_URI_REGEXP: (\/.*\/i),/)[1];
    const allowed = new RegExp(pattern.slice(1, -2), 'i');

    ['https://example.org/weg', 'http://example.org', 'mailto:wanderer@example.org',
      'tel:+4936912345'].forEach(uri =>
      assert.ok(allowed.test(uri), `${uri} sollte erlaubt sein`));

    ['javascript:alert(1)', 'ftp://example.org', 'xmpp:jemand@example.org'].forEach(uri =>
      assert.equal(allowed.test(uri), false, `${uri} darf nicht erlaubt sein`));
  });

  test('schemalose Attributwerte kommen durch', () =>
  {
    /* DOMPurify prüft mit ALLOWED_URI_REGEXP jeden Attributwert. Wird der
       Ausdruck zu streng, verschwinden target="_blank" und type="checkbox"
       still aus dem gerenderten Markdown. */
    const pattern = SOURCE.match(/ALLOWED_URI_REGEXP: (\/.*\/i),/)[1];
    const allowed = new RegExp(pattern.slice(1, -2), 'i');

    ['_blank', 'noopener noreferrer', 'checkbox', '/uploads/karte.png'].forEach(value =>
      assert.ok(allowed.test(value), `${value} sollte durchkommen`));
  });

  test('Datenattribute sind abgeschaltet', () =>
  {
    assert.match(SOURCE, /ALLOW_DATA_ATTR: false/);
  });
});
