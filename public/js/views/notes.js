/* =====================================================
   Wegzeichen – views/notes.js
   Notizliste mit Suche; Favoriten stehen immer oben
   ===================================================== */
import { IC } from '../icons.js';
import { S } from '../state.js';
import {
  $, $$, esc, timeAgo, debounce, plural, renderEmptyState, toast, toastError,
} from '../dom.js';
import { API } from '../api.js';
import { openConfirm } from '../modal.js';
import { openNoteModal } from '../modals/note.js';
import { openFolderManager } from '../modals/folders.js';
import { markdownToPlainText } from '../markdown.js';
import { navigate } from '../router.js';
import { offlineBannerHtml } from './partials.js';

export function renderNotes()
{
  return `
    <div class="page-header">
      <div class="page-title-row">
        <div class="page-icon">${IC.note}</div>
        <div>
          <div class="page-title">Notizen</div>
          <div class="page-sub">${countLabel()}</div>
        </div>
      </div>
      <button class="btn btn-primary" id="btn-new-note">${IC.plus}<span>Neue Notiz</span></button>
    </div>

    ${offlineBannerHtml()}

    <div class="toolbar">
      <input class="filter-input" id="note-search" type="search"
        placeholder="Notizen durchsuchen…" value="${esc(S.noteQuery)}"/>
    </div>

    ${folderBarHtml()}

    ${S.notes.length ? listHtml() : emptyHtml()}`;
}

/* Ordner als Filterleiste. Ein Klick tauscht nur den Filter — das ist der
   „in den Ordner gehen"-Fall, um den es geht. */
function folderBarHtml()
{
  const chip = (value, label, count, extraClass = '') =>
    `<button class="folder-chip${S.noteFolder === value ? ' active' : ''}${extraClass}"
      data-folder="${value}">${esc(label)}<span class="cnt">${count}</span></button>`;

  return `<div class="folder-bar">
    ${chip('all', 'Alle', S.noteCounts.total)}
    ${S.noteFolders.map(f => chip(String(f.id), f.name, f.noteCount)).join('')}
    ${S.noteCounts.unfiled ? chip('none', 'Ohne Ordner', S.noteCounts.unfiled, ' muted') : ''}
    <button class="folder-chip folder-chip-action" id="btn-manage-folders"
      title="Ordner anlegen, umbenennen, löschen">${IC.folderPlus}</button>
  </div>`;
}

function countLabel()
{
  if (!S.noteCounts.total)
  {
    return 'Noch keine Notizen';
  }

  const shown = S.notes.length;
  const folderName = S.noteFolders.find(f => String(f.id) === S.noteFolder)?.name;
  if (folderName)
  {
    return `Ordner „${folderName}" · ${plural(shown, 'Notiz', 'Notizen')}`;
  }
  if (S.noteFolder === 'none')
  {
    return `Ohne Ordner · ${plural(shown, 'Notiz', 'Notizen')}`;
  }

  const favorites = S.notes.filter(n => n.is_favorite).length;
  const base = plural(shown, 'Notiz', 'Notizen');
  return favorites ? `${base} · ${favorites} als Favorit` : base;
}

function emptyHtml()
{
  if (S.noteQuery)
  {
    return renderEmptyState('🔍', 'Nichts gefunden',
      `Keine Notiz enthält „${esc(S.noteQuery)}".`);
  }
  if (S.noteFolder !== 'all')
  {
    return renderEmptyState('📂', 'Ordner ist leer',
      'Hier liegt noch keine Notiz.',
      `<button class="btn btn-primary" id="btn-new-note-empty">${IC.plus}
        <span>Neue Notiz hier anlegen</span></button>`);
  }
  return renderEmptyState('📝', 'Noch keine Notizen',
    'Lege die erste Notiz an — mit Anhang, wenn du magst.',
    `<button class="btn btn-primary" id="btn-new-note-empty">${IC.plus}
      <span>Neue Notiz</span></button>`);
}

function listHtml()
{
  return `<div class="entry-list">${S.notes.map(cardHtml).join('')}</div>`;
}

function cardHtml(note)
{
  /* Der Auszug zeigt Text, keine Syntax: „## Tag 1" wäre in zwei Zeilen
     Vorschau nur Rauschen. */
  const excerpt = markdownToPlainText(note.body);

  return `
    <div class="entry-card${note.is_favorite ? ' is-favorite' : ''}">
      <div class="entry-main" data-open="${note.id}">
        <div class="entry-title-row">
          <span class="entry-title">${esc(note.title)}</span>
        </div>
        ${excerpt ? `<div class="entry-body">${esc(excerpt)}</div>` : ''}
        <div class="entry-meta">
          ${note.folder_name && S.noteFolder === 'all'
    ? `<span class="entry-chip accent">${IC.folder}${esc(note.folder_name)}</span>` : ''}
          <span class="entry-chip">${IC.clock}${esc(timeAgo(note.updated_at))}</span>
          ${note.attachmentCount ? `<span class="entry-chip accent">${IC.paperclip}
            ${plural(note.attachmentCount, 'Anhang', 'Anhänge')}</span>` : ''}
        </div>
      </div>
      <div class="entry-actions">
        <button class="btn-fav${note.is_favorite ? ' on' : ''}" data-fav="${note.id}"
          title="${note.is_favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}">
          ${IC.star}</button>
        <button class="btn btn-ghost btn-sm" data-edit="${note.id}"
          title="Bearbeiten">${IC.edit}</button>
        <button class="btn btn-ghost btn-sm" data-del="${note.id}"
          title="Löschen">${IC.trash}</button>
      </div>
    </div>`;
}

export function bindNotes()
{
  const openNew = () => openNoteModal(null, () => navigate('notes'));
  $('#btn-new-note')?.addEventListener('click', openNew);
  $('#btn-new-note-empty')?.addEventListener('click', openNew);

  $$('[data-folder]').forEach(btn => btn.addEventListener('click', () =>
  {
    S.noteFolder = btn.dataset.folder;
    navigate('notes');
  }));
  $('#btn-manage-folders')?.addEventListener('click', () =>
    openFolderManager(() => navigate('notes')));

  $('#note-search').addEventListener('input', debounce(async e =>
  {
    S.noteQuery = e.target.value.trim();
    await navigate('notes');
    // Fokus zurück ins Suchfeld, weil die View neu gerendert wurde
    const field = $('#note-search');
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, 350));

  $$('[data-open]').forEach(el =>
    el.addEventListener('click', () => openForReading(Number(el.dataset.open))));
  $$('[data-edit]').forEach(btn =>
    btn.addEventListener('click', () => openForEdit(Number(btn.dataset.edit))));
  $$('[data-fav]').forEach(btn =>
    btn.addEventListener('click', () => toggleFavorite(Number(btn.dataset.fav))));
  $$('[data-del]').forEach(btn =>
    btn.addEventListener('click', () => confirmDelete(Number(btn.dataset.del))));
}

/* Ein Klick auf die Karte führt zum Lesen, der Stift daneben zum Bearbeiten —
   bei langen Notizen ist Lesen der häufigere Fall. */
function openForReading(id)
{
  S.openNoteId = id;
  navigate('note');
}

async function openForEdit(id)
{
  try
  {
    // Die Liste enthält keine Anhänge — die Detailabfrage liefert sie mit
    const note = await API.notes.get(id);
    openNoteModal(note, () => navigate('notes'));
  }
  catch (err)
  {
    toastError(err);
  }
}

async function toggleFavorite(id)
{
  const note = S.notes.find(n => n.id === id);
  try
  {
    await API.notes.update(id, {
      title: note.title,
      body: note.body,
      // Ohne folder_id würde die Zuordnung beim Umschalten verloren gehen
      folder_id: note.folder_id,
      is_favorite: !note.is_favorite,
    });
    navigate('notes');
  }
  catch (err)
  {
    toastError(err);
  }
}

function confirmDelete(id)
{
  const note = S.notes.find(n => n.id === id);
  const attachmentNote = note.attachmentCount
    ? ` und ${plural(note.attachmentCount, 'Anhang', 'Anhänge')}`
    : '';

  openConfirm({
    title: 'Notiz löschen',
    bodyHtml: `<strong>${esc(note.title)}</strong>${attachmentNote}
      wird endgültig gelöscht.`,
    confirmLabel: 'Löschen',
    confirmIcon: IC.trash,
    onConfirm: async () =>
    {
      try
      {
        await API.notes.remove(id);
        toast('Notiz gelöscht', 'success');
        navigate('notes');
      }
      catch (err)
      {
        toastError(err);
      }
    },
  });
}
