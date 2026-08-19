/* Testet public/js/dates.js — dieselbe Datei, die der Browser lädt. */
const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const url = require('url');

let dates;

before(async () =>
{
  const file = path.join(__dirname, '..', '..', 'public', 'js', 'dates.js');
  dates = await import(url.pathToFileURL(file).href);
});

describe('todayIso', () =>
{
  test('liefert das lokale Datum im ISO-Format', () =>
  {
    const now = new Date();
    const expected = `${now.getFullYear()}-`
      + `${String(now.getMonth() + 1).padStart(2, '0')}-`
      + `${String(now.getDate()).padStart(2, '0')}`;

    assert.equal(dates.todayIso(), expected);
  });

  test('nutzt nicht die UTC-Umrechnung', () =>
  {
    /* toISOString() würde abends in westlichen Zeitzonen schon den Folgetag
       liefern — der Termin „heute" wäre dann falsch einsortiert. */
    assert.equal(dates.todayIso(), dates.todayIso());
    assert.match(dates.todayIso(), /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('daysBetween', () =>
{
  test('zählt ganze Tage vorwärts', () =>
  {
    assert.equal(dates.daysBetween('2026-06-01', '2026-06-14'), 13);
  });

  test('zählt rückwärts negativ', () =>
  {
    assert.equal(dates.daysBetween('2026-06-14', '2026-06-01'), -13);
  });

  test('rechnet über Monats- und Jahresgrenzen', () =>
  {
    assert.equal(dates.daysBetween('2026-12-28', '2027-01-04'), 7);
  });

  test('rechnet über den 29. Februar eines Schaltjahres', () =>
  {
    assert.equal(dates.daysBetween('2028-02-28', '2028-03-01'), 2);
  });

  test('liefert null wenn ein Datum fehlt', () =>
  {
    assert.equal(dates.daysBetween(null, '2026-06-01'), null);
    assert.equal(dates.daysBetween('2026-06-01', null), null);
  });
});

describe('inclusiveDays', () =>
{
  test('zählt beide Endtage mit', () =>
  {
    // 3. bis 14. April sind zwölf Reisetage
    assert.equal(dates.inclusiveDays('2026-04-03', '2026-04-14'), 12);
  });

  test('ein Tagesausflug dauert einen Tag', () =>
  {
    assert.equal(dates.inclusiveDays('2026-04-03', '2026-04-03'), 1);
  });

  test('liefert null ohne vollständigen Zeitraum', () =>
  {
    assert.equal(dates.inclusiveDays('2026-04-03', null), null);
  });
});

describe('formatDate', () =>
{
  test('formatiert deutsch', () =>
  {
    assert.equal(dates.formatDate('2026-05-17'), '17.05.2026');
  });

  test('verschiebt den Tag nicht über die Zeitzone', () =>
  {
    /* new Date('2026-01-01').toLocaleDateString() läge westlich von Greenwich
       auf dem 31.12. — deshalb wird die Zeichenkette zerlegt statt geparst. */
    assert.equal(dates.formatDate('2026-01-01'), '01.01.2026');
  });

  test('liefert Leerstring ohne Datum', () =>
  {
    assert.equal(dates.formatDate(null), '');
  });
});

describe('relativeDateLabel', () =>
{
  const heute = '2026-06-14';

  test('benennt heute, morgen und gestern', () =>
  {
    assert.equal(dates.relativeDateLabel('2026-06-14', heute), 'heute');
    assert.equal(dates.relativeDateLabel('2026-06-15', heute), 'morgen');
    assert.equal(dates.relativeDateLabel('2026-06-13', heute), 'gestern');
  });

  test('zählt die nächsten zwei Wochen in Tagen', () =>
  {
    assert.equal(dates.relativeDateLabel('2026-06-19', heute), 'in 5 Tagen');
    assert.equal(dates.relativeDateLabel('2026-06-28', heute), 'in 14 Tagen');
  });

  test('zählt die letzten zwei Wochen rückwärts', () =>
  {
    assert.equal(dates.relativeDateLabel('2026-06-09', heute), 'vor 5 Tagen');
  });

  test('fällt darüber hinaus auf das Datum zurück', () =>
  {
    assert.equal(dates.relativeDateLabel('2026-07-01', heute), '01.07.2026');
    assert.equal(dates.relativeDateLabel('2026-05-01', heute), '01.05.2026');
  });

  test('liefert Leerstring ohne Datum', () =>
  {
    assert.equal(dates.relativeDateLabel(null, heute), '');
  });
});

describe('isPast', () =>
{
  test('erkennt vergangene Tage', () =>
  {
    assert.equal(dates.isPast('2026-06-13', '2026-06-14'), true);
  });

  test('heute ist nicht vergangen', () =>
  {
    assert.equal(dates.isPast('2026-06-14', '2026-06-14'), false);
  });

  test('ohne Datum nicht vergangen', () =>
  {
    assert.equal(dates.isPast(null, '2026-06-14'), false);
  });
});
