/* =====================================================
   Wegzeichen – modals/note.js
   Notiz anlegen und bearbeiten, inklusive Anhänge

   Der Inhalt ist Markdown; das Eingabefeld dafür liefert markdown-editor.js.
   ===================================================== */
import { IC } from '../icons.js';
import { S } from '../state.js';
import { API } from '../api.js';
import { $, $$, esc, plural, toast, toastError } from '../dom.js';
import { openModal, closeModal } from '../modal.js';
import { openFolderManager } from './folders.js';
import { markdownEditorHtml, bindMarkdownEditor } from '../markdown-editor.js';
import { attachmentListHtml, bindAttachmentOpeners } from '../attachments.js';

const ACCEPT = '.pdf,.doc,.docx,.odt,.txt,.md,.png,.jpg,.jpeg,.webp';

// Muss zu MAX_BODY in routes/notes.js passen
const MAX_BODY = 50000;

/* note === null legt eine neue Notiz an. onSaved wird nach jedem erfolgreichen
   Speichern gerufen, damit die Liste im Hintergrund aktuell bleibt. */
export function openNoteModal(note, onSaved)
{
  // Wird nach dem ersten Speichern gesetzt — Anhänge brauchen eine Notiz-ID
  let noteId = note?.id || null;
  let attachments = note?.attachments || [];

  /* Eine neue Notiz landet im gerade geöffneten Ordner — wer „in" Reisen ist
     und dort etwas anlegt, meint auch Reisen. */
  function initialFolderId()
  {
    if (note)
    {
      return note.folder_id ?? '';
    }
    return /^\d+$/.test(String(S.noteFolder)) ? Number(S.noteFolder) : '';
  }

  function folderOptionsHtml(selectedId)
  {
    return `<option value="">— kein Ordner —</option>${S.noteFolders.map(f =>
      `<option value="${f.id}"${f.id === selectedId ? ' selected' : ''}>
        ${esc(f.name)}</option>`).join('')}`;
  }

  const editorHtml = markdownEditorHtml({
    name: 'body',
    value: note?.body || '',
    maxlength: MAX_BODY,
    placeholder: 'Notiz… Überschriften, Listen und Hervorhebungen als Markdown',
  });

  openModal(`
    <div class="modal-head">
      <h2>${noteId ? 'Notiz bearbeiten' : 'Neue Notiz'}</h2>
      <button class="btn-modal-close" data-close aria-label="Schließen" title="Schließen">${IC.x}</button>
    </div>
    <div class="modal-body">
      <form id="note-form">
        <div class="form-group">
          <label class="form-label">Titel</label>
          <input class="form-input" name="title" type="text" required maxlength="200"
            value="${esc(note?.title || '')}" placeholder="Worum geht es?"/>
        </div>
        <div class="form-group">
          <label class="form-label">Ordner</label>
          <div class="lp-search">
            <select class="form-select u-grow" name="folder_id" id="note-folder">
              ${folderOptionsHtml(initialFolderId())}
            </select>
            <button type="button" class="btn btn-ghost" id="btn-note-folders"
              title="Ordner verwalten" aria-label="Ordner verwalten">${IC.folderPlus}</button>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Inhalt</label>
          ${editorHtml}
        </div>
        <div class="form-group">
          <label class="form-label toggle-label">
            <span class="toggle-switch">
              <input type="checkbox" name="is_favorite" ${note?.is_favorite ? 'checked' : ''}/>
              <span class="toggle-slider"></span>
            </span>
            <span>Als Favorit immer oben anzeigen</span>
          </label>
        </div>
        <div class="form-error" id="note-error"></div>
      </form>

      <div class="section">
        <div class="section-head">
          <div class="section-title">${IC.paperclip}<span>Anhänge</span></div>
        </div>
        <div id="att-area">${attachmentsAreaHtml()}</div>
      </div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-close>Abbrechen</button>
      <button class="btn btn-primary" id="note-save">${IC.check}<span>Speichern</span></button>
    </div>
  `, ov => bind(ov));

  function attachmentsAreaHtml()
  {
    if (!noteId)
    {
      return '<p class="lp-result-hint">Anhänge können nach dem ersten Speichern '
        + 'hinzugefügt werden.</p>';
    }
    return `
      ${attachmentListHtml(attachments, { withRemove: true })}
      <label class="att-drop" id="att-drop">
        ${IC.plus}<span>Datei wählen oder hierher ziehen</span>
        <input type="file" id="att-input" multiple accept="${ACCEPT}"/>
      </label>
      <p class="lp-hint hint-below">
        PDF, Word, ODT, Text, Markdown und Bilder — max. 10 MB je Datei,
        5 Dateien pro Notiz.</p>`;
  }

  function refreshAttachments(ov)
  {
    $('#att-area', ov).innerHTML = attachmentsAreaHtml();
    bindAttachments(ov);
  }

  /* Alle Selektoren bleiben auf das eigene Overlay begrenzt: über dieser Ebene
     kann der Ordner-Verwalter liegen, darunter die Leseansicht mit ihrer
     eigenen Anhangsliste. */
  function bindAttachments(ov)
  {
    if (!noteId)
    {
      return;
    }

    const input = $('#att-input', ov);
    const drop = $('#att-drop', ov);

    input?.addEventListener('change', () => uploadFiles(ov, input.files));

    ['dragenter', 'dragover'].forEach(type =>
      drop?.addEventListener(type, e =>
      {
        e.preventDefault();
        drop.classList.add('over');
      }));
    ['dragleave', 'drop'].forEach(type =>
      drop?.addEventListener(type, () => drop.classList.remove('over')));
    drop?.addEventListener('drop', e =>
    {
      e.preventDefault();
      uploadFiles(ov, e.dataTransfer.files);
    });

    bindAttachmentOpeners(ov, noteId, attachments);
    $$('[data-att-del]', ov).forEach(btn =>
      btn.addEventListener('click', () => removeAttachment(ov, Number(btn.dataset.attDel))));
  }

  async function uploadFiles(ov, fileList)
  {
    if (!fileList?.length)
    {
      return;
    }
    try
    {
      attachments = await API.attachments.upload(noteId, fileList);
      refreshAttachments(ov);
      toast(`${plural(fileList.length, 'Anhang', 'Anhänge')} hinzugefügt`, 'success');
      onSaved?.();
    }
    catch (err)
    {
      toastError(err);
    }
  }

  async function removeAttachment(ov, attachmentId)
  {
    try
    {
      await API.attachments.remove(noteId, attachmentId);
      attachments = attachments.filter(a => a.id !== attachmentId);
      refreshAttachments(ov);
      onSaved?.();
    }
    catch (err)
    {
      toastError(err);
    }
  }

  function bind(ov)
  {
    /* Markdown braucht Platz — der Standarddialog ist für längere Notizen
       zu schmal. */
    $('.modal', ov).classList.add('modal-wide');

    $$('[data-close]', ov).forEach(b => b.addEventListener('click', closeModal));
    bindMarkdownEditor(ov);
    bindAttachments(ov);

    /* Der Ordner-Verwalter legt sich als weitere Ebene darüber; danach muss die
       Auswahlliste die neuen Ordner kennen, ohne die getroffene Wahl zu verlieren. */
    $('#btn-note-folders', ov).addEventListener('click', () =>
    {
      const select = $('#note-folder', ov);
      const chosen = select.value;
      openFolderManager(async () =>
      {
        S.noteFolders = (await API.noteFolders.getAll()).folders;
        select.innerHTML = folderOptionsHtml(chosen === '' ? '' : Number(chosen));
      });
    });

    $('#note-save', ov).addEventListener('click', async () =>
    {
      const form = $('#note-form', ov);
      if (!form.reportValidity())
      {
        return;
      }
      const fd = new FormData(form);
      const payload = {
        title: fd.get('title'),
        body: fd.get('body'),
        is_favorite: fd.get('is_favorite') === 'on',
        folder_id: fd.get('folder_id') || null,
      };
      const errEl = $('#note-error', ov);
      errEl.classList.remove('show');

      try
      {
        const saved = noteId
          ? await API.notes.update(noteId, payload)
          : await API.notes.create(payload);

        onSaved?.(saved);

        if (noteId)
        {
          closeModal();
          toast('Notiz gespeichert', 'success');
          return;
        }

        /* Neue Notiz: Modal offen halten und in den Bearbeiten-Zustand wechseln,
           damit direkt Anhänge angefügt werden können */
        noteId = saved.id;
        attachments = saved.attachments || [];
        $('.modal-head h2', ov).textContent = 'Notiz bearbeiten';
        refreshAttachments(ov);
        toast('Notiz angelegt — Anhänge sind jetzt möglich', 'success');
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
    });
  }
}
