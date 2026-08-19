/* =====================================================
   Wegzeichen – modals/trip.js
   Reise anlegen und bearbeiten, inklusive Etappen-Editor
   ===================================================== */
import { IC } from '../icons.js';
import { S, allSpots } from '../state.js';
import { API } from '../api.js';
import { $, $$, esc, starPickerHtml, bindStarPickers, toast, toastError } from '../dom.js';
import { openModal, closeModal } from '../modal.js';
import { markdownEditorHtml, bindMarkdownEditor } from '../markdown-editor.js';
import { openLocationPicker } from './location-picker.js';
import { countryOptionsHtml } from '../views/partials.js';

// Muss zu MAX_SUMMARY in routes/trips.js passen
const MAX_SUMMARY = 20000;

export function openTripModal(trip, onSaved)
{
  /* Etappen liegen als Array im Speicher und werden vor jeder Umsortierung aus
     dem DOM zurückgelesen — sonst wären Eingaben beim Neuzeichnen verloren. */
  let stages = (trip?.stages || []).map(s => ({
    day_from: s.day_from ?? '',
    day_to: s.day_to ?? '',
    location_name: s.location_name || '',
    notes: s.notes || '',
    lat: s.lat ?? null,
    lng: s.lng ?? null,
    spot_id: s.spot_id ?? '',
  }));

  openModal(`
    <div class="modal-head">
      <h2>${trip ? 'Reise bearbeiten' : 'Neue Reise'}</h2>
      <button class="btn-modal-close" data-close aria-label="Schließen" title="Schließen">${IC.x}</button>
    </div>
    <div class="modal-body">
      <form id="trip-form">
        <div class="form-group">
          <label class="form-label">Titel</label>
          <input class="form-input" name="title" type="text" required maxlength="200"
            value="${esc(trip?.title || '')}" placeholder="z.B. Tour durch Italien"/>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Von</label>
            <input class="form-input" name="start_date" type="date"
              value="${esc(trip?.start_date || '')}"/>
          </div>
          <div class="form-group">
            <label class="form-label">Bis</label>
            <input class="form-input" name="end_date" type="date"
              value="${esc(trip?.end_date || '')}"/>
          </div>
        </div>

        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Land</label>
            <select class="form-select u-full" name="country">
              ${countryOptionsHtml(trip?.country || '')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Wie war es?</label>
            ${starPickerHtml('rating', trip?.rating || 0)}
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Bilder in der Cloud</label>
          <input class="form-input" name="photos_url" type="url" maxlength="500"
            value="${esc(trip?.photos_url || '')}"
            placeholder="https://… — Link zum Album, keine Bilder hier"/>
        </div>

        <div class="form-group">
          <label class="form-label">Wie es war</label>
          ${markdownEditorHtml({
    name: 'summary',
    value: trip?.summary || '',
    rows: 12,
    maxlength: MAX_SUMMARY,
    placeholder: 'Der Reisebericht — Markdown ist erlaubt',
  })}
        </div>

        <div class="form-group">
          <label class="form-label toggle-label">
            <span class="toggle-switch">
              <input type="checkbox" name="is_favorite" ${trip?.is_favorite ? 'checked' : ''}/>
              <span class="toggle-slider"></span>
            </span>
            <span>Als Favorit immer oben anzeigen</span>
          </label>
        </div>

        <div class="form-error" id="trip-error"></div>
      </form>

      <div class="section">
        <div class="section-head">
          <div class="section-title">${IC.route}<span>Route</span></div>
          <button class="btn btn-secondary btn-sm" id="btn-add-stage">
            ${IC.plus}<span>Etappe</span></button>
        </div>
        <div id="stage-area"></div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-close>Abbrechen</button>
      <button class="btn btn-primary" id="trip-save">${IC.check}<span>Speichern</span></button>
    </div>
  `, ov => bind(ov));

  function stageAreaHtml()
  {
    if (!stages.length)
    {
      return `<p class="lp-result-hint">Noch keine Etappen. „Tag 1–3 in Rom, dann weiter
        nach Florenz" wird hier zu einzelnen Etappen.</p>`;
    }
    return `<div class="stage-list">${stages.map(stageRowHtml).join('')}</div>`;
  }

  function stageRowHtml(stage, index)
  {
    return `
      <div class="stage-item" data-stage="${index}">
        <div class="stage-main">
          <div class="form-row stage-row">
            <div class="u-inline-row">
              <input class="form-input u-shrink" data-field="day_from" type="number" min="1" max="3650"
                value="${esc(stage.day_from)}" placeholder="Tag"/>
              <span class="text-muted">bis</span>
              <input class="form-input u-shrink" data-field="day_to" type="number" min="1" max="3650"
                value="${esc(stage.day_to)}" placeholder="Tag"/>
            </div>
            <select class="form-select u-full" data-field="spot_id">
              <option value="">— kein gespeicherter Ort —</option>
              ${spotOptionsHtml(stage.spot_id)}
            </select>
          </div>
          <input class="form-input stage-location" data-field="location_name" type="text" required
            maxlength="200" value="${esc(stage.location_name)}"
            placeholder="Wo? z.B. Rom"/>
          <textarea class="form-input" data-field="notes" rows="2" maxlength="2000"
            placeholder="Notiz zur Etappe">${esc(stage.notes)}</textarea>
          <div class="stage-pin-row">
            <button type="button" class="btn btn-ghost btn-sm" data-stage-pin="${index}">
              ${IC.pin}<span>${stage.lat === null ? 'Punkt setzen' : 'Punkt ändern'}</span></button>
            ${stage.lat === null ? '' : `<span class="lp-coord-chip">${IC.pin}
              ${Number(stage.lat).toFixed(4)}, ${Number(stage.lng).toFixed(4)}</span>`}
          </div>
        </div>
        <div class="stage-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-stage-up="${index}"
            ${index === 0 ? 'disabled' : ''} title="Nach oben" aria-label="Etappe nach oben">${IC.arrowUp}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-stage-down="${index}"
            ${index === stages.length - 1 ? 'disabled' : ''} title="Nach unten" aria-label="Etappe nach unten">
            ${IC.arrowDown}</button>
          <button type="button" class="btn btn-ghost btn-sm" data-stage-del="${index}"
            title="Etappe entfernen" aria-label="Etappe entfernen">${IC.trash}</button>
        </div>
      </div>`;
  }

  /* Alle eigenen Orte und Wanderwege als Auswahl — so muss ein bereits
     gespeichertes Hotel nicht erneut eingetippt werden */
  function spotOptionsHtml(selectedId)
  {
    return allSpots()
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .map(s => `<option value="${s.id}"${String(s.id) === String(selectedId)
        ? ' selected' : ''}>${esc(s.name)}</option>`).join('');
  }

  /* Liest die Eingabefelder in das Array zurück, damit Umsortieren, Löschen
     und Speichern immer den aktuellen Stand sehen */
  function collectStages()
  {
    $$('[data-stage]').forEach(row =>
    {
      const index = Number(row.dataset.stage);
      const read = field => $(`[data-field="${field}"]`, row).value;
      stages[index] = {
        ...stages[index],
        day_from: read('day_from'),
        day_to: read('day_to'),
        location_name: read('location_name'),
        notes: read('notes'),
        spot_id: read('spot_id'),
      };
    });
  }

  function refreshStages()
  {
    $('#stage-area').innerHTML = stageAreaHtml();
    bindStages();
  }

  function bindStages()
  {
    $$('[data-stage-up]').forEach(btn => btn.addEventListener('click', () =>
    {
      const i = Number(btn.dataset.stageUp);
      collectStages();
      [stages[i - 1], stages[i]] = [stages[i], stages[i - 1]];
      refreshStages();
    }));

    $$('[data-stage-down]').forEach(btn => btn.addEventListener('click', () =>
    {
      const i = Number(btn.dataset.stageDown);
      collectStages();
      [stages[i + 1], stages[i]] = [stages[i], stages[i + 1]];
      refreshStages();
    }));

    $$('[data-stage-del]').forEach(btn => btn.addEventListener('click', () =>
    {
      collectStages();
      stages.splice(Number(btn.dataset.stageDel), 1);
      refreshStages();
    }));

    $$('[data-stage-pin]').forEach(btn => btn.addEventListener('click', () =>
    {
      const i = Number(btn.dataset.stagePin);
      collectStages();
      openLocationPicker({
        title: 'Punkt der Etappe',
        initial: { lat: stages[i].lat, lng: stages[i].lng },
        onPick: picked =>
        {
          stages[i].lat = picked.lat;
          stages[i].lng = picked.lng;
          if (picked.label && !stages[i].location_name)
          {
            stages[i].location_name = picked.label;
          }
          refreshStages();
        },
      });
    }));

    /* Auswahl eines gespeicherten Ortes übernimmt Name und Koordinaten */
    $$('[data-field="spot_id"]').forEach(select => select.addEventListener('change', () =>
    {
      const row = select.closest('[data-stage]');
      const index = Number(row.dataset.stage);
      collectStages();

      const spot = allSpots().find(s => String(s.id) === select.value);
      if (spot)
      {
        stages[index].location_name = spot.name;
        stages[index].lat = spot.lat;
        stages[index].lng = spot.lng;
      }
      refreshStages();
    }));
  }

  function bind(ov)
  {
    // Der Reisebericht ist Markdown und braucht Platz — wie im Notiz-Editor
    $('.modal', ov).classList.add('modal-wide');

    $$('[data-close]', ov).forEach(b => b.addEventListener('click', closeModal));
    bindStarPickers(ov);
    bindMarkdownEditor(ov);
    refreshStages();

    $('#btn-add-stage', ov).addEventListener('click', () =>
    {
      collectStages();
      stages.push({
        day_from: '', day_to: '', location_name: '', notes: '',
        lat: null, lng: null, spot_id: '',
      });
      refreshStages();
    });

    $('#trip-save', ov).addEventListener('click', () => save(ov));
  }

  async function save(ov)
  {
    const form = $('#trip-form', ov);
    if (!form.reportValidity())
    {
      return;
    }
    collectStages();

    const incomplete = stages.find(s => !s.location_name.trim());
    if (incomplete)
    {
      toast('Jede Etappe braucht einen Ort', 'warning');
      return;
    }

    const fd = new FormData(form);
    const errEl = $('#trip-error', ov);
    errEl.classList.remove('show');

    const payload = {
      title: fd.get('title'),
      summary: fd.get('summary'),
      country: fd.get('country') || null,
      start_date: fd.get('start_date') || null,
      end_date: fd.get('end_date') || null,
      rating: fd.get('rating') || null,
      photos_url: fd.get('photos_url'),
      is_favorite: fd.get('is_favorite') === 'on',
      stages: stages.map(s => ({
        day_from: s.day_from === '' ? null : s.day_from,
        day_to: s.day_to === '' ? null : s.day_to,
        location_name: s.location_name,
        notes: s.notes,
        lat: s.lat,
        lng: s.lng,
        spot_id: s.spot_id === '' ? null : s.spot_id,
      })),
    };

    try
    {
      if (trip)
      {
        await API.trips.update(trip.id, payload);
      }
      else
      {
        await API.trips.create(payload);
      }
      closeModal();
      toast('Reise gespeichert', 'success');
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
