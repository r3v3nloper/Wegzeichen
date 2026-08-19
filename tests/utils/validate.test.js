const { test, describe } = require('node:test');
const assert = require('node:assert');
const v = require('../../utils/validate');

function assertRejects(fn, pattern)
{
  assert.throws(fn, err =>
    err instanceof v.ValidationError && (!pattern || pattern.test(err.message)));
}

describe('requiredText', () =>
{
  test('trimmt und liefert den Text', () =>
  {
    assert.equal(v.requiredText('  Hallo  ', 'Titel', 10), 'Hallo');
  });

  test('lehnt Leerstring und Whitespace ab', () =>
  {
    assertRejects(() => v.requiredText('', 'Titel', 10), /erforderlich/);
    assertRejects(() => v.requiredText('   ', 'Titel', 10), /erforderlich/);
    assertRejects(() => v.requiredText(undefined, 'Titel', 10), /erforderlich/);
  });

  test('lehnt zu langen Text ab', () =>
  {
    assertRejects(() => v.requiredText('abcdef', 'Titel', 5), /maximal 5/);
  });
});

describe('optionalText', () =>
{
  test('macht aus Leerwerten null', () =>
  {
    assert.equal(v.optionalText('', 'Feld', 10), null);
    assert.equal(v.optionalText(null, 'Feld', 10), null);
    assert.equal(v.optionalText(undefined, 'Feld', 10), null);
  });
});

describe('optionalInt', () =>
{
  test('akzeptiert Zahlen im Bereich', () =>
  {
    assert.equal(v.optionalInt('42', 'Wert', 0, 100), 42);
    assert.equal(v.optionalInt(0, 'Wert', 0, 100), 0);
  });

  test('lehnt Kommazahlen ab', () =>
  {
    assertRejects(() => v.optionalInt('4.5', 'Wert', 0, 100), /ganze Zahl/);
  });

  test('lehnt Werte außerhalb des Bereichs ab', () =>
  {
    assertRejects(() => v.optionalInt('101', 'Wert', 0, 100), /zwischen 0 und 100/);
    assertRejects(() => v.optionalInt('-1', 'Wert', 0, 100), /zwischen 0 und 100/);
  });

  test('lehnt Text ab', () =>
  {
    assertRejects(() => v.optionalInt('viele', 'Wert', 0, 100));
  });
});

describe('rating', () =>
{
  test('akzeptiert 1 bis 5', () =>
  {
    assert.equal(v.rating(1), 1);
    assert.equal(v.rating(5), 5);
  });

  test('lehnt 0 und 6 ab', () =>
  {
    assertRejects(() => v.rating(0));
    assertRejects(() => v.rating(6));
  });

  test('leer bedeutet keine Bewertung', () =>
  {
    assert.equal(v.rating(null), null);
    assert.equal(v.rating(''), null);
  });
});

describe('coordinates', () =>
{
  test('akzeptiert ein vollständiges Paar', () =>
  {
    assert.deepEqual(v.coordinates(51.2, 6.8), { lat: 51.2, lng: 6.8 });
  });

  test('akzeptiert Nullkoordinaten', () =>
  {
    assert.deepEqual(v.coordinates(0, 0), { lat: 0, lng: 0 });
  });

  test('liefert ein leeres Paar wenn beides fehlt', () =>
  {
    assert.deepEqual(v.coordinates(null, null), { lat: null, lng: null });
  });

  test('lehnt ein halbes Paar ab', () =>
  {
    assertRejects(() => v.coordinates(51.2, null), /zusammen/);
    assertRejects(() => v.coordinates(null, 6.8), /zusammen/);
  });

  test('lehnt Werte außerhalb der Erdkugel ab', () =>
  {
    assertRejects(() => v.coordinates(91, 0), /Breitengrad/);
    assertRejects(() => v.coordinates(0, 181), /Längengrad/);
  });
});

describe('countryCode', () =>
{
  test('normalisiert auf Großbuchstaben', () =>
  {
    assert.equal(v.countryCode('de'), 'DE');
  });

  test('lehnt unbekannte Codes ab', () =>
  {
    assertRejects(() => v.countryCode('XX'), /Unbekanntes Land/);
    assertRejects(() => v.countryCode('DEU'), /Unbekanntes Land/);
  });

  test('lehnt Zusammenschlüsse wie die EU ab', () =>
  {
    assertRejects(() => v.countryCode('EU'), /Unbekanntes Land/);
  });
});

describe('optionalIsoDate', () =>
{
  test('akzeptiert ein gültiges Datum', () =>
  {
    assert.equal(v.optionalIsoDate('2026-05-17', 'Datum'), '2026-05-17');
  });

  test('lehnt ein falsches Format ab', () =>
  {
    assertRejects(() => v.optionalIsoDate('17.05.2026', 'Datum'), /JJJJ-MM-TT/);
  });

  test('lehnt Scheindaten ab, die dem Muster entsprechen', () =>
  {
    assertRejects(() => v.optionalIsoDate('2026-02-31', 'Datum'), /kein gültiges Datum/);
    assertRejects(() => v.optionalIsoDate('2026-13-01', 'Datum'), /kein gültiges Datum/);
  });
});

describe('optionalUrl', () =>
{
  test('akzeptiert http und https', () =>
  {
    assert.equal(v.optionalUrl('https://example.com/a', 'Link', 100),
      'https://example.com/a');
  });

  test('lehnt javascript: ab', () =>
  {
    assertRejects(() => v.optionalUrl('javascript:alert(1)', 'Link', 100),
      /http:\/\/ oder https:\/\//);
  });

  test('lehnt data: ab', () =>
  {
    assertRejects(() => v.optionalUrl('data:text/html,<script>', 'Link', 100));
  });

  test('lehnt Text ohne Schema ab', () =>
  {
    assertRejects(() => v.optionalUrl('example.com', 'Link', 100), /gültige URL/);
  });
});

describe('enumValue', () =>
{
  test('akzeptiert erlaubte Werte', () =>
  {
    assert.equal(v.enumValue('trail', ['trail', 'place'], 'Art'), 'trail');
  });

  test('nutzt den Vorgabewert bei leerer Eingabe', () =>
  {
    assert.equal(v.enumValue('', ['a', 'b'], 'Feld', 'a'), 'a');
  });

  test('verlangt einen Wert wenn es keinen Vorgabewert gibt', () =>
  {
    assertRejects(() => v.enumValue('', ['a', 'b'], 'Feld'), /erforderlich/);
  });

  test('lehnt unbekannte Werte ab', () =>
  {
    assertRejects(() => v.enumValue('c', ['a', 'b'], 'Feld'), /a, b/);
  });
});

describe('boolFlag', () =>
{
  test('erkennt wahre Werte', () =>
  {
    [true, 1, '1', 'true'].forEach(val => assert.equal(v.boolFlag(val), 1));
  });

  test('alles andere ist falsch', () =>
  {
    [false, 0, '0', 'false', null, undefined, 'ja'].forEach(val =>
      assert.equal(v.boolFlag(val), 0));
  });
});

describe('parseIdParam', () =>
{
  test('akzeptiert positive Ganzzahlen', () =>
  {
    assert.equal(v.parseIdParam('7'), 7);
  });

  test('liefert null für alles andere', () =>
  {
    ['0', '-3', 'abc', '1.5', '', undefined].forEach(val =>
      assert.equal(v.parseIdParam(val), null));
  });
});
