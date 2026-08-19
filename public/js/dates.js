/* =====================================================
   Wegzeichen – dates.js
   Datumsrechnung und -formatierung. Wie geo.js bewusst frei von DOM und
   State, damit die Logik ohne Browser testbar bleibt.

   Zwei Sorten kommen hier vor, und sie dürfen nicht vermischt werden:

   - **Kalendertage** (`JJJJ-MM-TT`) — Besuchsdatum, geplanter Termin, Reisedaten.
     Keine Uhrzeit, keine Zeitzone. Damit wird durchgängig als Zeichenkette und
     über UTC-Mitternacht gerechnet: `new Date('2026-06-14')` läge in westlichen
     Zeitzonen sonst auf dem 13. Juni.
   - **Zeitpunkte** (`created_at`, `updated_at`) — echte Momente, für die `Date`
     das richtige Werkzeug ist. Sie kommen aus SQLite und brauchen beim Parsen
     eine Zeitzone, siehe `parseTimestamp()` unten.
   ===================================================== */

const MS_PER_DAY = 86400000;

function pad(value)
{
  return String(value).padStart(2, '0');
}

/* Heutiger Tag in lokaler Zeit. Nicht toISOString(): das rechnet nach UTC um
   und liefert abends im Sommer bereits den Folgetag. */
export function todayIso()
{
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function toUtcTime(isoDate)
{
  return Date.parse(`${isoDate}T00:00:00Z`);
}

/* Ganze Tage von `from` bis `to`; negativ, wenn `to` davor liegt */
export function daysBetween(from, to)
{
  if (!from || !to)
  {
    return null;
  }
  return Math.round((toUtcTime(to) - toUtcTime(from)) / MS_PER_DAY);
}

/* Dauer eines Zeitraums — beide Endtage zählen mit, ein Tagesausflug hat also
   die Dauer 1 */
export function inclusiveDays(start, end)
{
  const span = daysBetween(start, end);
  return span === null ? null : span + 1;
}

export function formatDate(isoDate)
{
  if (!isoDate)
  {
    return '';
  }
  const [year, month, day] = isoDate.split('-');
  return `${day}.${month}.${year}`;
}

/* Menschenlesbare Einordnung eines Termins. `today` ist überschreibbar, damit
   die Funktion ohne Bezug auf die Systemuhr testbar ist. */
export function relativeDateLabel(isoDate, today = todayIso())
{
  if (!isoDate)
  {
    return '';
  }
  const days = daysBetween(today, isoDate);

  if (days === 0)
  {
    return 'heute';
  }
  if (days === 1)
  {
    return 'morgen';
  }
  if (days === -1)
  {
    return 'gestern';
  }
  if (days > 1 && days <= 14)
  {
    return `in ${days} Tagen`;
  }
  if (days < -1 && days >= -14)
  {
    return `vor ${Math.abs(days)} Tagen`;
  }
  return formatDate(isoDate);
}

export function isPast(isoDate, today = todayIso())
{
  return !!isoDate && isoDate < today;
}

/* ── Zeitpunkte ────────────────────────────────────────────────────────────
   Ab hier geht es um echte Momente, nicht um Kalendertage. */

/* SQLite schreibt mit CURRENT_TIMESTAMP „JJJJ-MM-TT HH:MM:SS" — das ist UTC,
   trägt aber kein Kennzeichen. Eine solche Zeichenkette liest `new Date()` nach
   ECMAScript als *lokale* Zeit: eine gerade gespeicherte Notiz wäre in Berlin
   damit sofort zwei Stunden alt. Deshalb wird die Form vor dem Parsen zu
   ISO-UTC ergänzt.

   Der Ausdruck greift auch bei „T" als Trenner und bei Sekundenbruchteilen,
   ebenfalls ohne Zone — beides käme aus derselben Quelle und ist damit UTC.
   Zeichenketten, die schon eine Zone tragen (…Z, …+02:00), bleiben unberührt. */
const ZONELESS_TIMESTAMP = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)$/;

export function parseTimestamp(raw)
{
  if (!raw)
  {
    return null;
  }
  if (raw instanceof Date)
  {
    return Number.isNaN(raw.getTime()) ? null : raw;
  }

  const text = String(raw).trim();
  const zoneless = text.match(ZONELESS_TIMESTAMP);
  const parsed = new Date(zoneless ? `${zoneless[1]}T${zoneless[2]}Z` : text);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/* Abstand zu jetzt in Worten. Für alles, was älter als eine Woche ist, sagt ein
   Datum mehr als „vor 23 Tagen". */
export function timeAgo(raw)
{
  const date = parseTimestamp(raw);
  if (!date)
  {
    return '';
  }

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60)
  {
    return 'Gerade eben';
  }
  if (seconds < 3600)
  {
    return `vor ${Math.floor(seconds / 60)} Min.`;
  }
  if (seconds < 86400)
  {
    return `vor ${Math.floor(seconds / 3600)} Std.`;
  }
  if (seconds < 604800)
  {
    return `vor ${Math.floor(seconds / 86400)} Tagen`;
  }

  /* Aus den lokalen Bestandteilen, nicht über toISOString(): der Zeitpunkt soll
     als der Kalendertag erscheinen, an dem er hier stattgefunden hat. Gleiche
     Schreibweise wie formatDate() — `toLocaleDateString` liefert je nach
     Umgebung „20.7.2026" statt „20.07.2026". */
  return `${pad(date.getDate())}.${pad(date.getMonth() + 1)}.${date.getFullYear()}`;
}
