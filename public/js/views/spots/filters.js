/* =====================================================
   Wegzeichen – views/spots/filters.js
   Filterleiste und die Ableitung der sichtbaren Liste

   Alles im Browser: die Liste ist vollständig geladen, dadurch wirken Filter
   sofort und funktionieren offline. Die Serverfilter in `routes/spots.js`
   bleiben trotzdem vorhanden und getestet.
   ===================================================== */
import { IC } from '../../icons.js';
import { S, homePoint } from '../../state.js';
import { $, $$, esc, debounce } from '../../dom.js';
import { withDistances, sortItems } from '../../geo.js';
import { countryFilterHtml } from '../partials.js';
import { SORT_OPTIONS } from './meta.js';

/* Filter anwenden, Entfernungen ergänzen, sortieren. Die Gruppierung nach Land
   sortiert innerhalb der Gruppe nach Namen — die Gruppen selbst baut
   `countryGroupsHtml`. */
export function visibleSpots(kind)
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

export function filterBarHtml(kind)
{
  const filters = S.spotFilters[kind];

  return `
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
          title="Liste" aria-label="Als Liste anzeigen">${IC.listV}</button>
        <button data-view="map" class="${filters.view === 'map' ? 'active' : ''}"
          title="Karte" aria-label="Auf der Karte anzeigen">${IC.map}</button>
      </div>
    </div>`;
}

/* `rerender` kommt von außen herein, statt es hier zu importieren: die Datei
   soll nichts über die umgebende View wissen — sonst hängen beide aneinander. */
export function bindFilters(kind, rerender)
{
  const filters = S.spotFilters[kind];

  /* Der Suchbegriff kommt gedrosselt, weil jede Eingabe die Liste neu zeichnet.
     Der Selektor stellt danach den Cursor im Feld wieder her. */
  $('#filter-q').addEventListener('input', debounce(e =>
  {
    filters.q = e.target.value.trim();
    rerender('#filter-q');
  }, 250));

  $('#filter-country').addEventListener('change', e =>
  {
    filters.country = e.target.value;
    rerender();
  });
  $('#filter-status').addEventListener('change', e =>
  {
    filters.status = e.target.value;
    rerender();
  });
  $('#filter-sort').addEventListener('change', e =>
  {
    filters.sort = e.target.value;
    rerender();
  });
  $$('.view-toggle [data-view]').forEach(btn =>
    btn.addEventListener('click', () =>
    {
      filters.view = btn.dataset.view;
      rerender();
    }));
}
