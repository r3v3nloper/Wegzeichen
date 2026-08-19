/* Zugriff auf Nominatim (OpenStreetMap-Geocoding).

   Läuft absichtlich serverseitig und nicht im Browser:
   - Nominatims Nutzungsbedingungen verlangen einen identifizierenden User-Agent,
     den ein Browser nicht setzen darf
   - höchstens ein Request pro Sekunde, was nur zentral durchsetzbar ist
   - die Content-Security-Policy der App bleibt dadurch auf 'self' */

const ENDPOINT = 'https://nominatim.openstreetmap.org/search';
const MIN_INTERVAL_MS = 1100;
const REQUEST_TIMEOUT_MS = 8000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const CACHE_MAX_ENTRIES = 500;
const RESULT_LIMIT = 6;

class GeocodingUnavailableError extends Error
{
  constructor(message)
  {
    super(message);
    this.name = 'GeocodingUnavailableError';
  }
}

const cache = new Map();

/* Serialisiert alle Aufrufe und hält den Mindestabstand ein. Jeder neue
   Aufruf hängt sich an die laufende Kette, statt parallel zu starten. */
let queueTail = Promise.resolve();
let lastRequestAt = 0;

function schedule(task)
{
  const run = queueTail.then(async () =>
  {
    const waitMs = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (waitMs > 0)
    {
      await new Promise(resolve => setTimeout(resolve, waitMs));
    }
    lastRequestAt = Date.now();
    return task();
  });

  // Fehler dürfen die Kette nicht abreißen lassen
  queueTail = run.then(() => undefined, () => undefined);
  return run;
}

function readCache(key)
{
  const hit = cache.get(key);
  if (!hit)
  {
    return null;
  }
  if (Date.now() - hit.storedAt > CACHE_TTL_MS)
  {
    cache.delete(key);
    return null;
  }
  return hit.results;
}

function writeCache(key, results)
{
  if (cache.size >= CACHE_MAX_ENTRIES)
  {
    // Ältester Eintrag zuerst — Map bewahrt die Einfügereihenfolge
    cache.delete(cache.keys().next().value);
  }
  cache.set(key, { storedAt: Date.now(), results });
}

function toResult(entry)
{
  const address = entry.address || {};
  const code = (address.country_code || '').toUpperCase();
  return {
    label: entry.display_name,
    lat: Number(entry.lat),
    lng: Number(entry.lon),
    country: code || null,
    region: address.city || address.town || address.village || address.county || null,
  };
}

async function search(query, userAgent)
{
  if (!userAgent)
  {
    throw new GeocodingUnavailableError(
      'Adresssuche ist nicht konfiguriert (NOMINATIM_USER_AGENT fehlt)'
    );
  }

  const key = query.toLowerCase();
  const cached = readCache(key);
  if (cached)
  {
    return cached;
  }

  const url = `${ENDPOINT}?${new URLSearchParams({
    q: query,
    format: 'jsonv2',
    limit: String(RESULT_LIMIT),
    addressdetails: '1',
    'accept-language': 'de',
  })}`;

  const results = await schedule(async () =>
  {
    let response;
    try
    {
      response = await fetch(url, {
        headers: { 'User-Agent': userAgent, 'Accept': 'application/json' },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    }
    catch
    {
      throw new GeocodingUnavailableError('Adresssuche ist derzeit nicht erreichbar');
    }

    if (!response.ok)
    {
      throw new GeocodingUnavailableError('Adresssuche ist derzeit nicht erreichbar');
    }

    const body = await response.json().catch(() =>
    {
      throw new GeocodingUnavailableError('Adresssuche lieferte eine unerwartete Antwort');
    });

    return Array.isArray(body) ? body.map(toResult) : [];
  });

  writeCache(key, results);
  return results;
}

module.exports = { search, GeocodingUnavailableError };
