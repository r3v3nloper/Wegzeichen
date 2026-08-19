/* Testet public/js/markdown-input.js — die Textumformungen der Werkzeugleiste.
   Das Modul ist absichtlich frei von DOM, deshalb genügt hier der Zustand eines
   Eingabefelds als einfaches Objekt. */
const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const url = require('url');

let mdInput;

before(async () =>
{
  const file = path.join(__dirname, '..', '..', 'public', 'js', 'markdown-input.js');
  mdInput = await import(url.pathToFileURL(file).href);
});

/* Kurzschreibweise: der Bereich zwischen | markiert die Auswahl */
function field(marked)
{
  const start = marked.indexOf('|');
  const end = marked.indexOf('|', start + 1);
  assert.ok(start !== -1 && end !== -1, 'Testeingabe braucht zwei | als Auswahlgrenzen');

  return {
    value: marked.slice(0, start) + marked.slice(start + 1, end) + marked.slice(end + 1),
    selectionStart: start,
    selectionEnd: end - 1,
  };
}

function selectionOf(state)
{
  return state.value.slice(state.selectionStart, state.selectionEnd);
}

describe('toggleInline', () =>
{
  test('zeichnet die Auswahl aus', () =>
  {
    const result = mdInput.toggleInline(field('Die |Hütte| ist offen'), '**');

    assert.equal(result.value, 'Die **Hütte** ist offen');
    assert.equal(selectionOf(result), 'Hütte');
  });

  test('nimmt eine bereits ausgezeichnete Auswahl zurück', () =>
  {
    const result = mdInput.toggleInline(field('Die |**Hütte**| ist offen'), '**');

    assert.equal(result.value, 'Die Hütte ist offen');
    assert.equal(selectionOf(result), 'Hütte');
  });

  test('erkennt Marker auch außerhalb der Auswahl', () =>
  {
    // Der Cursor steht im Wort, die Sterne liegen davor und danach
    const result = mdInput.toggleInline(field('Die **|Hütte|** ist offen'), '**');

    assert.equal(result.value, 'Die Hütte ist offen');
    assert.equal(selectionOf(result), 'Hütte');
  });

  test('setzt ohne Auswahl einen markierten Platzhalter ein', () =>
  {
    const state = { value: 'Text ', selectionStart: 5, selectionEnd: 5 };

    const result = mdInput.toggleInline(state, '*', 'kursiv');

    assert.equal(result.value, 'Text *kursiv*');
    assert.equal(selectionOf(result), 'kursiv');
  });

  test('arbeitet auch mit einzeichigen Markern', () =>
  {
    const result = mdInput.toggleInline(field('die |gpx|-Datei'), '`');

    assert.equal(result.value, 'die `gpx`-Datei');
  });
});

describe('toggleLinePrefix', () =>
{
  test('setzt das Präfix auf alle angefassten Zeilen', () =>
  {
    const result = mdInput.toggleLinePrefix(field('|Brotzeit\nKarte\nSchuhe|'), '- ');

    assert.equal(result.value, '- Brotzeit\n- Karte\n- Schuhe');
  });

  test('entfernt das Präfix, wenn alle Zeilen es schon tragen', () =>
  {
    const result = mdInput.toggleLinePrefix(field('|- Brotzeit\n- Karte|'), '- ');

    assert.equal(result.value, 'Brotzeit\nKarte');
  });

  test('greift auf die ganze Zeile, auch wenn nur der Cursor darin steht', () =>
  {
    const state = { value: 'Tag 1', selectionStart: 2, selectionEnd: 2 };

    assert.equal(mdInput.toggleLinePrefix(state, '## ').value, '## Tag 1');
  });

  test('ersetzt ein vorhandenes Zeilenzeichen statt zu stapeln', () =>
  {
    // Sonst entstünde "> - Brotzeit" statt eines Zitats
    const result = mdInput.toggleLinePrefix(field('|- Brotzeit|'), '> ');

    assert.equal(result.value, '> Brotzeit');
  });

  test('wechselt zwischen Überschriftenebenen ohne Stapelung', () =>
  {
    const result = mdInput.toggleLinePrefix(field('|### Tag 1|'), '## ');

    assert.equal(result.value, '## Tag 1');
  });

  test('nummeriert Listen fortlaufend', () =>
  {
    const result = mdInput.toggleLinePrefix(field('|Aufstieg\nGipfel\nAbstieg|'),
      index => `${index + 1}. `);

    assert.equal(result.value, '1. Aufstieg\n2. Gipfel\n3. Abstieg');
  });

  test('lässt den Text außerhalb des Blocks unberührt', () =>
  {
    const state = field('Vorher\n|Mitte|\nNachher');

    const result = mdInput.toggleLinePrefix(state, '- ');

    assert.equal(result.value, 'Vorher\n- Mitte\nNachher');
  });
});

describe('insertLink', () =>
{
  test('macht aus der Auswahl den Verweistext und markiert die Adresse', () =>
  {
    const result = mdInput.insertLink(field('Zur |Hütte| gehen'));

    assert.equal(result.value, 'Zur [Hütte](https://) gehen');
    assert.equal(selectionOf(result), 'https://');
  });

  test('markiert ohne Auswahl den Platzhaltertext', () =>
  {
    const state = { value: '', selectionStart: 0, selectionEnd: 0 };

    const result = mdInput.insertLink(state, 'Text');

    assert.equal(result.value, '[Text](https://)');
    assert.equal(selectionOf(result), 'Text');
  });
});
