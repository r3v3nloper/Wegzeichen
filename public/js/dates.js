/* =====================================================
   Wegzeichen – dates.js
   Datumsrechnung und -formatierung. Wie geo.js bewusst frei von DOM und
   State, damit die Logik ohne Browser testbar bleibt.

   Alle Daten sind reine Kalendertage im Format JJJJ-MM-TT — keine Uhrzeiten,
   keine Zeitzonen. Deshalb wird durchgängig mit Zeichenketten und UTC-Mitternacht
   gerechnet: `new Date('2026-06-14')` läge in westlichen Zeitzonen sonst auf dem
   13. Juni.
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
