/* =====================================================
   Wegzeichen – modal.js
   Modal-Overlays als Stapel (öffnen/schließen, ESC, Fokus)

   Der Stapel ist notwendig, weil aus einem Formular heraus ein weiteres Modal
   geöffnet wird: der Standort-Picker über dem Orts- oder Reiseformular. Würde
   das zweite Modal das erste ersetzen, wären alle Eingaben verloren.

   Jede Ebene ist ein echter Dialog: `role="dialog"` mit `aria-modal`, benannt
   über die eigene Überschrift. Der Fokus wandert beim Öffnen hinein, bleibt mit
   Tab darin und kehrt beim Schließen zum auslösenden Element zurück. Ohne das
   Letzte steht der Fokus danach am Seitenanfang und wer mit der Tastatur
   arbeitet, muss sich jedes Mal neu durch die Seite hangeln.
   ===================================================== */

/* Muss über .modal-overlay in style.css liegen; jede Ebene legt sich darüber */
const BASE_Z_INDEX = 200;

/* Reihenfolge wie im Dokument. `[tabindex="-1"]` ist programmatisch
   fokussierbar, aber nicht per Tab erreichbar — und gehört deshalb nicht dazu. */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]),'
  + ' select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const stack = [];

/* Fortlaufend, damit mehrere Ebenen nicht dieselbe Überschrift-ID benutzen */
let titleCounter = 0;

/* offsetParent ist null für alles Ausgeblendete — etwa das Textfeld des
   Markdown-Editors, während die Vorschau sichtbar ist. */
function focusableIn(overlay)
{
  return [...overlay.querySelectorAll(FOCUSABLE)].filter(el => el.offsetParent !== null);
}

function labelDialog(dialog)
{
  const heading = dialog.querySelector('.modal-head h2');
  if (!heading)
  {
    return;
  }
  if (!heading.id)
  {
    titleCounter += 1;
    heading.id = `modal-title-${titleCounter}`;
  }
  dialog.setAttribute('aria-labelledby', heading.id);
}

/* Der Fokus geht in das erste Eingabefeld, nicht auf einen Knopf: in einem
   Bestätigungsdialog wäre das „Löschen". Gibt es kein Feld, bekommt der Dialog
   selbst den Fokus — dadurch liest ein Screenreader seinen Titel vor. */
function focusFirst(dialog)
{
  const field = [...dialog.querySelectorAll(
    'input:not([type="file"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
  )].find(el => el.offsetParent !== null);

  (field || dialog).focus();
}

export function openModal(html, afterRender, onClose)
{
  // Vor dem Öffnen merken, damit der Fokus nachher dorthin zurückkann
  const trigger = document.activeElement;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = String(BASE_Z_INDEX + stack.length * 10);
  overlay.innerHTML = `<div class="modal" role="dialog" aria-modal="true" tabindex="-1">
    ${html}</div>`;
  document.body.appendChild(overlay);

  const dialog = overlay.firstElementChild;
  stack.push({ overlay, dialog, trigger, onClose: onClose || null });

  overlay.addEventListener('click', e =>
  {
    // Nur der Klick auf den Hintergrund schließt, nicht auf den Inhalt
    if (e.target === overlay)
    {
      closeModal();
    }
  });

  if (stack.length === 1)
  {
    document.addEventListener('keydown', handleKeydown);
  }

  labelDialog(dialog);

  if (afterRender)
  {
    afterRender(overlay);
  }

  // Nach afterRender: dort kommt bei manchen Modals noch Inhalt hinzu
  focusFirst(dialog);
}

/* Schließt die oberste Ebene */
export function closeModal()
{
  const entry = stack.pop();
  if (!entry)
  {
    return;
  }
  entry.overlay.remove();

  if (!stack.length)
  {
    document.removeEventListener('keydown', handleKeydown);
  }

  /* Das auslösende Element kann verschwunden sein — viele Aufrufer zeichnen die
     Ansicht nach dem Speichern neu. Dann übernimmt die Ebene darunter. */
  if (entry.trigger?.isConnected)
  {
    entry.trigger.focus();
  }
  else if (stack.length)
  {
    stack[stack.length - 1].dialog.focus();
  }

  if (entry.onClose)
  {
    entry.onClose();
  }
}

function handleKeydown(e)
{
  if (e.key === 'Escape')
  {
    closeModal();
    return;
  }
  if (e.key === 'Tab')
  {
    trapTab(e);
  }
}

/* Hält den Tabulator in der obersten Ebene. Ohne das wandert der Fokus hinter
   dem Overlay durch die Seite, während der Dialog noch offen ist — sichtbar
   ist er dann nirgends. */
function trapTab(e)
{
  const top = stack[stack.length - 1];
  if (!top)
  {
    return;
  }

  const items = focusableIn(top.overlay);
  if (!items.length)
  {
    e.preventDefault();
    top.dialog.focus();
    return;
  }

  const first = items[0];
  const last = items[items.length - 1];
  const active = document.activeElement;
  const outside = !top.overlay.contains(active);

  if (e.shiftKey && (outside || active === first))
  {
    e.preventDefault();
    last.focus();
  }
  else if (!e.shiftKey && (outside || active === last))
  {
    e.preventDefault();
    first.focus();
  }
}

/* Bestätigungsdialog für zerstörende Aktionen. Liegt hier, weil Notizen, Orte,
   Wanderwege, Reisen und die Nutzerverwaltung ihn identisch brauchen.
   `bodyHtml` wird als HTML eingesetzt — Aufrufer müssen selbst escapen. */
export function openConfirm({ title, bodyHtml, confirmLabel, confirmIcon = '', onConfirm })
{
  openModal(`
    <div class="modal-head">
      <h2>${title}</h2>
      <button class="btn-modal-close" data-confirm-close
        aria-label="Schließen" title="Schließen">&times;</button>
    </div>
    <div class="modal-body">
      <div class="confirm-text">${bodyHtml}</div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-confirm-close>Abbrechen</button>
      <button class="btn btn-danger" data-confirm-ok>${confirmIcon}<span>${confirmLabel}</span></button>
    </div>`, ov =>
  {
    ov.querySelectorAll('[data-confirm-close]')
      .forEach(b => b.addEventListener('click', closeModal));
    ov.querySelector('[data-confirm-ok]').addEventListener('click', async () =>
    {
      closeModal();
      await onConfirm();
    });
  });
}
