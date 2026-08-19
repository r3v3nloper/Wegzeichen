/* =====================================================
   Wegzeichen – modals/spot.js
   Formular für Orte und Wanderwege. Beide teilen das Datenmodell und ein Ziel
   darf beides sein; die Feldgruppen erscheinen je gesetztem Aspekt.
   Der übergebene `kind` bestimmt nur die Vorbelegung und die Beispieltexte.
   ===================================================== */
import { IC } from '../icons.js';
import { API } from '../api.js';
import { $, $$, esc, starPickerHtml, bindStarPickers, toast, toastError } from '../dom.js';
import { openModal, closeModal } from '../modal.js';
import { openLocationPicker } from './location-picker.js';
import { countryOptionsHtml } from '../views/partials.js';

const KIND_LABELS = {
  trail: { title: 'Wanderweg', icon: 'mountain' },
  place: { title: 'Ort', icon: 'pin' },
};

/* Vorschläge, keine Vorgabe — das Feld bleibt frei beschreibbar */
const CATEGORY_SUGGESTIONS = ['Hotel', 'Ferienwohnung', 'Campingplatz', 'Wald', 'See',
  'Aussichtspunkt', 'Stand', 'Restaurant', 'Burg', 'Museum', 'Parkplatz', 'Badestelle'];

const DIFFICULTIES = ['leicht', 'mittel', 'schwer'];

export function openSpotModal(kind, spot, onSaved)
{
  const labels = KIND_LABELS[kind];
  const isNew = !spot;

  /* Ein Ziel kann Wanderweg und Ort zugleich sein. Bei einem neuen Eintrag ist
     der Aspekt vorbelegt, aus dessen Liste heraus er angelegt wurde. */
  const kinds = {
    is_trail: spot ? !!spot.is_trail : kind === 'trail',
    is_place: spot ? !!spot.is_place : kind === 'place',
  };

  /* Standort wird im Picker gesetzt und erst beim Speichern mitgeschickt */
  let location = {
    lat: spot?.lat ?? null,
    lng: spot?.lng ?? null,
    country: spot?.country ?? null,
    region: spot?.region ?? null,
  };

  openModal(`
    <div class="modal-head">
      <h2>${isNew ? `Neuer ${labels.title}` : `${labels.title} bearbeiten`}</h2>
      <button class="btn-modal-close" data-close>${IC.x}</button>
    </div>
    <div class="modal-body">
      <form id="spot-form">
        <div class="form-group">
          <label class="form-label">Name</label>
          <input class="form-input" name="name" type="text" required maxlength="200"
            value="${esc(spot?.name || '')}"
            placeholder="${kind === 'trail' ? 'z.B. Rothaarsteig Etappe 3' : 'z.B. Hotel Waldblick'}"/>
        </div>

        <div class="form-group">
          <label class="form-label">Was ist das?</label>
          <div class="kind-picker">
            <label class="kind-option">
              <input type="checkbox" name="is_trail" ${kinds.is_trail ? 'checked' : ''}/>
              ${IC.mountain}<span>Wanderweg</span>
            </label>
            <label class="kind-option">
              <input type="checkbox" name="is_place" ${kinds.is_place ? 'checked' : ''}/>
              ${IC.pin}<span>Ort</span>
            </label>
          </div>
          <p class="lp-hint" style="margin:6px 0 0">
            Beides ist möglich — eine Schlucht fährt man an und läuft sie ab.</p>
        </div>

        <div class="form-group">
          <label class="form-label">Status</label>
          <div class="status-tabs" id="status-tabs">
            <button type="button" class="status-tab${spot?.status !== 'visited' ? ' active' : ''}"
              data-status="wishlist">Möchte ich hin</button>
            <button type="button" class="status-tab${spot?.status === 'visited' ? ' active' : ''}"
              data-status="visited">War ich schon</button>
          </div>
          <input type="hidden" name="status" value="${spot?.status || 'wishlist'}"/>
        </div>

        <div id="visited-fields" style="display:${spot?.status === 'visited' ? 'block' : 'none'}">
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Bewertung</label>
              ${starPickerHtml('rating', spot?.rating || 0)}
            </div>
            <div class="form-group">
              <label class="form-label">Besucht am</label>
              <input class="form-input" name="visited_at" type="date"
                value="${esc(spot?.visited_at || '')}"/>
            </div>
          </div>
        </div>

        <div id="planned-fields" style="display:${spot?.status === 'visited' ? 'none' : 'block'}">
          <div class="form-group">
            <label class="form-label">Geplant für</label>
            <input class="form-input" name="planned_at" type="date"
              value="${esc(spot?.planned_at || '')}"/>
            <p class="lp-hint" style="margin:6px 0 0">
              Optional. Steht dann auf der Übersicht unter „Nächste Termine".</p>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Standort</label>
          <div class="setting-value">
            <div class="setting-current" id="spot-location">${locationSummary(location)}</div>
            <button type="button" class="btn btn-secondary btn-sm" id="btn-pick-location">
              ${IC.map}<span>Auf Karte wählen</span></button>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Land</label>
            <select class="form-select" name="country" style="width:100%">
              ${countryOptionsHtml(spot?.country || '')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Region oder Stadt</label>
            <input class="form-input" name="region" type="text" maxlength="120"
              value="${esc(spot?.region || '')}" placeholder="z.B. Sauerland"/>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Adresse</label>
          <input class="form-input" name="address" type="text" maxlength="300"
            value="${esc(spot?.address || '')}" placeholder="Optional"/>
        </div>

        <div id="place-fields" style="display:${kinds.is_place ? 'block' : 'none'}">
          ${placeFieldsHtml(spot)}
        </div>
        <div id="trail-fields" style="display:${kinds.is_trail ? 'block' : 'none'}">
          ${trailFieldsHtml(spot)}
        </div>

        <div class="form-group">
          <label class="form-label">Quelle</label>
          <input class="form-input" name="source_url" type="url" maxlength="500"
            value="${esc(spot?.source_url || '')}"
            placeholder="https://… — wo du die Route gefunden hast"/>
        </div>

        <div class="form-group">
          <label class="form-label">Notizen</label>
          <textarea class="form-input" name="description" rows="4" maxlength="5000"
            placeholder="Was du dir merken willst">${esc(spot?.description || '')}</textarea>
        </div>

        <div class="form-group">
          <label class="form-label" style="display:flex;align-items:center;gap:9px;cursor:pointer">
            <span class="toggle-switch">
              <input type="checkbox" name="is_favorite" ${spot?.is_favorite ? 'checked' : ''}/>
              <span class="toggle-slider"></span>
            </span>
            <span>Als Favorit immer oben anzeigen</span>
          </label>
        </div>

        <div class="form-error" id="spot-error"></div>
      </form>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-close>Abbrechen</button>
      <button class="btn btn-primary" id="spot-save">${IC.check}<span>Speichern</span></button>
    </div>
  `, ov => bind(ov));

  function locationSummary(loc)
  {
    if (loc.lat === null)
    {
      return '<span class="muted">Kein Punkt gesetzt — dann gibt es keine Entfernung</span>';
    }
    return `<span class="lp-coord-chip">${IC.pin}
      ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}</span>`;
  }

  function bind(ov)
  {
    $$('[data-close]', ov).forEach(b => b.addEventListener('click', closeModal));
    bindStarPickers(ov);

    /* Die Aspekt-Haken schalten die jeweiligen Feldgruppen ein und aus.
       Mindestens einer muss gesetzt bleiben, sonst wäre der Eintrag in keiner
       Liste sichtbar — der zuletzt verbliebene lässt sich nicht abwählen. */
    const trailBox = ov.querySelector('input[name=is_trail]');
    const placeBox = ov.querySelector('input[name=is_place]');

    const syncKindFields = changed =>
    {
      if (!trailBox.checked && !placeBox.checked)
      {
        changed.checked = true;
        toast('Mindestens eines von Wanderweg oder Ort muss gesetzt sein', 'warning');
      }
      $('#trail-fields', ov).style.display = trailBox.checked ? 'block' : 'none';
      $('#place-fields', ov).style.display = placeBox.checked ? 'block' : 'none';
    };

    trailBox.addEventListener('change', () => syncKindFields(trailBox));
    placeBox.addEventListener('change', () => syncKindFields(placeBox));

    /* Status steuert, ob Bewertung und Besuchsdatum überhaupt sinnvoll sind */
    $$('#status-tabs .status-tab', ov).forEach(tab =>
    {
      tab.addEventListener('click', () =>
      {
        $$('#status-tabs .status-tab', ov).forEach(t => t.classList.toggle('active', t === tab));
        const status = tab.dataset.status;
        const visited = status === 'visited';
        ov.querySelector('input[name=status]').value = status;
        $('#visited-fields', ov).style.display = visited ? 'block' : 'none';
        $('#planned-fields', ov).style.display = visited ? 'none' : 'block';
      });
    });

    $('#btn-pick-location', ov).addEventListener('click', () =>
    {
      openLocationPicker({
        title: 'Standort wählen',
        initial: { lat: location.lat, lng: location.lng },
        onPick: picked =>
        {
          location = {
            lat: picked.lat,
            lng: picked.lng,
            country: picked.country,
            region: picked.region,
          };
          $('#spot-location', ov).innerHTML = locationSummary(location);

          // Aus der Adresssuche kommen Land und Region mit — leere Felder füllen
          const countryField = ov.querySelector('select[name=country]');
          if (picked.country && !countryField.value)
          {
            countryField.value = picked.country;
          }
          const regionField = ov.querySelector('input[name=region]');
          if (picked.region && !regionField.value)
          {
            regionField.value = picked.region;
          }
        },
      });
    });

    $('#spot-save', ov).addEventListener('click', () => save(ov));
  }

  async function save(ov)
  {
    const form = $('#spot-form', ov);
    if (!form.reportValidity())
    {
      return;
    }
    const fd = new FormData(form);
    const errEl = $('#spot-error', ov);
    errEl.classList.remove('show');

    const payload = {
      is_trail: fd.get('is_trail') === 'on',
      is_place: fd.get('is_place') === 'on',
      name: fd.get('name'),
      status: fd.get('status'),
      rating: fd.get('rating') || null,
      visited_at: fd.get('visited_at') || null,
      planned_at: fd.get('planned_at') || null,
      country: fd.get('country') || null,
      region: fd.get('region'),
      address: fd.get('address'),
      lat: location.lat,
      lng: location.lng,
      source_url: fd.get('source_url'),
      description: fd.get('description'),
      is_favorite: fd.get('is_favorite') === 'on',
      category: fd.get('category') || null,
      length_km: fd.get('length_km') || null,
      ascent_m: fd.get('ascent_m') || null,
      duration_min: durationToMinutes(fd.get('duration_h'), fd.get('duration_m')),
      difficulty: fd.get('difficulty') || null,
    };

    try
    {
      if (spot)
      {
        await API.spots.update(spot.id, payload);
      }
      else
      {
        await API.spots.create(payload);
      }
      closeModal();
      toast(`${labels.title} gespeichert`, 'success');
      onSaved?.();
    }
    catch (err)
    {
      if (err.offline)
      {
        toastError(err);
        return;
      }
      errEl.textContent = err.message;
      errEl.classList.add('show');
    }
  }
}

function placeFieldsHtml(spot)
{
  return `
    <div class="form-group">
      <label class="form-label">Art des Ortes</label>
      <input class="form-input" name="category" type="text" maxlength="60"
        list="category-suggestions" value="${esc(spot?.category || '')}"
        placeholder="z.B. Hotel, Wald, Aussichtspunkt"/>
      <datalist id="category-suggestions">
        ${CATEGORY_SUGGESTIONS.map(c => `<option value="${c}"></option>`).join('')}
      </datalist>
    </div>`;
}

function trailFieldsHtml(spot)
{
  const hours = spot?.duration_min !== null && spot?.duration_min !== undefined
    ? Math.floor(spot.duration_min / 60) : '';
  const minutes = spot?.duration_min !== null && spot?.duration_min !== undefined
    ? spot.duration_min % 60 : '';

  return `
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Länge (km)</label>
        <input class="form-input" name="length_km" type="number" step="0.1" min="0"
          value="${spot?.length_km ?? ''}" placeholder="z.B. 12,5"/>
      </div>
      <div class="form-group">
        <label class="form-label">Höhenmeter (m)</label>
        <input class="form-input" name="ascent_m" type="number" step="1" min="0"
          value="${spot?.ascent_m ?? ''}" placeholder="z.B. 340"/>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">Dauer</label>
        <div style="display:flex;gap:6px;align-items:center">
          <input class="form-input" name="duration_h" type="number" min="0" max="999"
            value="${hours}" placeholder="Std." style="min-width:0"/>
          <input class="form-input" name="duration_m" type="number" min="0" max="59"
            value="${minutes}" placeholder="Min." style="min-width:0"/>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label">Schwierigkeit</label>
        <select class="form-select" name="difficulty" style="width:100%">
          <option value="">— keine Angabe —</option>
          ${DIFFICULTIES.map(d => `<option value="${d}"${spot?.difficulty === d
    ? ' selected' : ''}>${d.charAt(0).toUpperCase()}${d.slice(1)}</option>`).join('')}
        </select>
      </div>
    </div>`;
}

/* Stunden und Minuten getrennt eingeben, in der Datenbank steht eine Minutenzahl */
function durationToMinutes(hours, minutes)
{
  const h = Number(hours) || 0;
  const m = Number(minutes) || 0;
  const total = h * 60 + m;
  return total > 0 ? total : null;
}
