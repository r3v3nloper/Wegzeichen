/* =====================================================
   Wegzeichen – geo.js
   Entfernungen, Formatierung und Karten-Links.
   Bewusst frei von DOM- und State-Zugriffen: reine Funktionen,
   damit sie ohne Browser testbar sind.
   ===================================================== */

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees)
{
  return (degrees * Math.PI) / 180;
}

function hasCoords(point)
{
  return !!point
    && Number.isFinite(point.lat)
    && Number.isFinite(point.lng);
}

/* Luftlinie in Kilometern. Liefert null, sobald einem der Punkte
   Koordinaten fehlen — Aufrufer blenden die Entfernung dann aus. */
export function haversineKm(from, to)
{
  if (!hasCoords(from) || !hasCoords(to))
  {
    return null;
  }

  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.lat);

  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

/* Unter einem Kilometer in Metern, darunter grob genug für eine Luftlinie */
export function formatDistance(km)
{
  if (km === null || km === undefined || !Number.isFinite(km))
  {
    return '';
  }
  if (km < 1)
  {
    return `${Math.round(km * 1000)} m`;
  }
  if (km < 10)
  {
    return `${km.toFixed(1).replace('.', ',')} km`;
  }
  return `${Math.round(km).toLocaleString('de-DE')} km`;
}

/* Ergänzt jeden Eintrag um `distanceKm` relativ zum Bezugspunkt.
   Ohne Bezugspunkt bleibt das Feld null, statt die Liste zu verändern. */
export function withDistances(items, origin)
{
  return items.map(item => ({
    ...item,
    distanceKm: haversineKm(origin, item),
  }));
}

/* Google-Maps-Deep-Link zur Navigation. Öffnet auf Android direkt die
   Maps-App und braucht keinen API-Key. */
export function mapsDirectionsUrl(target)
{
  if (hasCoords(target))
  {
    return `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}`;
  }
  const query = [target?.name, target?.address].filter(Boolean).join(' ');
  if (!query)
  {
    return null;
  }
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
}

/* Google-Maps-Suchlink — zeigt den Ort an statt sofort zu navigieren */
export function mapsSearchUrl(target)
{
  if (hasCoords(target))
  {
    return `https://www.google.com/maps/search/?api=1&query=${target.lat},${target.lng}`;
  }
  const query = [target?.name, target?.address].filter(Boolean).join(' ');
  if (!query)
  {
    return null;
  }
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

/* Gruppiert nach Ländercode. `nameOf` liefert den Anzeigenamen zu einem Code,
   damit diese Datei keine Länderliste kennen muss.
   Einträge ohne Land landen in einer Gruppe am Ende. */
export function groupByCountry(items, nameOf)
{
  const groups = new Map();
  items.forEach(item =>
  {
    const code = item.country || '';
    if (!groups.has(code))
    {
      groups.set(code, []);
    }
    groups.get(code).push(item);
  });

  return [...groups.entries()]
    .map(([code, groupItems]) => ({
      code,
      name: code ? (nameOf(code) || code) : 'Ohne Land',
      items: groupItems,
    }))
    .sort((a, b) =>
    {
      if (!a.code)
      {
        return 1;
      }
      if (!b.code)
      {
        return -1;
      }
      return a.name.localeCompare(b.name, 'de');
    });
}

/* Sortierungen für Listen. Einträge ohne den jeweiligen Wert wandern nach
   hinten, statt die Sortierung durch null-Werte zu verfälschen. */
export const SORTERS = {
  name: (a, b) => a.name.localeCompare(b.name, 'de'),
  distance: (a, b) => nullsLast(a.distanceKm, b.distanceKm, (x, y) => x - y),
  rating: (a, b) => nullsLast(a.rating, b.rating, (x, y) => y - x),
  created: (a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')),
  // Der nächste Termin zuerst; ISO-Daten lassen sich als Text vergleichen
  planned: (a, b) => nullsLast(a.planned_at, b.planned_at, (x, y) => x.localeCompare(y)),
};

function nullsLast(a, b, compare)
{
  const aMissing = a === null || a === undefined;
  const bMissing = b === null || b === undefined;
  if (aMissing && bMissing)
  {
    return 0;
  }
  if (aMissing)
  {
    return 1;
  }
  if (bMissing)
  {
    return -1;
  }
  return compare(a, b);
}

export function sortItems(items, sortKey)
{
  const sorter = SORTERS[sortKey] || SORTERS.name;
  return [...items].sort(sorter);
}
