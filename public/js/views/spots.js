/* =====================================================
   Wegzeichen – views/spots.js
   Eine View für Wanderwege UND Orte. Beide teilen Datenmodell, Filter,
   Kartenansicht und Entfernungsberechnung; unterschiedlich sind nur die
   Kennzahlen eines Wanderwegs und die Kategorie eines Ortes.

   Diese Datei ist der Einstiegspunkt und hält den Rahmen zusammen. Die Teile
   liegen in views/spots/:

   - meta.js     was die beiden Arten unterscheidet, und die Sortierwahl
   - filters.js  Filterleiste und Ableitung der sichtbaren Liste
   - card.js     eine Eintragskarte samt Kennzahl-Chips
   ===================================================== */
import { IC } from '../icons.js';
import { S, homePoint } from '../state.js';
import { $, renderEmptyState } from '../dom.js';
import { API } from '../api.js';
import { openSpotModal } from '../modals/spot.js';
import { refresh } from '../router.js';
import { renderSpotMap } from '../map.js';
import { offlineBannerHtml, countryGroupsHtml } from './partials.js';
import { bindEntryActions, deletionBodyHtml } from './entryActions.js';
import { KIND_META } from './spots/meta.js';
import { visibleSpots, filterBarHtml, bindFilters } from './spots/filters.js';
import { cardHtml } from './spots/card.js';

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

    ${filterBarHtml(kind)}

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
      <a href="#" data-nav="profile">Im Profil festlegen</a>.</span>
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
      <p class="lp-hint hint-below">
        ${located} von ${items.length} Einträgen haben einen Punkt auf der Karte.
        ${located < items.length ? 'Den Rest findest du in der Liste.' : ''}</p>`;
  }

  const card = spot => cardHtml(kind, spot);
  return filters.sort === 'country'
    ? countryGroupsHtml(items, card)
    : `<div class="entry-list">${items.map(card).join('')}</div>`;
}

export function bindSpots(kind)
{
  const openNew = () => openSpotModal(kind, null, refresh);

  $('#btn-new-spot')?.addEventListener('click', openNew);
  $('#btn-new-spot-empty')?.addEventListener('click', openNew);

  bindFilters(kind, focusSelector => rerender(kind, focusSelector));

  if (S.spotFilters[kind].view === 'map')
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
    onDone: refresh,
  });
}

/* Neu zeichnen ohne Serveraufruf: Filter arbeiten auf der vollständig geladenen
   Liste. `focusSelector` stellt den Cursor im Suchfeld wieder her, das durch das
   Neuzeichnen den Fokus verliert. */
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
  openSpotModal(kind, spot, refresh);
}
