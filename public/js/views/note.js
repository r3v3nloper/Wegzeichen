/* =====================================================
   Wegzeichen – views/note.js
   Leseansicht einer Notiz: gerendertes Markdown über die volle Breite

   Bewusst eine eigene Ansicht und kein Modal: lange Notizen liest man nicht
   in einem 520 Pixel breiten Dialog. Der Editor bleibt das Modal.
   ===================================================== */
import { IC } from '../icons.js';
import { S } from '../state.js';
import { API } from '../api.js';
import { esc, timeAgo, plural } from '../dom.js';
import { openNoteModal } from '../modals/note.js';
import { renderMarkdown } from '../markdown.js';
import { attachmentListHtml, bindAttachmentOpeners } from '../attachments.js';
import {
  favButtonHtml, editButtonHtml, deleteButtonHtml, bindEntryActions, deletionBodyHtml,
} from './entryActions.js';
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
          ${favButtonHtml(note)}
          ${editButtonHtml(note.id)}
          ${deleteButtonHtml(note.id)}
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

  bindEntryActions({
    itemById: () => note,
    edit: () => openNoteModal(note, () => navigate('note')),
    setFavorite: API.notes.setFavorite,
    remove: API.notes.remove,
    describeDeletion: () => ({
      title: 'Notiz löschen',
      bodyHtml: deletionBodyHtml(note.title, note.attachments?.length
        ? ` und ${plural(note.attachments.length, 'Anhang', 'Anhänge')}` : ''),
    }),
    deletedMessage: 'Notiz gelöscht',
    // Der Stern lädt die Leseansicht neu; nach dem Löschen gibt es sie nicht mehr
    onDone: () => navigate('note'),
    onRemoved: () =>
    {
      S.openNoteId = null;
      S.openNote = null;
      navigate('notes');
    },
  });
}
