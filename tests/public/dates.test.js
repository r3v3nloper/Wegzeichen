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

/* ── Zeitpunkte ─────────────────────────────────────────────────────────────
   Der Fehler, um den es hier geht: SQLite schreibt „JJJJ-MM-TT HH:MM:SS" in UTC,
   aber ohne Kennzeichen. `new Date()` liest das als lokale Zeit — eine frisch
   gespeicherte Notiz war in Berlin damit sofort „vor 2 Std." alt.

   Die Tests laufen absichtlich unabhängig von der Zeitzone des Rechners: sie
   vergleichen gegen `toISOString()` beziehungsweise bauen den Zeitstempel aus
   dem aktuellen Moment. */

/* Zeitstempel in der Form, die SQLite liefert */
function sqliteTimestamp(date)
{
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

describe('parseTimestamp', () =>
{
  test('liest die Form von SQLite als UTC', () =>
  {
    const parsed = dates.parseTimestamp('2026-08-19 07:00:00');

    assert.equal(parsed.toISOString(), '2026-08-19T07:00:00.000Z');
  });

  test('nimmt auch T als Trenner und Sekundenbruchteile', () =>
  {
    assert.equal(dates.parseTimestamp('2026-08-19T07:00:00').toISOString(),
      '2026-08-19T07:00:00.000Z');
    assert.equal(dates.parseTimestamp('2026-08-19 07:00:00.250').toISOString(),
      '2026-08-19T07:00:00.250Z');
    assert.equal(dates.parseTimestamp('2026-08-19 07:00').toISOString(),
      '2026-08-19T07:00:00.000Z');
  });

  test('lässt einen Zeitstempel mit Zone unverändert', () =>
  {
    /* Wer schon eine Zone mitschickt, meint sie auch — hier darf nichts
       nachträglich zu UTC erklärt werden. */
    assert.equal(dates.parseTimestamp('2026-08-19T07:00:00Z').toISOString(),
      '2026-08-19T07:00:00.000Z');
    assert.equal(dates.parseTimestamp('2026-08-19T09:00:00+02:00').toISOString(),
      '2026-08-19T07:00:00.000Z');
  });

  test('nimmt ein Date-Objekt unverändert an', () =>
  {
    const date = new Date('2026-08-19T07:00:00Z');

    assert.equal(dates.parseTimestamp(date), date);
  });

  test('liefert null für Leerwerte und Unsinn', () =>
  {
    [null, undefined, '', '   ', 'irgendwas', '2026-13-45 99:99:99']
      .forEach(raw => assert.equal(dates.parseTimestamp(raw), null, String(raw)));
  });
});

describe('timeAgo', () =>
{
  test('ein gerade gespeicherter Eintrag ist „Gerade eben"', () =>
  {
    /* Genau der gemeldete Fehler: vorher stand hier „vor 2 Std." — und zwar
       abhängig von der Zeitzone, in Berlin im Sommer zwei Stunden. */
    assert.equal(dates.timeAgo(sqliteTimestamp(new Date())), 'Gerade eben');
  });

  test('zählt Minuten, Stunden und Tage', () =>
  {
    const vor = minutes => sqliteTimestamp(new Date(Date.now() - minutes * 60000));

    assert.equal(dates.timeAgo(vor(30)), 'vor 30 Min.');
    assert.equal(dates.timeAgo(vor(3 * 60)), 'vor 3 Std.');
    assert.equal(dates.timeAgo(vor(2 * 24 * 60)), 'vor 2 Tagen');
  });

  test('zeigt ab einer Woche das Datum, geschrieben wie formatDate', () =>
  {
    const vor30Tagen = new Date(Date.now() - 30 * 86400000);

    const label = dates.timeAgo(sqliteTimestamp(vor30Tagen));

    // Zweistellig wie überall sonst in der App: 20.07.2026, nicht 20.7.2026
    assert.match(label, /^\d{2}\.\d{2}\.\d{4}$/);
  });

  test('nennt beim Datum den lokalen Kalendertag', () =>
  {
    /* Ein Zeitpunkt kurz nach lokaler Mitternacht gehört zum neuen Tag — auch
       wenn er in UTC noch zum vorherigen zählt. */
    const now = new Date();
    const lokal = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 30);
    const vorLangem = new Date(lokal.getTime() - 30 * 86400000);
    const erwartet = `${String(vorLangem.getDate()).padStart(2, '0')}.`
      + `${String(vorLangem.getMonth() + 1).padStart(2, '0')}.${vorLangem.getFullYear()}`;

    assert.equal(dates.timeAgo(sqliteTimestamp(vorLangem)), erwartet);
  });

  test('eine Uhrzeit knapp in der Zukunft gilt als jetzt', () =>
  {
    // Kleine Abweichungen zwischen Server- und Geräteuhr sollen nichts kaputtmachen
    assert.equal(dates.timeAgo(sqliteTimestamp(new Date(Date.now() + 5000))), 'Gerade eben');
  });

  test('liefert Leerstring ohne Zeitstempel', () =>
  {
    assert.equal(dates.timeAgo(null), '');
    assert.equal(dates.timeAgo(''), '');
    assert.equal(dates.timeAgo('kaputt'), '');
  });
});
