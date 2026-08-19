/* =====================================================
   Wegzeichen – modals/location-picker.js
   Standortauswahl über Adresssuche, Kartenklick oder GPS.
   Wird von Heimatort, Orten/Wanderwegen und Reise-Etappen genutzt.
   ===================================================== */
import { IC } from '../icons.js';
import { API } from '../api.js';
import { $, esc, debounce, toast, toastError } from '../dom.js';
import { openModal, closeModal } from '../modal.js';
import { createPointPicker } from '../map.js';
import { formatDistance } from '../geo.js';

/* Anzahl der Nachkommastellen bei der Anzeige — mehr als fünf sind bei
   einer angetippten Kartenposition vorgetäuschte Genauigkeit */
const COORD_DECIMALS = 5;

function round(value)
{
  return Number(value.toFixed(COORD_DECIMALS));
}

/* selected: { label, lat, lng, country, region } — country/region kommen nur
   aus der Adresssuche, ein Kartenklick kennt sie nicht. */
export function openLocationPicker({ title = 'Standort wählen', initial, onPick })
{
  let selected = {
    label: initial?.label || '',
    lat: Number.isFinite(initial?.lat) ? initial.lat : null,
    lng: Number.isFinite(initial?.lng) ? initial.lng : null,
    country: initial?.country || null,
    region: initial?.region || null,
  };

  openModal(`
    <div class="modal-head">
      <h2>${esc(title)}</h2>
      <button class="btn-modal-close" id="lp-close" aria-label="Schließen" title="Schließen">${IC.x}</button>
    </div>
    <div class="modal-body">
      <div class="form-group">
        <label class="form-label">Adresse oder Ort suchen</label>
        <div class="lp-search">
          <input class="form-input" id="lp-query" type="search"
            placeholder="z.B. Eifel Nationalpark" autocomplete="off"/>
          <button class="btn btn-ghost" id="lp-locate" title="Aktuelle Position verwenden"
            aria-label="Aktuelle Position verwenden">
            ${IC.crosshair}
          </button>
        </div>
        <div class="lp-results" id="lp-results"></div>
      </div>

      <div class="lp-map" id="lp-map"></div>
      <p class="lp-hint">Tippe auf die Karte, um den Punkt genau zu setzen.</p>

      <div class="form-group">
        <label class="form-label">Bezeichnung</label>
        <input class="form-input" id="lp-label" type="text"
          placeholder="z.B. Zuhause" value="${esc(selected.label)}"/>
      </div>

      <div class="lp-coords" id="lp-coords"></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" id="lp-clear">${IC.trash}<span>Standort entfernen</span></button>
      <button class="btn btn-primary" id="lp-save">${IC.check}<span>Übernehmen</span></button>
    </div>
  `, ov => bind(ov));

  /* Alle Abfragen sind auf das eigene Overlay begrenzt: der Picker liegt über
     dem Orts- oder Reiseformular, dokumentweite Selektoren könnten sonst
     Elemente der darunterliegenden Ebene treffen. */
  function renderCoords(ov)
  {
    const el = $('#lp-coords', ov);
    if (selected.lat === null)
    {
      el.innerHTML = '<span class="text-muted">Noch kein Punkt gewählt</span>';
      return;
    }
    el.innerHTML = `<span class="lp-coord-chip">${IC.pin}
      ${selected.lat.toFixed(COORD_DECIMALS)}, ${selected.lng.toFixed(COORD_DECIMALS)}</span>`;
  }

  function bind(ov)
  {
    renderCoords(ov);

    const picker = createPointPicker($('#lp-map', ov), selected, (lat, lng) =>
    {
      selected.lat = round(lat);
      selected.lng = round(lng);
      // Ein Kartenklick sagt nichts über Land und Region — alte Werte wären falsch
      selected.country = null;
      selected.region = null;
      renderCoords(ov);
    });

    $('#lp-close', ov).addEventListener('click', closeModal);

    $('#lp-query', ov).addEventListener('input', debounce(async e =>
    {
      const query = e.target.value.trim();
      const box = $('#lp-results', ov);
      if (query.length < 3)
      {
        box.innerHTML = '';
        return;
      }
      box.innerHTML = '<div class="lp-result-hint">Suche…</div>';
      try
      {
        const results = await API.geo.search(query);
        if (!results.length)
        {
          box.innerHTML = '<div class="lp-result-hint">Nichts gefunden</div>';
          return;
        }
        box.innerHTML = results.map((r, i) =>
          `<button class="lp-result" data-idx="${i}">${IC.pin}
            <span>${esc(r.label)}</span></button>`).join('');
        box.querySelectorAll('.lp-result').forEach(btn =>
        {
          btn.addEventListener('click', () =>
          {
            const hit = results[Number(btn.dataset.idx)];
            selected = {
              label: $('#lp-label', ov).value.trim() || hit.label.split(',')[0],
              lat: round(hit.lat),
              lng: round(hit.lng),
              country: hit.country,
              region: hit.region,
            };
            $('#lp-label', ov).value = selected.label;
            picker?.place(selected.lat, selected.lng);
            renderCoords(ov);
            box.innerHTML = '';
          });
        });
      }
      catch (err)
      {
        box.innerHTML = `<div class="lp-result-hint">${esc(err.message)}</div>`;
      }
    }, 450));

    $('#lp-locate', ov).addEventListener('click', () =>
    {
      if (!navigator.geolocation)
      {
        toast('Dieses Gerät liefert keine Position', 'warning');
        return;
      }
      navigator.geolocation.getCurrentPosition(
        pos =>
        {
          selected.lat = round(pos.coords.latitude);
          selected.lng = round(pos.coords.longitude);
          selected.country = null;
          selected.region = null;
          picker?.place(selected.lat, selected.lng);
          renderCoords(ov);
          toast(`Position übernommen (±${formatDistance(pos.coords.accuracy / 1000)})`, 'success');
        },
        () => toast('Position konnte nicht ermittelt werden', 'error')
      );
    });

    $('#lp-clear', ov).addEventListener('click', () =>
    {
      onPick({ label: null, lat: null, lng: null, country: null, region: null });
      closeModal();
    });

    $('#lp-save', ov).addEventListener('click', () =>
    {
      if (selected.lat === null)
      {
        toast('Bitte einen Punkt auf der Karte wählen', 'warning');
        return;
      }
      try
      {
        onPick({ ...selected, label: $('#lp-label', ov).value.trim() || null });
        closeModal();
      }
      catch (err)
      {
        toastError(err);
      }
    });
  }
}
