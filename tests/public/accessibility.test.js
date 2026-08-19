/* Ein Knopf, der nur ein Icon zeigt, hat für einen Screenreader keinen Namen —
   er wird als „Schaltfläche" vorgelesen. `title` allein genügt nicht: er ist ein
   Tooltip für die Maus und wird je nach Programm gar nicht ausgegeben.

   Dieser Test liest den Quelltext, weil die Knöpfe in Template-Zeichenketten
   entstehen und es ohne DOM keinen anderen Weg gibt. Er ist bewusst grob: er
   verlangt nur, dass ein Bedienelement mit `title` auch ein `aria-label` trägt. */
const { test, describe } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const JS_DIR = path.join(__dirname, '..', '..', 'public', 'js');
const MODAL_SOURCE = fs.readFileSync(path.join(JS_DIR, 'modal.js'), 'utf8');

function jsFiles(dir)
{
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry =>
  {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? jsFiles(full) : [full];
  }).filter(file => file.endsWith('.js'));
}

/* Öffnende <button>- und <a>-Tags, auch über mehrere Zeilen */
const CONTROL_TAG = /<(?:button|a)\b[^>]*?>/gs;

function controlsWithTitle()
{
  return jsFiles(JS_DIR).flatMap(file =>
  {
    const source = fs.readFileSync(file, 'utf8');

    return [...source.matchAll(CONTROL_TAG)]
      .filter(match => match[0].includes('title='))
      .map(match => ({
        file: path.relative(path.join(__dirname, '..', '..'), file),
        line: source.slice(0, match.index).split('\n').length,
        tag: match[0],
      }));
  });
}

describe('Namen für Bedienelemente', () =>
{
  test('jedes Element mit title trägt auch ein aria-label', () =>
  {
    const missing = controlsWithTitle()
      .filter(control => !control.tag.includes('aria-label'))
      .map(control => `${control.file}:${control.line}`);

    assert.deepEqual(missing, [],
      `Diese Bedienelemente haben nur einen title: ${missing.join(', ')}`);
  });

  test('es gibt überhaupt solche Elemente — der Test prüft also etwas', () =>
  {
    // Schutz gegen einen stillschweigend leeren Suchlauf
    assert.ok(controlsWithTitle().length > 20);
  });

  test('jeder Schließen-Knopf eines Modals hat einen Namen', () =>
  {
    const nameless = jsFiles(JS_DIR).flatMap(file =>
    {
      const source = fs.readFileSync(file, 'utf8');

      return [...source.matchAll(CONTROL_TAG)]
        .filter(match => match[0].includes('btn-modal-close')
          && !match[0].includes('aria-label'))
        .map(() => path.relative(path.join(__dirname, '..', '..'), file));
    });

    assert.deepEqual(nameless, []);
  });
});

describe('Markup ohne Inline-Styles', () =>
{
  test('kein style-Attribut im erzeugten Markup', () =>
  {
    /* Die CSP verbietet Inline-Styles (`style-src` ohne 'unsafe-inline'). Ein
       style-Attribut im Markup bliebe deshalb wirkungslos — der Fehler fällt im
       Browser erst auf, wenn ein Element falsch aussieht. Gestylt wird über
       Klassen in style.css; `element.style` aus JavaScript bleibt erlaubt. */
    const offenders = jsFiles(JS_DIR).flatMap(file =>
    {
      const source = fs.readFileSync(file, 'utf8');

      return [...source.matchAll(/style="/g)].map(match =>
        `${path.relative(path.join(__dirname, '..', '..'), file)}:`
        + `${source.slice(0, match.index).split('\n').length}`);
    });

    assert.deepEqual(offenders, [],
      `Inline-Styles gefunden: ${offenders.join(', ')}`);
  });
});

describe('Modals als Dialog', () =>
{
  test('jede Ebene ist ein Dialog mit aria-modal', () =>
  {
    assert.match(MODAL_SOURCE, /role="dialog" aria-modal="true"/);
  });

  test('der Dialog wird über seine Überschrift benannt', () =>
  {
    /* Ohne aria-labelledby liest ein Screenreader beim Öffnen nur „Dialog" vor,
       statt zu sagen, worum es geht. */
    assert.match(MODAL_SOURCE, /setAttribute\('aria-labelledby'/);
  });

  test('der Fokus wandert beim Öffnen in den Dialog', () =>
  {
    assert.match(MODAL_SOURCE, /function focusFirst/);
    assert.match(MODAL_SOURCE, /focusFirst\(dialog\)/);
  });

  test('der Tabulator bleibt in der obersten Ebene', () =>
  {
    /* Sonst läuft der Fokus hinter dem Overlay durch die Seite, während der
       Dialog offen ist — sichtbar ist er dann nirgends. */
    assert.match(MODAL_SOURCE, /function trapTab/);
    assert.match(MODAL_SOURCE, /e\.key === 'Tab'/);
  });

  test('der Fokus kehrt beim Schließen zum auslösenden Element zurück', () =>
  {
    assert.match(MODAL_SOURCE, /const trigger = document\.activeElement/);
    assert.match(MODAL_SOURCE, /entry\.trigger\?\.isConnected/);
  });
});
