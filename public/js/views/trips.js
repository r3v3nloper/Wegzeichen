/* =====================================================
   Wegzeichen – views/trips.js
   Privater Reiseblog: Reisen mit Bewertung, Dauer und Etappenroute
   ===================================================== */
import { IC } from '../icons.js';
import { S, countryName } from '../state.js';
import { $, $$, esc, plural, starsHtml, renderEmptyState, toastError } from '../dom.js';
import { formatDate, inclusiveDays } from '../dates.js';
import { API } from '../api.js';
import { openModal, closeModal } from '../modal.js';
import { openTripModal } from '../modals/trip.js';
import { navigate } from '../router.js';
import { mapsSearchUrl } from '../geo.js';
import { offlineBannerHtml } from './partials.js';
import {
  favButtonHtml, editButtonHtml, deleteButtonHtml, bindEntryActions, deletionBodyHtml,
} from './entryActions.js';

/* Dauer wird aus den Datumsangaben abgeleitet und nicht gespeichert —
   sonst gäbe es zwei Wahrheiten. Beide Tage zählen mit. */
export function tripDurationDays(trip)
{
  return inclusiveDays(trip.start_date, trip.end_date);
}

export function renderTrips()
{
  const total = S.trips.length;

  return `
    <div class="page-header">
      <div class="page-title-row">
        <div class="page-icon">${IC.route}</div>
        <div>
          <div class="page-title">Reisen</div>
          <div class="page-sub">${total
    ? `${plural(total, 'Reise', 'Reisen')} festgehalten`
    : 'Noch keine Reisen'}</div>
        </div>
      </div>
      <button class="btn btn-primary" id="btn-new-trip">
        ${IC.plus}<span>Neue Reise</span></button>
    </div>

    ${offlineBannerHtml()}

    ${total ? `<div class="entry-list">${S.trips.map(cardHtml).join('')}</div>`
    : renderEmptyState('🧭', 'Noch keine Reisen',
      'Halte fest, wo du warst — mit Route, Dauer und Bewertung.',
      `<button class="btn btn-primary" id="btn-new-trip-empty">${IC.plus}
        <span>Neue Reise</span></button>`)}`;
}

function cardHtml(trip)
{
  const days = tripDurationDays(trip);

  return `
    <div class="entry-card${trip.is_favorite ? ' is-favorite' : ''}">
      <div class="entry-main" data-open="${trip.id}">
        <div class="entry-title-row">
          <span class="entry-title">${esc(trip.title)}</span>
          ${trip.rating ? starsHtml(trip.rating) : ''}
        </div>
        ${trip.summary ? `<div class="entry-body">${esc(trip.summary)}</div>` : ''}
        <div class="entry-meta">
          ${trip.country ? `<span class="entry-chip">${IC.globe}
            ${esc(countryName(trip.country))}</span>` : ''}
          ${trip.start_date ? `<span class="entry-chip">${IC.calendar}
            ${formatDate(trip.start_date)}${trip.end_date
    ? ` – ${formatDate(trip.end_date)}` : ''}</span>` : ''}
          ${days ? `<span class="entry-chip accent">${IC.clock}
            ${plural(days, 'Tag', 'Tage')}</span>` : ''}
          ${trip.stageCount ? `<span class="entry-chip">${IC.route}
            ${plural(trip.stageCount, 'Etappe', 'Etappen')}</span>` : ''}
        </div>
      </div>
      <div class="entry-actions">
        ${favButtonHtml(trip)}
        ${trip.photos_url ? `<a class="btn btn-ghost btn-sm" href="${esc(trip.photos_url)}"
          target="_blank" rel="noopener" title="Bilder in der Cloud öffnen">
          ${IC.external}</a>` : ''}
        ${editButtonHtml(trip.id)}
        ${deleteButtonHtml(trip.id)}
      </div>
    </div>`;
}

export function bindTrips()
{
  const openNew = () => openTripModal(null, () => navigate('trips'));
  $('#btn-new-trip')?.addEventListener('click', openNew);
  $('#btn-new-trip-empty')?.addEventListener('click', openNew);

  bindEntryActions({
    itemById: id => S.trips.find(trip => trip.id === id),
    open: openDetail,
    edit: openForEdit,
    setFavorite: API.trips.setFavorite,
    remove: API.trips.remove,
    describeDeletion: trip => ({
      title: 'Reise löschen',
      bodyHtml: deletionBodyHtml(trip.title, trip.stageCount
        ? ` und ${plural(trip.stageCount, 'Etappe', 'Etappen')}` : ''),
    }),
    deletedMessage: 'Reise gelöscht',
    onDone: () => navigate('trips'),
  });
}

async function loadTrip(id)
{
  return API.trips.get(id);
}

async function openForEdit(id)
{
  try
  {
    openTripModal(await loadTrip(id), () => navigate('trips'));
  }
  catch (err)
  {
    toastError(err);
  }
}

/* Leseansicht der Reise: Kopfdaten und die Route als Zeitleiste */
async function openDetail(id)
{
  let trip;
  try
  {
    trip = await loadTrip(id);
  }
  catch (err)
  {
    toastError(err);
    return;
  }

  const days = tripDurationDays(trip);

  openModal(`
    <div class="modal-head">
      <h2>${esc(trip.title)}</h2>
      <button class="btn-modal-close" data-close>${IC.x}</button>
    </div>
    <div class="modal-body">
      ${trip.rating ? `<div style="margin-bottom:12px">${starsHtml(trip.rating, false)}</div>` : ''}

      <dl class="detail-grid">
        ${trip.country ? `<dt>Land</dt><dd>${esc(countryName(trip.country))}</dd>` : ''}
        ${trip.start_date ? `<dt>Zeitraum</dt><dd>${formatDate(trip.start_date)}${
    trip.end_date ? ` – ${formatDate(trip.end_date)}` : ''}</dd>` : ''}
        ${days ? `<dt>Dauer</dt><dd>${plural(days, 'Tag', 'Tage')}</dd>` : ''}
        ${trip.photos_url ? `<dt>Bilder</dt><dd><a href="${esc(trip.photos_url)}"
          target="_blank" rel="noopener">In der Cloud öffnen</a></dd>` : ''}
      </dl>

      ${trip.summary ? `<div class="detail-text">${esc(trip.summary)}</div>` : ''}

      ${trip.stages.length ? `
        <div class="section" style="margin:20px 0 0">
          <div class="section-head">
            <div class="section-title">${IC.route}<span>Route</span></div>
          </div>
          <div class="stage-list">${trip.stages.map(stageHtml).join('')}</div>
        </div>` : ''}
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-close>Schließen</button>
      <button class="btn btn-primary" id="detail-edit">${IC.edit}<span>Bearbeiten</span></button>
    </div>`, ov =>
  {
    $$('[data-close]', ov).forEach(b => b.addEventListener('click', closeModal));
    $('#detail-edit', ov).addEventListener('click', () =>
    {
      closeModal();
      openTripModal(trip, () => navigate('trips'));
    });
  });
}

function stageHtml(stage)
{
  const mapUrl = mapsSearchUrl({ ...stage, name: stage.location_name });

  return `
    <div class="stage-item">
      <div class="stage-day">${dayLabel(stage)}</div>
      <div class="stage-main">
        <div class="stage-name">${esc(stage.location_name)}</div>
        ${stage.spot_name ? `<div class="entry-chip" style="margin-top:3px">
          ${IC[stage.spot_is_trail ? 'mountain' : 'pin']}
          ${esc(stage.spot_name)}</div>` : ''}
        ${stage.notes ? `<div class="stage-notes">${esc(stage.notes)}</div>` : ''}
      </div>
      ${mapUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(mapUrl)}" target="_blank"
        rel="noopener" title="In Google Maps ansehen">${IC.navigate}</a>` : ''}
    </div>`;
}

function dayLabel(stage)
{
  if (stage.day_from === null)
  {
    return '·';
  }
  return stage.day_to && stage.day_to !== stage.day_from
    ? `Tag ${stage.day_from}–${stage.day_to}`
    : `Tag ${stage.day_from}`;
}
