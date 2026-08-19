/* =====================================================
   Wegzeichen – views/home.js
   Übersicht: Suche über alles, Favoriten und Ziele in der Nähe
   ===================================================== */
import { IC } from '../icons.js';
import { S, homePoint, countryName, allSpots, spotView } from '../state.js';
import { $, $$, esc, debounce, timeAgo, starsHtml, renderEmptyState } from '../dom.js';
import { formatDate, relativeDateLabel, todayIso, isPast } from '../dates.js';
import { API } from '../api.js';
import { navigate } from '../router.js';
import { withDistances, sortItems, formatDistance, mapsDirectionsUrl } from '../geo.js';
import { offlineBannerHtml } from './partials.js';

const NEARBY_LIMIT = 6;
const FAVORITES_LIMIT = 8;
const UPCOMING_LIMIT = 6;

export function renderHome()
{
  return `
    <div class="page-header">
      <div class="page-title-row">
        <div class="page-icon">${IC.home}</div>
        <div>
          <div class="page-title">Übersicht</div>
          <div class="page-sub">Hallo ${esc(S.user?.username || '')}</div>
        </div>
      </div>
    </div>

    ${offlineBannerHtml()}

    <div class="search-bar">
      <input class="search-input" id="global-search" type="search"
        placeholder="Alles durchsuchen — Notizen, Wege, Orte, Reisen…"
        value="${esc(S.searchQuery)}"/>
      <button class="search-submit" id="global-search-btn">${IC.search}</button>
    </div>

    <div id="search-results">${searchResultsHtml()}</div>

    <div class="stats-grid">
      ${statCard(S.notes.length, 'Notiz', 'Notizen', 'notes')}
      ${statCard(S.spots.trail.length, 'Wanderweg', 'Wanderwege', 'trails')}
      ${statCard(S.spots.place.length, 'Ort', 'Orte', 'places')}
      ${statCard(S.trips.length, 'Reise', 'Reisen', 'trips')}
    </div>

    ${upcomingSectionHtml()}
    ${nearbySectionHtml()}
    ${favoritesSectionHtml()}`;
}

function statCard(count, singular, plural, view)
{
  return `<div class="stat-card" data-nav="${view}" style="cursor:pointer">
    <div class="stat-num">${count}</div>
    <div class="stat-label">${count === 1 ? singular : plural}</div>
  </div>`;
}

/* ── Nächste Termine ──
   Geplante Ziele und noch nicht abgeschlossene Reisen in einer Liste, der
   nächste zuerst. Verstrichene Termine bleiben oben stehen statt zu
   verschwinden — sonst vergisst man sie stillschweigend. */
function upcomingSectionHtml()
{
  const today = todayIso();

  const plannedSpots = allSpots()
    .filter(s => s.planned_at)
    .map(s => ({
      date: s.planned_at,
      title: s.name,
      view: spotView(s),
      icon: s.is_trail ? 'mountain' : 'pin',
      detail: s.country ? countryName(s.country) : '',
    }));

  /* Eine Reise gilt bis zu ihrem letzten Tag als anstehend; fehlt das Ende,
     zählt der Starttag. */
  const upcomingTrips = S.trips
    .filter(t => t.start_date && (t.end_date || t.start_date) >= today)
    .map(t => ({
      date: t.start_date,
      title: t.title,
      view: 'trips',
      icon: 'route',
      detail: t.end_date ? `bis ${formatDate(t.end_date)}` : '',
    }));

  const entries = [...plannedSpots, ...upcomingTrips]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, UPCOMING_LIMIT);

  if (!entries.length)
  {
    return '';
  }

  return `<div class="section">
    <div class="section-head">
      <div class="section-title">${IC.calendar}<span>Nächste Termine</span></div>
    </div>
    <div class="entry-list">${entries.map(item =>
  {
    const overdue = isPast(item.date, today);
    return `<div class="entry-card">
        <div class="entry-main" data-nav="${item.view}">
          <div class="entry-title-row">
            <span class="entry-title">${esc(item.title)}</span>
            ${overdue ? '<span class="status-badge s-overdue">überfällig</span>' : ''}
          </div>
          <div class="entry-meta">
            <span class="entry-chip${overdue ? ' overdue' : ' accent'}">${IC.calendar}
              ${relativeDateLabel(item.date, today)}</span>
            <span class="entry-chip">${IC[item.icon]}${esc(item.detail)}</span>
          </div>
        </div>
      </div>`;
  }).join('')}</div>
  </div>`;
}

/* ── Ziele in der Nähe ──
   Nur Einträge von der Wunschliste, denn was besucht ist, muss nicht mehr
   vorgeschlagen werden. */
function nearbySectionHtml()
{
  const home = homePoint();
  if (!home)
  {
    return `<div class="section">
      <div class="section-head">
        <div class="section-title">${IC.navigate}<span>Ziele in der Nähe</span></div>
      </div>
      <div class="offline-banner">${IC.warn}
        <span>Lege im
          <a href="#" data-nav="profile" style="text-decoration:underline">Profil</a>
          einen Heimatort fest, dann erscheinen hier die nächstgelegenen Ziele.</span>
      </div>
    </div>`;
  }

  const candidates = allSpots().filter(s => s.status === 'wishlist' && s.lat !== null);
  if (!candidates.length)
  {
    return '';
  }

  const nearby = sortItems(withDistances(candidates, home), 'distance').slice(0, NEARBY_LIMIT);

  return `<div class="section">
    <div class="section-head">
      <div class="section-title">${IC.navigate}<span>Ziele in der Nähe</span></div>
      <span class="text-muted" style="font-size:.76rem">Luftlinie von
        ${esc(home.label || 'Zuhause')}</span>
    </div>
    <div class="entry-list">${nearby.map(nearbyCardHtml).join('')}</div>
  </div>`;
}

function nearbyCardHtml(spot)
{
  const navUrl = mapsDirectionsUrl(spot);

  return `<div class="entry-card">
    <div class="entry-main" data-nav="${spotView(spot)}">
      <div class="entry-title-row">
        <span class="entry-title">${esc(spot.name)}</span>
      </div>
      <div class="entry-meta">
        <span class="entry-chip accent">${IC.navigate}
          ${formatDistance(spot.distanceKm)}</span>
        <span class="entry-chip">${IC[spot.is_trail ? 'mountain' : 'pin']}
          ${spotKindLabel(spot)}</span>
        ${spot.country ? `<span class="entry-chip">${IC.globe}
          ${esc(countryName(spot.country))}</span>` : ''}
      </div>
    </div>
    <div class="entry-actions">
      ${navUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(navUrl)}" target="_blank"
        rel="noopener" title="Route in Google Maps">${IC.navigate}</a>` : ''}
    </div>
  </div>`;
}

function spotKindLabel(spot)
{
  if (spot.is_trail && spot.is_place)
  {
    return 'Wanderweg und Ort';
  }
  return spot.is_trail ? 'Wanderweg' : 'Ort';
}

/* ── Favoriten aus allen Modulen ── */
function favoritesSectionHtml()
{
  const favorites = [
    ...S.notes.filter(n => n.is_favorite)
      .map(n => ({ view: 'notes', noteId: n.id, icon: 'note', title: n.title,
        meta: timeAgo(n.updated_at), rating: null })),
    // allSpots() statt beider Listen: ein Doppel-Ziel stünde sonst zweimal hier
    ...allSpots().filter(s => s.is_favorite)
      .map(s => ({ view: spotView(s), icon: s.is_trail ? 'mountain' : 'pin',
        title: s.name, meta: s.country ? countryName(s.country) : '', rating: s.rating })),
    ...S.trips.filter(t => t.is_favorite)
      .map(t => ({ view: 'trips', icon: 'route', title: t.title,
        meta: t.start_date ? formatDate(t.start_date) : '', rating: t.rating })),
  ].slice(0, FAVORITES_LIMIT);

  if (!favorites.length)
  {
    return '';
  }

  return `<div class="section" id="favorites">
    <div class="section-head">
      <div class="section-title">${IC.star}<span>Favoriten</span></div>
    </div>
    <div class="entry-list">${favorites.map(item => `
      <div class="entry-card is-favorite">
        <div class="entry-main" ${item.noteId
    ? `data-note="${item.noteId}"` : `data-nav="${item.view}"`}>
          <div class="entry-title-row">
            <span class="entry-title">${esc(item.title)}</span>
            ${item.rating ? starsHtml(item.rating) : ''}
          </div>
          <div class="entry-meta">
            <span class="entry-chip">${IC[item.icon]}${esc(item.meta)}</span>
          </div>
        </div>
      </div>`).join('')}</div>
  </div>`;
}

/* ── Globale Suche ── */
function searchResultsHtml()
{
  const results = S.searchResults;
  if (!results)
  {
    return '';
  }

  const groups = [
    // opensNote: ein Treffer führt direkt in die Leseansicht, nicht in die Liste
    { items: results.notes, icon: 'note', label: 'Notizen', view: 'notes', opensNote: true,
      titleOf: n => n.title, metaOf: n => timeAgo(n.updated_at) },
    /* Ein Ziel mit beiden Aspekten erscheint absichtlich in beiden Gruppen —
       man sucht es je nach Anlass als Weg oder als Ort. */
    { items: results.spots.filter(s => s.is_trail), icon: 'mountain',
      label: 'Wanderwege', view: 'trails',
      titleOf: s => s.name, metaOf: s => s.region || (s.country ? countryName(s.country) : '') },
    { items: results.spots.filter(s => s.is_place), icon: 'pin',
      label: 'Orte', view: 'places',
      titleOf: s => s.name, metaOf: s => s.region || (s.country ? countryName(s.country) : '') },
    { items: results.trips, icon: 'route', label: 'Reisen', view: 'trips',
      titleOf: t => t.title, metaOf: t => (t.start_date ? formatDate(t.start_date) : '') },
  ].filter(g => g.items.length);

  if (!groups.length)
  {
    return `<div style="margin-bottom:24px">${renderEmptyState('🔍', 'Nichts gefunden',
      `Kein Eintrag enthält „${S.searchQuery}".`)}</div>`;
  }

  return `<div class="section">
    <div class="section-head">
      <div class="section-title">${IC.search}<span>Suchergebnisse</span></div>
      <button class="btn btn-ghost btn-sm" id="clear-search">${IC.x}<span>Zurücksetzen</span></button>
    </div>
    ${groups.map(group => `
      <div class="country-group">
        <div class="country-head">
          ${IC[group.icon]}<span>${group.label}</span>
          <span class="cnt">${group.items.length}</span>
        </div>
        <div class="entry-list">${group.items.map(item => `
          <div class="entry-card">
            <div class="entry-main" ${group.opensNote
    ? `data-note="${item.id}"` : `data-nav="${group.view}"`}>
              <div class="entry-title-row">
                <span class="entry-title">${esc(group.titleOf(item))}</span>
                ${item.rating ? starsHtml(item.rating) : ''}
              </div>
              ${group.metaOf(item) ? `<div class="entry-meta">
                <span class="entry-chip">${IC[group.icon]}
                ${esc(group.metaOf(item))}</span></div>` : ''}
            </div>
          </div>`).join('')}</div>
      </div>`).join('')}
  </div>`;
}

export function bindHome()
{
  const field = $('#global-search');

  const runSearch = async () =>
  {
    S.searchQuery = field.value.trim();
    S.searchResults = S.searchQuery.length >= 2
      ? await API.search.all(S.searchQuery)
      : null;

    $('#search-results').innerHTML = searchResultsHtml();
    bindSearchResults();
  };

  field.addEventListener('input', debounce(runSearch, 350));
  $('#global-search-btn').addEventListener('click', runSearch);
  bindNoteLinks($('#favorites'));
  bindSearchResults();
}

function bindSearchResults()
{
  $('#clear-search')?.addEventListener('click', () =>
  {
    S.searchQuery = '';
    S.searchResults = null;
    navigate('home');
  });
  bindNoteLinks($('#search-results'));
}

/* Notizen führen in ihre Leseansicht statt in die Liste — die Suche soll den
   gefundenen Text zeigen, nicht nur den Bereich, in dem er steht. */
function bindNoteLinks(scope)
{
  if (!scope)
  {
    return;
  }
  $$('[data-note]', scope).forEach(el => el.addEventListener('click', () =>
  {
    S.openNoteId = Number(el.dataset.note);
    navigate('note');
  }));
}
