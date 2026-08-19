/* =====================================================
   Wegzeichen – views/note.js
   Leseansicht einer Notiz: gerendertes Markdown über die volle Breite

   Bewusst eine eigene Ansicht und kein Modal: lange Notizen liest man nicht
   in einem 520 Pixel breiten Dialog. Der Editor bleibt das Modal.
   ===================================================== */
import { IC } from '../icons.js';
import { S } from '../state.js';
import { API } from '../api.js';
import { $, $$, esc, timeAgo, plural, toast, toastError } from '../dom.js';
import { openConfirm } from '../modal.js';
import { openNoteModal } from '../modals/note.js';
import { renderMarkdown } from '../markdown.js';
import { attachmentListHtml, bindAttachmentOpeners } from '../attachments.js';
import { navigate } from '../router.js';
import { offlineBannerHtml } from './partials.js';

export function renderNote()
{
  const note = S.openNote;
  if (!note)
  {
    return '';
  }

  return `
    <div class="note-read">
      <button class="btn btn-ghost btn-sm note-back" data-nav="notes">
        ${IC.chevL}<span>Alle Notizen</span></button>

      ${offlineBannerHtml()}

      <div class="page-header note-read-head">
        <div class="page-title-row">
          <div class="page-icon">${IC.note}</div>
          <div>
            <div class="page-title">${esc(note.title)}</div>
            <div class="page-sub">${metaLine(note)}</div>
          </div>
        </div>
        <div class="entry-actions">
          <button class="btn-fav${note.is_favorite ? ' on' : ''}" id="note-fav"
            title="${note.is_favorite ? 'Favorit entfernen' : 'Als Favorit markieren'}">
            ${IC.star}</button>
          <button class="btn btn-primary btn-sm" id="note-edit">
            ${IC.edit}<span>Bearbeiten</span></button>
          <button class="btn btn-ghost btn-sm" id="note-del" title="Löschen">${IC.trash}</button>
        </div>
      </div>

      ${note.body
    ? `<article class="md-body note-body">${renderMarkdown(note.body)}</article>`
    : '<p class="md-empty">Diese Notiz hat noch keinen Inhalt.</p>'}

      ${note.attachments?.length ? `
        <div class="section note-atts">
          <div class="section-head">
            <div class="section-title">${IC.paperclip}<span>Anhänge</span></div>
          </div>
          ${attachmentListHtml(note.attachments)}
        </div>` : ''}
    </div>`;
}

function metaLine(note)
{
  const parts = [];
  if (note.folder_name)
  {
    parts.push(esc(note.folder_name));
  }
  parts.push(`geändert ${esc(timeAgo(note.updated_at))}`);
  if (note.attachments?.length)
  {
    parts.push(plural(note.attachments.length, 'Anhang', 'Anhänge'));
  }
  return parts.join(' · ');
}

export function bindNote()
{
  const note = S.openNote;
  if (!note)
  {
    return;
  }

  bindAttachmentOpeners(document, note.id, note.attachments || []);

  $('#note-edit')?.addEventListener('click', () =>
    openNoteModal(note, () => navigate('note')));

  $('#note-fav')?.addEventListener('click', async () =>
  {
    try
    {
      await API.notes.update(note.id, {
        title: note.title,
        body: note.body,
        // Ohne folder_id würde die Zuordnung beim Umschalten verloren gehen
        folder_id: note.folder_id,
        is_favorite: !note.is_favorite,
      });
      navigate('note');
    }
    catch (err)
    {
      toastError(err);
    }
  });

  $('#note-del')?.addEventListener('click', () => openConfirm({
    title: 'Notiz löschen',
    bodyHtml: `<strong>${esc(note.title)}</strong>${note.attachments?.length
      ? ` und ${plural(note.attachments.length, 'Anhang', 'Anhänge')}` : ''}
      wird endgültig gelöscht.`,
    confirmLabel: 'Löschen',
    confirmIcon: IC.trash,
    onConfirm: async () =>
    {
      try
      {
        await API.notes.remove(note.id);
        S.openNote = null;
        toast('Notiz gelöscht', 'success');
        navigate('notes');
      }
      catch (err)
      {
        toastError(err);
      }
    },
  }));

  /* Aufgabenlisten sind Anzeige, nicht Eingabe — ohne dieses Abschalten
     ließen sich Häkchen setzen, die niemand speichert. */
  $$('.note-body input[type="checkbox"]').forEach(box =>
  {
    box.disabled = true;
  });
}
