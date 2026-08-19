/* Testet public/js/markdown.js — dieselbe Datei, die der Browser lädt.

   Das Säubern braucht ein DOM: DOMPurify bindet beim Laden das globale `window`
   und meldet ohne eines `isSupported: false`, `sanitize()` gäbe es dann gar
   nicht. Deshalb steht die jsdom-Umgebung hier **vor** dem Import des Moduls.

   Damit prüft dieser Test das echte Verhalten und nicht mehr die Konfiguration
   im Quelltext: was rein darf, kommt an, und was gefährlich ist, verschwindet. */
const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const url = require('url');
const { JSDOM } = require('jsdom');

let md;

before(async () =>
{
  const dom = new JSDOM('<!doctype html><html><body></body></html>');
  global.window = dom.window;
  global.document = dom.window.document;

  const file = path.join(__dirname, '..', '..', 'public', 'js', 'markdown.js');
  md = await import(url.pathToFileURL(file).href);
});

/* Rendert und hängt das Ergebnis in ein Element — so lassen sich Tags und
   Attribute prüfen statt Zeichenketten zu vergleichen. */
function render(markdown)
{
  const host = global.document.createElement('div');
  host.innerHTML = md.renderMarkdown(markdown);
  return host;
}

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

  test('liefert für leere Eingaben eine leere Zeichenkette', () =>
  {
    assert.equal(md.markdownToHtml(''), '');
    assert.equal(md.markdownToHtml(null), '');
  });
});

describe('renderMarkdown — erlaubte Auszeichnung', () =>
{
  test('rendert Überschriften, Hervorhebungen und Listen', () =>
  {
    const host = render('# Titel\n\n## Tag 1\n\n**fett** *kursiv* ~~weg~~ `code`\n\n- eins\n- zwei');

    assert.equal(host.querySelector('h1').textContent, 'Titel');
    assert.equal(host.querySelector('h2').textContent, 'Tag 1');
    assert.ok(host.querySelector('strong'));
    assert.ok(host.querySelector('em'));
    assert.ok(host.querySelector('del'));
    assert.ok(host.querySelector('code'));
    assert.equal(host.querySelectorAll('ul > li').length, 2);
  });

  test('rendert Tabellen, Zitate und Codeblöcke', () =>
  {
    const host = render('| Tag | Ort |\n| --- | --- |\n| 1 | Eisenach |\n\n'
      + '> Regen\n\n```bash\nnpm test\n```');

    assert.equal(host.querySelectorAll('table tbody tr').length, 1);
    assert.equal(host.querySelector('th').textContent, 'Tag');
    assert.equal(host.querySelector('blockquote').textContent.trim(), 'Regen');
    assert.match(host.querySelector('pre code').textContent, /npm test/);
  });

  test('Verweise öffnen in einem neuen Tab ohne Zugriff auf die App', () =>
  {
    /* Diese beiden Attribute sind schon einmal still verschwunden, weil
       ALLOWED_URI_REGEXP zu streng war: DOMPurify prüft damit *jeden*
       Attributwert, nicht nur Adressen. */
    const link = render('[Weg](https://example.org/weg)').querySelector('a');

    assert.equal(link.getAttribute('href'), 'https://example.org/weg');
    assert.equal(link.getAttribute('target'), '_blank');
    assert.equal(link.getAttribute('rel'), 'noopener noreferrer');
  });

  test('Aufgabenlisten behalten ihre Kästchen und bleiben unveränderlich', () =>
  {
    const boxes = render('- [x] erledigt\n- [ ] offen').querySelectorAll('input');

    assert.equal(boxes.length, 2);
    assert.equal(boxes[0].getAttribute('type'), 'checkbox');
    assert.equal(boxes[0].hasAttribute('checked'), true);
    assert.equal(boxes[1].hasAttribute('checked'), false);
    // Angezeigt, nicht bedienbar — ein Häkchen würde niemand speichern
    assert.equal(boxes[0].hasAttribute('disabled'), true);
  });

  test('behält relative Ziele für Verweise und Bilder', () =>
  {
    const host = render('[Karte](/uploads/karte.png)\n\n![Bild](/uploads/bild.png)');

    assert.equal(host.querySelector('a').getAttribute('href'), '/uploads/karte.png');
    assert.equal(host.querySelector('img').getAttribute('src'), '/uploads/bild.png');
  });

  test('erlaubt mailto und tel', () =>
  {
    const host = render('[Mail](mailto:wanderer@example.org)\n\n[Anruf](tel:+4936912345)');
    const links = host.querySelectorAll('a');

    assert.equal(links[0].getAttribute('href'), 'mailto:wanderer@example.org');
    assert.equal(links[1].getAttribute('href'), 'tel:+4936912345');
  });

  test('liefert für leere Eingaben eine leere Zeichenkette', () =>
  {
    assert.equal(md.renderMarkdown(''), '');
    assert.equal(md.renderMarkdown(null), '');
    assert.equal(md.renderMarkdown(undefined), '');
  });
});

describe('renderMarkdown — Säuberung', () =>
{
  test('entfernt ein Skript samt seinem Inhalt', () =>
  {
    const host = render('Vorher\n\n<script>window.uebernommen = true;<\/script>\n\nNachher');

    assert.equal(host.querySelectorAll('script').length, 0);
    assert.equal(host.textContent.includes('uebernommen'), false);
    assert.match(host.textContent, /Vorher/);
    assert.match(host.textContent, /Nachher/);
  });

  test('entfernt Event-Attribute', () =>
  {
    const host = render('<img src="/bild.png" onerror="window.uebernommen = true">');

    assert.equal(host.innerHTML.includes('onerror'), false);
    assert.equal(host.querySelector('img')?.hasAttribute('onerror'), false);
  });

  test('nimmt einem javascript:-Verweis sein Ziel, behält aber den Text', () =>
  {
    const link = render('[Klick mich](javascript:window.uebernommen=1)').querySelector('a');

    assert.equal(link.hasAttribute('href'), false);
    assert.equal(link.textContent, 'Klick mich');
  });

  test('auch aus rohem HTML fällt javascript: heraus', () =>
  {
    const link = render('<a href="javascript:alert(1)">Roh</a>').querySelector('a');

    assert.equal(link.hasAttribute('href'), false);
    assert.equal(link.textContent, 'Roh');
  });

  test('lehnt Schemata ab, die eine Notiz nicht braucht', () =>
  {
    ['[FTP](ftp://example.org/datei)', '[Alt](vbscript:msgbox)',
      '[Chat](xmpp:jemand@example.org)'].forEach(source =>
      assert.equal(render(source).querySelector('a').hasAttribute('href'), false, source));
  });

  test('entfernt eingebettete Fremdinhalte und Formulare', () =>
  {
    const host = render([
      '<iframe src="https://example.org"></iframe>',
      '<object data="x.swf"></object>',
      '<embed src="x.swf">',
      '<form action="/weg"><input name="a"><button>Los</button></form>',
      '<style>body { display: none }</style>',
      '<svg><use href="#x"/></svg>',
    ].join('\n\n'));

    ['iframe', 'object', 'embed', 'form', 'style', 'svg'].forEach(tag =>
      assert.equal(host.querySelectorAll(tag).length, 0, `${tag} darf nicht überleben`));
  });

  test('entfernt Datenattribute', () =>
  {
    const host = render('<p data-verfolgung="1">Text</p>');

    assert.equal(host.innerHTML.includes('data-verfolgung'), false);
    assert.equal(host.querySelector('p').textContent, 'Text');
  });

  test('lässt ein eingebettetes Bild als data:-URL stehen', () =>
  {
    /* DOMPurify erlaubt `data:` ausdrücklich für Bildquellen, unabhängig von
       ALLOWED_URI_REGEXP — und das ist in Ordnung: ein Bild führt keinen Code
       aus, und die CSP der App lässt `data:` für Bilder ohnehin zu. Dieser Test
       hält die Entscheidung fest, damit sie nicht unbemerkt kippt. */
    const img = render('![Punkt](data:image/gif;base64,R0lGODlhAQABAAAAACw=)').querySelector('img');

    assert.match(img.getAttribute('src'), /^data:image\/gif;base64,/);
  });

  test('ein SVG in einer Bildquelle wird kein Element im Dokument', () =>
  {
    /* Als `<img src="data:image/svg+xml,…">` geladen führt ein Browser darin
       kein Skript aus. Entscheidend ist, dass daraus kein echtes <svg> im
       Dokument wird — dort wäre `onload` scharf. */
    const host = render('<img src="data:image/svg+xml,<svg onload=alert(1)></svg>">');

    assert.equal(host.querySelectorAll('svg').length, 0);
    assert.equal(host.querySelector('img').hasAttribute('onload'), false);
  });

  test('behält den sichtbaren Text, wenn ein Tag entfernt wird', () =>
  {
    /* Ein entfernter Rahmen soll nicht den Inhalt mitnehmen — sonst wäre eine
       Notiz nach dem Speichern plötzlich leer. */
    const host = render('<div class="beliebig">Wichtiger Absatz</div>');

    assert.match(host.textContent, /Wichtiger Absatz/);
  });
});
