/* =====================================================
   Wegzeichen – sw.js

   Offline-Strategie:
   - statische Dateien: stale-while-revalidate
   - lesende API-Aufrufe: network-first, Antwort in den Cache, offline daraus
     bedienen (markiert mit X-Wegzeichen-Offline)
   - schreibende API-Aufrufe: nur Netz. Offline gibt es einen 503 mit
     offline-Flag, damit die App sagen kann dass nichts gespeichert wurde.
   - Kartentiles von OpenStreetMap werden NICHT gecacht: deren Tile-Policy
     verbietet Vorab-Caching. Offline fehlt der Kartenhintergrund, die Daten
     und Entfernungen sind trotzdem vollständig da.
   ===================================================== */

const STATIC_CACHE = 'wegzeichen-static-v2';
const API_CACHE = 'wegzeichen-api-v1';
const OFFLINE_HEADER = 'X-Wegzeichen-Offline';

/* ignoreVary ist hier Pflicht, nicht Bequemlichkeit: die cors-Middleware setzt
   auf jede Antwort `Vary: Origin`. Ohne dieses Flag vergleicht caches.match die
   Anfrage-Header mit denen der gespeicherten Anfrage und findet nichts, sobald
   sie sich unterscheiden — offline würden dann JS-Module als index.html
   ausgeliefert und die App wäre nicht mehr startfähig. */
const MATCH_OPTIONS = { ignoreVary: true };

const STATIC = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.svg',
  '/icons/icon.svg',
  '/css/style.css',
  '/vendor/leaflet/leaflet.css',
  '/vendor/leaflet/leaflet.js',
  '/vendor/leaflet/images/marker-icon.png',
  '/vendor/leaflet/images/marker-icon-2x.png',
  '/vendor/leaflet/images/marker-shadow.png',
  '/vendor/marked/marked.esm.js',
  '/vendor/dompurify/purify.es.mjs',
  '/js/main.js',
  '/js/api.js',
  '/js/state.js',
  '/js/dom.js',
  '/js/icons.js',
  '/js/modal.js',
  '/js/shell.js',
  '/js/router.js',
  '/js/geo.js',
  '/js/dates.js',
  '/js/map.js',
  '/js/markdown.js',
  '/js/markdown-input.js',
  '/js/markdown-editor.js',
  '/js/attachments.js',
  '/js/views/auth.js',
  '/js/views/home.js',
  '/js/views/notes.js',
  '/js/views/note.js',
  '/js/views/entryActions.js',
  '/js/views/spots.js',
  '/js/views/trips.js',
  '/js/views/profile.js',
  '/js/views/admin.js',
  '/js/views/partials.js',
  '/js/modals/note.js',
  '/js/modals/folders.js',
  '/js/modals/spot.js',
  '/js/modals/trip.js',
  '/js/modals/location-picker.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
];

self.addEventListener('install', e =>
{
  e.waitUntil(
    caches.open(STATIC_CACHE)
      .then(c => c.addAll(STATIC))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e =>
{
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== STATIC_CACHE && k !== API_CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function offlineJson(message)
{
  return new Response(JSON.stringify({ error: message, offline: true }), {
    status: 503,
    headers: { 'Content-Type': 'application/json' },
  });
}

/* Kopiert eine Cache-Antwort und setzt das Offline-Kennzeichen. Headers einer
   fertigen Response sind unveränderlich, deshalb der Neuaufbau. */
async function markAsCached(response)
{
  const headers = new Headers(response.headers);
  headers.set(OFFLINE_HEADER, '1');
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleApiRead(request)
{
  try
  {
    const response = await fetch(request);
    if (response.ok)
    {
      const cache = await caches.open(API_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  }
  catch
  {
    const cached = await caches.match(request, { cacheName: API_CACHE, ...MATCH_OPTIONS });
    if (cached)
    {
      return markAsCached(cached);
    }
    return offlineJson('Offline und keine gespeicherten Daten vorhanden');
  }
}

async function handleApiWrite(request)
{
  try
  {
    return await fetch(request);
  }
  catch
  {
    return offlineJson('Offline — Änderung wurde nicht gespeichert');
  }
}

async function handleStatic(request)
{
  const cached = await caches.match(request, { cacheName: STATIC_CACHE, ...MATCH_OPTIONS });

  const fromNetwork = fetch(request).then(res =>
  {
    if (res && res.status === 200 && res.type === 'basic')
    {
      const clone = res.clone();
      caches.open(STATIC_CACHE).then(c => c.put(request, clone));
    }
    return res;
  });

  if (cached)
  {
    // Aktualisierung im Hintergrund, damit Deployments ohne Versionssprung ankommen
    fromNetwork.catch(() => {});
    return cached;
  }

  try
  {
    return await fromNetwork;
  }
  catch
  {
    /* Nur Navigationen dürfen auf die Shell zurückfallen. Ein Skript oder
       Stylesheet, das stattdessen HTML bekäme, würde die App mit einem
       irreführenden MIME-Fehler abwürgen statt sauber zu scheitern. */
    if (request.mode === 'navigate')
    {
      const shell = await caches.match('/index.html',
        { cacheName: STATIC_CACHE, ...MATCH_OPTIONS });
      if (shell)
      {
        return shell;
      }
    }
    return new Response('Offline', { status: 503, statusText: 'Offline' });
  }
}

self.addEventListener('fetch', e =>
{
  const url = new URL(e.request.url);

  /* Fremde Hosts (Kartentiles, Font-Dateien) nicht abfangen — der Browser lädt
     sie direkt unter der Seiten-CSP. Ausnahme: beim Install vorgecachte URLs. */
  if (url.origin !== self.location.origin)
  {
    if (STATIC.includes(e.request.url))
    {
      e.respondWith(caches.match(e.request, MATCH_OPTIONS)
        .then(cached => cached || fetch(e.request)));
    }
    return;
  }

  if (url.pathname.startsWith('/api/'))
  {
    e.respondWith(e.request.method === 'GET'
      ? handleApiRead(e.request)
      : handleApiWrite(e.request));
    return;
  }

  e.respondWith(handleStatic(e.request));
});
