/* =====================================================
   Wegzeichen – views/spots.js
   Eine View für Wanderwege UND Orte. Beide teilen Datenmodell, Filter,
   Kartenansicht und Entfernungsberechnung; unterschiedlich sind nur die
   Kennzahlen eines Wanderwegs und die Kategorie eines Ortes.
   ===================================================== */
import { IC } from '../icons.js';
import { S, homePoint, countryName } from '../state.js';
import { $, $$, esc, debounce, starsHtml, renderEmptyState } from '../dom.js';
import { formatDate, relativeDateLabel, isPast } from '../dates.js';
import { API } from '../api.js';
import { openSpotModal } from '../modals/spot.js';
import { navigate } from '../router.js';
import { renderSpotMap } from '../map.js';
import { withDistances, sortItems, formatDistance, mapsDirectionsUrl } from '../geo.js';
import { offlineBannerHtml, countryGroupsHtml, countryFilterHtml } from './partials.js';
import {
  favButtonHtml, editButtonHtml, deleteButtonHtml, bindEntryActions, deletionBodyHtml,
} from './entryActions.js';

const KIND_META = {
  trail: {
    icon: 'mountain',
    title: 'Wanderwege',
    singular: 'Wanderweg',
    emptyEmoji: '⛰️',
    emptyHint: 'Speichere Routen, die du online findest — mit Länge, Ort und Quelle.',
  },
  place: {
    icon: 'pin',
    title: 'Orte',
    singular: 'Ort',
    emptyEmoji: '📍',
    emptyHint: 'Stände, Wälder, Hotels — alles, wo du hin willst oder schon warst.',
  },
};

/* „country" gruppiert nach Land, alle anderen liefern eine flache Liste */
const SORT_OPTIONS = [
  { value: 'country', label: 'Land, dann Name' },
  { value: 'name', label: 'Name A–Z' },
  { value: 'distance', label: 'Entfernung' },
  { value: 'planned', label: 'Geplantes Datum' },
  { value: 'rating', label: 'Bewertung' },
  { value: 'created', label: 'Zuletzt hinzugefügt' },
];

/* Zentrale Ableitung: Filter anwenden, Entfernungen ergänzen, sortieren.
   Alles im Browser, weil die Liste vollständig geladen ist — das macht die
   Filterung sofort wirksam und offline benutzbar. */
function visibleSpots(kind)
{
  const filters = S.spotFilters[kind];
  const term = filters.q.toLowerCase();

  const filtered = S.spots[kind].filter(spot =>
  {
    if (filters.country !== 'all' && spot.country !== filters.country)
    {
      return false;
    }
    if (filters.status !== 'all' && spot.status !== filters.status)
    {
      return false;
    }
    if (!term)
    {
      return true;
    }
    return [spot.name, spot.description, spot.region, spot.address, spot.category]
      .some(field => (field || '').toLowerCase().includes(term));
  });

  const withDist = withDistances(filtered, homePoint());
  return filters.sort === 'country'
    ? sortItems(withDist, 'name')
    : sortItems(withDist, filters.sort);
}

export function renderSpots(kind)
{
  const meta = KIND_META[kind];
  const filters = S.spotFilters[kind];
  const items = visibleSpots(kind);
  const total = S.spots[kind].length;

  return `
    <div class="page-header">
      <div class="page-title-row">
        <div class="page-icon">${IC[meta.icon]}</div>
        <div>
          <div class="page-title">${meta.title}</div>
          <div class="page-sub">${subtitle(kind, items.length, total)}</div>
        </div>
      </div>
      <button class="btn btn-primary" id="btn-new-spot">
        ${IC.plus}<span>Neuer ${meta.singular}</span></button>
    </div>

    ${offlineBannerHtml()}
    ${homeHintHtml(filters)}

    <div class="toolbar">
      <input class="filter-input" id="filter-q" type="search"
        placeholder="Suchen…" value="${esc(filters.q)}"/>
      ${countryFilterHtml(S.spots[kind], filters.country)}
      <select class="form-select" id="filter-status">
        <option value="all"${filters.status === 'all' ? ' selected' : ''}>Alle</option>
        <option value="wishlist"${filters.status === 'wishlist' ? ' selected' : ''}>
          Möchte ich hin</option>
        <option value="visited"${filters.status === 'visited' ? ' selected' : ''}>
          War ich schon</option>
      </select>
      <select class="form-select" id="filter-sort">
        ${SORT_OPTIONS.map(o => `<option value="${o.value}"${filters.sort === o.value
    ? ' selected' : ''}>${o.label}</option>`).join('')}
      </select>
      <div class="view-toggle">
        <button data-view="list" class="${filters.view === 'list' ? 'active' : ''}"
          title="Liste">${IC.listV}</button>
        <button data-view="map" class="${filters.view === 'map' ? 'active' : ''}"
          title="Karte">${IC.map}</button>
      </div>
    </div>

    ${contentHtml(kind, items)}`;
}

function subtitle(kind, shown, total)
{
  const meta = KIND_META[kind];
  if (!total)
  {
    return `Noch keine ${meta.title}`;
  }
  const visited = S.spots[kind].filter(s => s.status === 'visited').length;
  const base = shown === total
    ? `${total} ${total === 1 ? meta.singular : meta.title}`
    : `${shown} von ${total} angezeigt`;
  return `${base} · ${visited} besucht`;
}

/* Entfernungssortierung ohne Heimatort ist wirkungslos — das muss man sagen,
   statt eine unsortierte Liste zu zeigen */
function homeHintHtml(filters)
{
  if (filters.sort !== 'distance' || homePoint())
  {
    return '';
  }
  return `<div class="offline-banner">${IC.warn}
    <span>Für Entfernungen fehlt der Heimatort.
      <a href="#" data-nav="profile" style="text-decoration:underline">Im Profil festlegen</a>.</span>
  </div>`;
}

function contentHtml(kind, items)
{
  const meta = KIND_META[kind];
  const filters = S.spotFilters[kind];

  if (!items.length)
  {
    return S.spots[kind].length
      ? renderEmptyState('🔍', 'Nichts gefunden', 'Keine Einträge passen zu den Filtern.')
      : renderEmptyState(meta.emptyEmoji, `Noch keine ${meta.title}`, meta.emptyHint,
        `<button class="btn btn-primary" id="btn-new-spot-empty">${IC.plus}
          <span>Neuer ${meta.singular}</span></button>`);
  }

  if (filters.view === 'map')
  {
    const located = items.filter(i => i.lat !== null).length;
    return `<div class="map-wrap" id="spot-map"></div>
      <p class="lp-hint" style="margin-top:8px">
        ${located} von ${items.length} Einträgen haben einen Punkt auf der Karte.
        ${located < items.length ? 'Den Rest findest du in der Liste.' : ''}</p>`;
  }

  const card = spot => cardHtml(kind, spot);
  return filters.sort === 'country'
    ? countryGroupsHtml(items, card)
    : `<div class="entry-list">${items.map(card).join('')}</div>`;
}

function cardHtml(kind, spot)
{
  const navUrl = mapsDirectionsUrl(spot);

  return `
    <div class="entry-card${spot.is_favorite ? ' is-favorite' : ''}">
      <div class="entry-main" data-open="${spot.id}">
        <div class="entry-title-row">
          <span class="entry-title">${esc(spot.name)}</span>
          <span class="status-badge s-${spot.status}">
            ${spot.status === 'visited' ? 'War ich schon' : 'Möchte ich hin'}</span>
          ${spot.rating ? starsHtml(spot.rating) : ''}
        </div>
        ${spot.description ? `<div class="entry-body">${esc(spot.description)}</div>` : ''}
        <div class="entry-meta">${metaChipsHtml(kind, spot)}</div>
      </div>
      <div class="entry-actions">
        ${favButtonHtml(spot)}
        ${navUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(navUrl)}" target="_blank"
          rel="noopener" title="Route in Google Maps">${IC.navigate}</a>` : ''}
        ${spot.source_url ? `<a class="btn btn-ghost btn-sm" href="${esc(spot.source_url)}"
          target="_blank" rel="noopener" title="Quelle öffnen">${IC.external}</a>` : ''}
        ${editButtonHtml(spot.id)}
        ${deleteButtonHtml(spot.id)}
      </div>
    </div>`;
}

function metaChipsHtml(kind, spot)
{
  const chips = [];

  /* Trägt ein Ziel beide Aspekte, wird der jeweils andere ausgewiesen — sonst
     wäre in der Wanderwege-Liste nicht zu sehen, dass es auch ein Ort ist. */
  if (spot.is_trail && spot.is_place)
  {
    const other = kind === 'trail'
      ? { icon: 'pin', label: 'auch ein Ort' }
      : { icon: 'mountain', label: 'auch ein Wanderweg' };
    chips.push(`<span class="entry-chip accent">${IC[other.icon]}${other.label}</span>`);
  }

  if (spot.country)
  {
    chips.push(`<span class="entry-chip">${IC.globe}${esc(countryName(spot.country))}${
      spot.region ? ` · ${esc(spot.region)}` : ''}</span>`);
  }
  else if (spot.region)
  {
    chips.push(`<span class="entry-chip">${IC.globe}${esc(spot.region)}</span>`);
  }

  if (spot.distanceKm !== null && spot.distanceKm !== undefined)
  {
    chips.push(`<span class="entry-chip accent">${IC.navigate}
      ${formatDistance(spot.distanceKm)} Luftlinie</span>`);
  }

  /* Nach Aspekt des Eintrags, nicht nach aktueller Liste: die Länge eines
     Weges ist auch dann interessant, wenn man ihn unter „Orte" ansieht. */
  if (spot.is_trail)
  {
    if (spot.length_km !== null)
    {
      chips.push(`<span class="entry-chip">${IC.ruler}
        ${String(spot.length_km).replace('.', ',')} km</span>`);
    }
    if (spot.ascent_m !== null)
    {
      chips.push(`<span class="entry-chip">${IC.ascent}${spot.ascent_m} hm</span>`);
    }
    if (spot.duration_min !== null)
    {
      chips.push(`<span class="entry-chip">${IC.clock}${formatDuration(spot.duration_min)}</span>`);
    }
    if (spot.difficulty)
    {
      chips.push(`<span class="entry-chip">${IC.mountain}${esc(spot.difficulty)}</span>`);
    }
  }
  if (spot.is_place && spot.category)
  {
    chips.push(`<span class="entry-chip">${IC.pin}${esc(spot.category)}</span>`);
  }

  if (spot.visited_at)
  {
    chips.push(`<span class="entry-chip">${IC.calendar}${formatDate(spot.visited_at)}</span>`);
  }

  if (spot.planned_at)
  {
    // Ein verstrichener Termin auf der Wunschliste soll auffallen, nicht untergehen
    const overdue = isPast(spot.planned_at);
    chips.push(`<span class="entry-chip${overdue ? ' overdue' : ' accent'}">${IC.calendar}
      ${overdue ? 'war geplant' : 'geplant'}: ${relativeDateLabel(spot.planned_at)}</span>`);
  }

  return chips.join('');
}

export function formatDuration(minutes)
{
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours)
  {
    return `${rest} min`;
  }
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function bindSpots(kind)
{
  const filters = S.spotFilters[kind];
  const openNew = () => openSpotModal(kind, null, () => navigate(S.view));

  $('#btn-new-spot')?.addEventListener('click', openNew);
  $('#btn-new-spot-empty')?.addEventListener('click', openNew);

  /* Filter verändern nur den State und rendern neu — kein Serveraufruf,
     die Liste ist schon vollständig da */
  $('#filter-q').addEventListener('input', debounce(e =>
  {
    filters.q = e.target.value.trim();
    rerender(kind, '#filter-q');
  }, 250));

  $('#filter-country').addEventListener('change', e =>
  {
    filters.country = e.target.value;
    rerender(kind);
  });
  $('#filter-status').addEventListener('change', e =>
  {
    filters.status = e.target.value;
    rerender(kind);
  });
  $('#filter-sort').addEventListener('change', e =>
  {
    filters.sort = e.target.value;
    rerender(kind);
  });
  $$('.view-toggle [data-view]').forEach(btn =>
    btn.addEventListener('click', () =>
    {
      filters.view = btn.dataset.view;
      rerender(kind);
    }));

  if (filters.view === 'map')
  {
    renderSpotMap($('#spot-map'), visibleSpots(kind), spot => openForEdit(kind, spot.id));
  }

  const openForEditInKind = id => openForEdit(kind, id);
  bindEntryActions({
    itemById: id => S.spots[kind].find(spot => spot.id === id),
    open: openForEditInKind,
    edit: openForEditInKind,
    setFavorite: API.spots.setFavorite,
    remove: API.spots.remove,
    describeDeletion: spot => ({
      title: `${KIND_META[kind].singular} löschen`,
      bodyHtml: deletionBodyHtml(spot.name),
    }),
    deletedMessage: 'Eintrag gelöscht',
    onDone: () => navigate(S.view),
  });
}

/* Neu zeichnen ohne Serveraufruf. `focusSelector` stellt den Cursor im
   Suchfeld wieder her, das durch das Neuzeichnen den Fokus verliert. */
function rerender(kind, focusSelector)
{
  $('#main-content').innerHTML = renderSpots(kind);
  bindSpots(kind);
  if (focusSelector)
  {
    const field = $(focusSelector);
    field?.focus();
    field?.setSelectionRange(field.value.length, field.value.length);
  }
}

function openForEdit(kind, id)
{
  const spot = S.spots[kind].find(s => s.id === id);
  openSpotModal(kind, spot, () => navigate(S.view));
}
