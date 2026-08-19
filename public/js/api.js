/* =====================================================
   Wegzeichen – api.js
   Alle HTTP-Aufrufe zum Backend (ES-Modul)
   ===================================================== */

export const TOKEN_KEY = 'wegzeichen_token';

/* Der Service Worker markiert Antworten, die er aus dem Cache bedient hat.
   Ohne diesen Hinweis wären veraltete Daten von frischen nicht zu unterscheiden. */
export const OFFLINE_HEADER = 'X-Wegzeichen-Offline';

/* Muss mit API_CACHE in public/sw.js übereinstimmen — ein Service Worker kann
   keine ES-Module importieren. tests/public/sw.test.js prüft die Gleichheit. */
export const API_CACHE_NAME = 'wegzeichen-api-v1';

let cacheListener = null;

export function setCacheListener(fn)
{
  cacheListener = fn;
}

/* Der Cache-Schlüssel ist die URL und enthält den Token nicht. Ohne Leeren
   bei jedem Kontowechsel würde ein zweiter Nutzer offline die Daten des
   ersten sehen. */
export async function clearApiCache()
{
  if (typeof caches === 'undefined')
  {
    return;
  }
  try
  {
    await caches.delete(API_CACHE_NAME);
  }
  catch
  {
    // Ohne CacheStorage gibt es auch nichts zu leeren
  }
}

export const API = (() =>
{
  const BASE = '/api';

  function getToken()
  {
    return localStorage.getItem(TOKEN_KEY);
  }

  function authHeaders(extra)
  {
    const headers = { ...extra };
    const token = getToken();
    if (token)
    {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  /* Baut den Fehler, den die Views auswerten. `offline` unterscheidet
     „Server hat abgelehnt" von „gar keine Verbindung" — nur im zweiten Fall
     darf die UI behaupten, es sei nichts gespeichert worden. */
  function toError(message, status, offline)
  {
    const err = new Error(message);
    err.status = status;
    err.offline = !!offline;
    return err;
  }

  async function send(method, path, body, extraHeaders)
  {
    const opts = { method, headers: authHeaders(extraHeaders) };
    if (body !== undefined)
    {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }

    let res;
    try
    {
      res = await fetch(BASE + path, opts);
    }
    catch
    {
      // Netzwerkfehler ohne Service-Worker-Antwort
      throw toError('Keine Verbindung zum Server', 0, true);
    }

    if (cacheListener)
    {
      cacheListener(res.headers.get(OFFLINE_HEADER) === '1');
    }

    let data = null;
    try
    {
      data = await res.json();
    }
    catch
    {
      // Antwort ohne JSON-Body
    }

    if (!res.ok)
    {
      throw toError(data?.error || `HTTP ${res.status}`, res.status, data?.offline);
    }
    return data;
  }

  const req = (method, path, body) => send(method, path, body);

  /* Lädt eine Datei als Blob — nötig weil der Download den Authorization-Header
     braucht, den ein einfacher <a href> nicht mitsenden kann. */
  async function fetchBlob(path)
  {
    let res;
    try
    {
      res = await fetch(BASE + path, { headers: authHeaders() });
    }
    catch
    {
      throw toError('Keine Verbindung zum Server', 0, true);
    }
    if (!res.ok)
    {
      const data = await res.json().catch(() => null);
      throw toError(data?.error || 'Anhang konnte nicht geladen werden', res.status, data?.offline);
    }
    return res.blob();
  }

  async function sendFiles(path, files)
  {
    const form = new FormData();
    [...files].forEach(f => form.append('files', f));

    let res;
    try
    {
      // Content-Type absichtlich nicht setzen — der Browser ergänzt die Boundary
      res = await fetch(BASE + path, { method: 'POST', headers: authHeaders(), body: form });
    }
    catch
    {
      throw toError('Keine Verbindung zum Server', 0, true);
    }

    const data = await res.json().catch(() => null);
    if (!res.ok)
    {
      throw toError(data?.error || `HTTP ${res.status}`, res.status, data?.offline);
    }
    return data;
  }

  function query(params)
  {
    const entries = Object.entries(params).filter(([, val]) =>
      val !== undefined && val !== null && val !== '' && val !== 'all');
    return entries.length
      ? `?${entries.map(([k, val]) => `${k}=${encodeURIComponent(val)}`).join('&')}`
      : '';
  }

  return {
    auth: {
      register: (username, email, password) =>
        req('POST', '/auth/register', { username, email, password }),
      login: (email, password) => req('POST', '/auth/login', { email, password }),
      me: () => req('GET', '/auth/me'),
      updateProfile: data => req('PUT', '/auth/profile', data),
    },

    users: {
      setHome: (label, lat, lng) => req('PUT', '/users/home', { label, lat, lng }),
    },

    meta: {
      countries: () => req('GET', '/meta/countries'),
    },

    noteFolders: {
      getAll: () => req('GET', '/note-folders'),
      create: name => req('POST', '/note-folders', { name }),
      rename: (id, name) => req('PUT', `/note-folders/${id}`, { name }),
      remove: id => req('DELETE', `/note-folders/${id}`),
    },

    notes: {
      getAll: (q, folder) => req('GET', `/notes${query({ q, folder })}`),
      get: id => req('GET', `/notes/${id}`),
      create: data => req('POST', '/notes', data),
      update: (id, data) => req('PUT', `/notes/${id}`, data),
      /* Nur das Kennzeichen. Der ganze Datensatz zurückzuschicken wäre riskant:
         käme die Liste aus dem Offline-Cache, würde der neuere Serverstand
         überschrieben. */
      setFavorite: (id, isFavorite) =>
        req('PUT', `/notes/${id}/favorite`, { is_favorite: isFavorite }),
      remove: id => req('DELETE', `/notes/${id}`),
    },

    attachments: {
      upload: (noteId, files) => sendFiles(`/notes/${noteId}/attachments`, files),
      remove: (noteId, attachmentId) =>
        req('DELETE', `/notes/${noteId}/attachments/${attachmentId}`),
      download: (noteId, attachmentId) =>
        fetchBlob(`/notes/${noteId}/attachments/${attachmentId}/file`),
    },

    spots: {
      getAll: (kind, filters = {}) => req('GET', `/spots${query({ kind, ...filters })}`),
      get: id => req('GET', `/spots/${id}`),
      create: data => req('POST', '/spots', data),
      update: (id, data) => req('PUT', `/spots/${id}`, data),
      setFavorite: (id, isFavorite) =>
        req('PUT', `/spots/${id}/favorite`, { is_favorite: isFavorite }),
      remove: id => req('DELETE', `/spots/${id}`),
    },

    trips: {
      getAll: () => req('GET', '/trips'),
      get: id => req('GET', `/trips/${id}`),
      create: data => req('POST', '/trips', data),
      update: (id, data) => req('PUT', `/trips/${id}`, data),
      setFavorite: (id, isFavorite) =>
        req('PUT', `/trips/${id}/favorite`, { is_favorite: isFavorite }),
      remove: id => req('DELETE', `/trips/${id}`),
    },

    geo: {
      search: q => req('GET', `/geo/search${query({ q })}`),
    },

    search: {
      all: q => req('GET', `/search${query({ q })}`),
    },

    admin: {
      getUsers: () => req('GET', '/admin/users'),
      deleteUser: id => req('DELETE', `/admin/users/${id}`),
      changePassword: (id, password) => req('PUT', `/admin/users/${id}/password`, { password }),
    },
  };
})();
