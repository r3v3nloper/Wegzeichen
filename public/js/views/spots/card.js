/* =====================================================
   Wegzeichen – views/spots/card.js
   Eine Eintragskarte für Wanderwege und Orte samt ihren Kennzahl-Chips
   ===================================================== */
import { IC } from '../../icons.js';
import { countryName } from '../../state.js';
import { esc, starsHtml } from '../../dom.js';
import { formatDate, relativeDateLabel, isPast } from '../../dates.js';
import { formatDistance, mapsDirectionsUrl } from '../../geo.js';
import { markdownToPlainText } from '../../markdown.js';
import {
  favButtonHtml, editButtonHtml, deleteButtonHtml,
} from '../entryActions.js';

function formatDuration(minutes)
{
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours)
  {
    return `${rest} min`;
  }
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

export function cardHtml(kind, spot)
{
  const navUrl = mapsDirectionsUrl(spot);
  // Zwei Zeilen Vorschau zeigen Text, keine Markdown-Zeichen
  const excerpt = markdownToPlainText(spot.description);

  return `
    <div class="entry-card${spot.is_favorite ? ' is-favorite' : ''}">
      <div class="entry-main" data-open="${spot.id}">
        <div class="entry-title-row">
          <span class="entry-title">${esc(spot.name)}</span>
          <span class="status-badge s-${spot.status}">
            ${spot.status === 'visited' ? 'War ich schon' : 'Möchte ich hin'}</span>
          ${spot.rating ? starsHtml(spot.rating) : ''}
        </div>
        ${excerpt ? `<div class="entry-body">${esc(excerpt)}</div>` : ''}
        <div class="entry-meta">${metaChipsHtml(kind, spot)}</div>
      </div>
      <div class="entry-actions">
        ${favButtonHtml(spot)}
        ${navUrl ? `<a class="btn btn-ghost btn-sm" href="${esc(navUrl)}" target="_blank"
          rel="noopener" title="Route in Google Maps"
          aria-label="Route in Google Maps">${IC.navigate}</a>` : ''}
        ${spot.source_url ? `<a class="btn btn-ghost btn-sm" href="${esc(spot.source_url)}"
          target="_blank" rel="noopener" title="Quelle öffnen"
          aria-label="Quelle öffnen">${IC.external}</a>` : ''}
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
