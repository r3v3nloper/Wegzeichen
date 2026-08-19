/* =====================================================
   Wegzeichen – dom.js
   DOM-Helfer, Formatierung, Toast
   ===================================================== */
import { IC } from './icons.js';

export const $ = (sel, ctx) => (ctx || document).querySelector(sel);
export const $$ = (sel, ctx) => [...(ctx || document).querySelectorAll(sel)];

export function esc(str)
{
  if (str === 0)
  {
    return '0';
  }
  if (!str)
  {
    return '';
  }
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function timeAgo(dateStr)
{
  if (!dateStr)
  {
    return '';
  }
  const diff = Math.floor((Date.now() - new Date(dateStr)) / 1000);
  if (diff < 60)
  {
    return 'Gerade eben';
  }
  if (diff < 3600)
  {
    return `vor ${Math.floor(diff / 60)} Min.`;
  }
  if (diff < 86400)
  {
    return `vor ${Math.floor(diff / 3600)} Std.`;
  }
  if (diff < 604800)
  {
    return `vor ${Math.floor(diff / 86400)} Tagen`;
  }
  return new Date(dateStr).toLocaleDateString('de-DE');
}

/* Zählwort mit passender Form — deutsche Plurale sind zu unregelmäßig, um sie
   mit einem angehängten „n" zu erschlagen ("1 Notiz" vs. "2 Notizen") */
export function plural(count, singular, pluralForm)
{
  return `${count} ${count === 1 ? singular : pluralForm}`;
}

export function formatBytes(bytes)
{
  if (!Number.isFinite(bytes))
  {
    return '';
  }
  if (bytes < 1024)
  {
    return `${bytes} B`;
  }
  if (bytes < 1024 * 1024)
  {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

/* Typen, die der Browser selbst anzeigen kann — die landen in einem neuen Tab
   statt im Download-Ordner. Alles andere wird heruntergeladen. */
const VIEWABLE_TYPES = new Set(['application/pdf', 'image/png', 'image/jpeg', 'image/webp',
  'text/plain', 'text/markdown']);

/* Anhänge werden per fetch mit Authorization-Header geladen; ein <a href> kann
   diesen Header nicht mitsenden. Deshalb der Umweg über eine Blob-URL. */
export function presentBlob(blob, filename, mimeType)
{
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  if (VIEWABLE_TYPES.has(mimeType))
  {
    link.target = '_blank';
    link.rel = 'noopener';
  }
  else
  {
    link.download = filename;
  }
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Der Tab braucht die URL noch einen Moment, bevor sie freigegeben wird
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

export function debounce(fn, ms)
{
  let t;
  return (...a) =>
  {
    clearTimeout(t);
    t = setTimeout(() => fn(...a), ms);
  };
}

/* Nur-Lese-Darstellung einer Bewertung */
export function starsHtml(rating, small = true)
{
  if (!rating)
  {
    return '';
  }
  const stars = Array.from({ length: 5 }, (_, i) =>
    `<span class="star-btn${small ? ' sm' : ''}${i < rating ? ' on' : ''}">${IC.star}</span>`
  ).join('');
  return `<div class="stars stars-ro" title="${rating} von 5">${stars}</div>`;
}

/* Anklickbare Bewertung für Formulare. Der Wert landet im versteckten Input,
   damit das umgebende Formular ihn wie ein normales Feld auslesen kann. */
export function starPickerHtml(name, value)
{
  const buttons = Array.from({ length: 5 }, (_, i) =>
    `<button type="button" class="star-btn${i < value ? ' on' : ''}"
      data-star="${i + 1}" aria-label="${i + 1} von 5 Sternen">${IC.star}</button>`).join('');
  return `<div class="stars star-picker" data-star-picker="${name}">
    ${buttons}
    <button type="button" class="btn-star-clear" data-star="0"
      title="Bewertung entfernen">${IC.x}</button>
    <input type="hidden" name="${name}" value="${value || ''}"/>
  </div>`;
}

/* Verdrahtet alle Sterne-Picker innerhalb eines Containers */
export function bindStarPickers(ctx)
{
  $$('[data-star-picker]', ctx).forEach(picker =>
  {
    picker.addEventListener('click', e =>
    {
      const btn = e.target.closest('[data-star]');
      if (!btn)
      {
        return;
      }
      const value = Number(btn.dataset.star);
      picker.querySelector('input').value = value || '';
      $$('.star-btn', picker).forEach((s, i) => s.classList.toggle('on', i < value));
    });
  });
}

export function renderEmptyState(emoji, title, msg, btn = '')
{
  return `<div class="empty-state">
    <div class="empty-state-emoji">${emoji}</div>
    ${title ? `<h3>${title}</h3>` : ''}
    ${msg ? `<p>${msg}</p>` : ''}
    ${btn}
  </div>`;
}

export function bindStatusTabs(selector, dataKey, onChange)
{
  $$(selector).forEach(t =>
  {
    t.addEventListener('click', () =>
    {
      $$(selector).forEach(x => x.classList.toggle('active', x === t));
      onChange(t.dataset[dataKey]);
    });
  });
}

export function toast(msg, type = 'info', title = '')
{
  const iconMap = { success: IC.check, error: IC.x, warning: IC.warn, info: IC.info, offline: IC.offline };
  const t = document.createElement('div');
  t.className = `toast t-${type === 'offline' ? 'warning' : type}`;
  t.innerHTML = `<div class="toast-icon">${iconMap[type] || IC.info}</div>
    <div class="toast-content">
      ${title ? `<div class="toast-title">${esc(title)}</div>` : ''}
      <div class="toast-msg">${esc(msg)}</div>
    </div>`;
  document.getElementById('toasts').prepend(t);
  setTimeout(() =>
  {
    t.style.opacity = '0';
    t.style.transform = 'translateX(120%)';
    t.style.transition = 'all .2s';
    setTimeout(() => t.remove(), 220);
  }, 3500);
}

/* Übersetzt einen Fehler aus API.js in eine Meldung. Offline-Schreibversuche
   bekommen einen eigenen Hinweis, damit klar ist dass nichts gespeichert wurde. */
export function toastError(err)
{
  if (err && err.offline)
  {
    toast('Keine Verbindung — Änderung wurde nicht gespeichert', 'offline', 'Offline');
    return;
  }
  toast(err?.message || 'Unbekannter Fehler', 'error');
}
