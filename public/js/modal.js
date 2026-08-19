/* =====================================================
   Wegzeichen – modal.js
   Modal-Overlays als Stapel (öffnen/schließen, ESC)

   Der Stapel ist notwendig, weil aus einem Formular heraus ein weiteres Modal
   geöffnet wird: der Standort-Picker über dem Orts- oder Reiseformular. Würde
   das zweite Modal das erste ersetzen, wären alle Eingaben verloren.
   ===================================================== */

/* Muss über .modal-overlay in style.css liegen; jede Ebene legt sich darüber */
const BASE_Z_INDEX = 200;

const stack = [];

export function openModal(html, afterRender, onClose)
{
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = String(BASE_Z_INDEX + stack.length * 10);
  overlay.innerHTML = `<div class="modal">${html}</div>`;
  document.body.appendChild(overlay);

  const entry = { overlay, onClose: onClose || null };
  stack.push(entry);

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
    document.addEventListener('keydown', handleEscape);
  }

  if (afterRender)
  {
    afterRender(overlay);
  }
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
    document.removeEventListener('keydown', handleEscape);
  }

  if (entry.onClose)
  {
    entry.onClose();
  }
}

export function closeAllModals()
{
  while (stack.length)
  {
    closeModal();
  }
}

function handleEscape(e)
{
  if (e.key === 'Escape')
  {
    closeModal();
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
      <button class="btn-modal-close" data-confirm-close>&times;</button>
    </div>
    <div class="modal-body">
      <div style="font-size:.87rem;line-height:1.6">${bodyHtml}</div>
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
