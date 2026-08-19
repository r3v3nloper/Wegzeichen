/* =====================================================
   Wegzeichen – attachments.js
   Anhangsliste und Öffnen eines Anhangs

   Wird vom Notiz-Editor (mit Entfernen-Knopf) und von der Leseansicht
   (nur lesend) genutzt — deshalb hier und nicht in einem der beiden.
   ===================================================== */
import { IC } from './icons.js';
import { API } from './api.js';
import { esc, formatBytes, presentBlob, toastError } from './dom.js';

export function attachmentListHtml(attachments, { withRemove = false } = {})
{
  if (!attachments?.length)
  {
    return '';
  }

  return `<div class="att-list">${attachments.map(a => `
    <div class="att-item">
      ${IC.paperclip}
      <span class="att-name" title="${esc(a.original_name)}">${esc(a.original_name)}</span>
      <span class="att-size">${formatBytes(a.size_bytes)}</span>
      <button type="button" class="btn btn-ghost btn-sm" data-att-open="${a.id}"
        title="Öffnen">${IC.download}</button>
      ${withRemove ? `<button type="button" class="btn btn-ghost btn-sm" data-att-del="${a.id}"
        title="Entfernen">${IC.trash}</button>` : ''}
    </div>`).join('')}</div>`;
}

/* Der Anhang kommt per fetch mit Authorization-Header; presentBlob entscheidet
   dann, ob er im Tab angezeigt oder heruntergeladen wird. */
export async function openAttachment(noteId, attachment)
{
  try
  {
    const blob = await API.attachments.download(noteId, attachment.id);
    presentBlob(blob, attachment.original_name, attachment.mime_type);
  }
  catch (err)
  {
    toastError(err);
  }
}

/* Verdrahtet die Öffnen-Knöpfe innerhalb von `scope` — im Modal-Stapel darf
   eine Ebene nicht die Knöpfe der darunterliegenden Ansicht anfassen. */
export function bindAttachmentOpeners(scope, noteId, attachments)
{
  scope.querySelectorAll('[data-att-open]').forEach(btn => btn.addEventListener('click', () =>
  {
    const attachment = attachments.find(a => a.id === Number(btn.dataset.attOpen));
    if (attachment)
    {
      openAttachment(noteId, attachment);
    }
  }));
}
