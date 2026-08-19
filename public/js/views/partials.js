/* =====================================================
   Wegzeichen – views/partials.js
   Markup-Bausteine, die mehrere Views gemeinsam nutzen
   ===================================================== */
import { IC } from '../icons.js';
import { S, countryName } from '../state.js';
import { esc } from '../dom.js';
import { groupByCountry } from '../geo.js';

/* Hinweis, dass die angezeigten Daten aus dem Offline-Cache stammen.
   Ohne ihn wären veraltete Daten von frischen nicht zu unterscheiden. */
export function offlineBannerHtml()
{
  if (!S.servedOffline)
  {
    return '';
  }
  return `<div class="offline-banner">${IC.offline}
    <span>Offline — angezeigt werden die zuletzt geladenen Daten.
      Änderungen sind erst mit Verbindung möglich.</span>
  </div>`;
}

/* Gruppiert Einträge nach Land und rendert jede Gruppe mit `cardHtml`.
   Wird von Orten, Wanderwegen und der Reiseübersicht genutzt. */
export function countryGroupsHtml(items, cardHtml)
{
  return groupByCountry(items, countryName).map(group => `
    <div class="country-group">
      <div class="country-head">
        ${IC.globe}<span>${esc(group.name)}</span>
        <span class="cnt">${group.items.length}</span>
      </div>
      <div class="entry-list">${group.items.map(cardHtml).join('')}</div>
    </div>`).join('');
}

/* Länder-Auswahlfeld. Nur Codes aus der Serverliste sind gültig — Freitext
   würde die Gruppierung nach Land zerschießen. */
export function countryOptionsHtml(selectedCode)
{
  return `<option value="">— kein Land —</option>${S.countries.map(c =>
    `<option value="${c.code}"${c.code === selectedCode ? ' selected' : ''}>
      ${esc(c.name)}</option>`).join('')}`;
}

/* Filterfeld für Länder, das nur die tatsächlich belegten Länder anbietet */
export function countryFilterHtml(items, selectedCode)
{
  const used = [...new Set(items.map(i => i.country).filter(Boolean))]
    .map(code => ({ code, name: countryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));

  return `<select class="form-select" id="filter-country">
    <option value="all">Alle Länder</option>
    ${used.map(c => `<option value="${c.code}"${c.code === selectedCode ? ' selected' : ''}>
      ${esc(c.name)}</option>`).join('')}
  </select>`;
}
