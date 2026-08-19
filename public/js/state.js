/* =====================================================
   Wegzeichen – state.js
   Zentraler, veränderlicher App-State (Single Source of Truth)
   ===================================================== */

/* Filterzustand pro Spot-Art. Wanderwege und Orte teilen das Datenmodell,
   sollen aber unabhängig voneinander gefiltert werden können. */
function emptySpotFilter()
{
  return {
    q: '',
    country: 'all',
    status: 'all',
    sort: 'name',
    view: 'list',
  };
}

/* Profil und Länderliste liegen zusätzlich im localStorage.

   Grund: beim allerersten Seitenaufruf kontrolliert ein frisch installierter
   Service Worker die Seite noch nicht, `/api/auth/me` landet also nicht in
   seinem Cache. Ohne diesen Rückfall würde der nächste Start ohne Netz auf dem
   Login landen, obwohl der Token gültig ist. */
const USER_KEY = 'wegzeichen_user';
const COUNTRIES_KEY = 'wegzeichen_countries';

function readJson(key)
{
  try
  {
    return JSON.parse(localStorage.getItem(key)) || null;
  }
  catch
  {
    return null;
  }
}

export function rememberSession(user, countries)
{
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  if (countries?.length)
  {
    localStorage.setItem(COUNTRIES_KEY, JSON.stringify(countries));
  }
}

export function lastKnownUser()
{
  return readJson(USER_KEY);
}

export function lastKnownCountries()
{
  return readJson(COUNTRIES_KEY) || [];
}

export function forgetSession()
{
  localStorage.removeItem(USER_KEY);
  localStorage.removeItem(COUNTRIES_KEY);
}

export const S = {
  user: null,
  token: localStorage.getItem('wegzeichen_token'),
  view: 'home',

  /* Ländercodes mit deutschem Namen, einmal vom Server geladen */
  countries: [],

  notes: [],
  noteQuery: '',
  noteFolders: [],
  /* Zahlen für die Filter „Alle" und „Ohne Ordner" — aus der gefilterten
     Notizliste nicht ableitbar, deshalb vom Server */
  noteCounts: { total: 0, unfiled: 0 },
  /* 'all' | 'none' | Ordner-ID */
  noteFolder: 'all',
  /* Notiz in der Leseansicht. Die ID überlebt ein Neuladen der Ansicht,
     das vollständige Objekt samt Anhängen holt der Router. */
  openNoteId: null,
  openNote: null,

  spots: { trail: [], place: [] },
  spotFilters: { trail: emptySpotFilter(), place: emptySpotFilter() },

  trips: [],
  openTripId: null,

  searchQuery: '',
  searchResults: null,

  adminUsers: [],

  /* Wird gesetzt, sobald eine Leseanfrage aus dem Offline-Cache kam —
     die Views zeigen dann einen Hinweis statt stiller veralteter Daten */
  servedOffline: false,
};

export function resetUserData()
{
  S.notes = [];
  S.noteQuery = '';
  S.noteFolders = [];
  S.noteCounts = { total: 0, unfiled: 0 };
  S.noteFolder = 'all';
  S.openNoteId = null;
  S.openNote = null;
  S.spots = { trail: [], place: [] };
  S.spotFilters = { trail: emptySpotFilter(), place: emptySpotFilter() };
  S.trips = [];
  S.openTripId = null;
  S.searchQuery = '';
  S.searchResults = null;
  S.adminUsers = [];
  S.servedOffline = false;
}

/* Bezugspunkt für alle Entfernungsangaben: der hinterlegte Heimatort */
export function homePoint()
{
  if (!S.user || S.user.home_lat === null || S.user.home_lat === undefined)
  {
    return null;
  }
  return { lat: S.user.home_lat, lng: S.user.home_lng, label: S.user.home_label };
}

export function countryName(code)
{
  return S.countries.find(c => c.code === code)?.name || code;
}

/* Alle Ziele ohne Doppelungen. Nötig, weil ein Eintrag Wanderweg UND Ort sein
   kann und dann in beiden geladenen Listen steckt. */
export function allSpots()
{
  const byId = new Map();
  [...S.spots.trail, ...S.spots.place].forEach(spot => byId.set(spot.id, spot));
  return [...byId.values()];
}

/* Wo ein Ziel in der Navigation zu finden ist. Doppel-Ziele führen zu den
   Wanderwegen, weil dort die zusätzlichen Kennzahlen stehen. */
export function spotView(spot)
{
  return spot.is_trail ? 'trails' : 'places';
}
