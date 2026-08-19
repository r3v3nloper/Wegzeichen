/* =====================================================
   Wegzeichen – modals/folders.js
   Ordner der Notizen anlegen, umbenennen und löschen
   ===================================================== */
import { IC } from '../icons.js';
import { S } from '../state.js';
import { API } from '../api.js';
import { $, $$, esc, plural, toast, toastError } from '../dom.js';
import { openModal, closeModal, openConfirm } from '../modal.js';

export function openFolderManager(onChanged)
{
  /* Eigene Kopie: die Liste wird hier mehrfach neu gezeichnet, ohne dafür
     jedes Mal die ganze View neu zu laden. */
  let folders = [...S.noteFolders];

  openModal(`
    <div class="modal-head">
      <h2>Ordner</h2>
      <button class="btn-modal-close" data-close>${IC.x}</button>
    </div>
    <div class="modal-body">
      <form id="folder-new-form" class="lp-search" style="margin-bottom:14px">
        <input class="form-input" name="name" type="text" maxlength="60" required
          placeholder="Neuer Ordner, z.B. Reisen"/>
        <button type="submit" class="btn btn-primary">${IC.plus}</button>
      </form>
      <div class="form-error" id="folder-error"></div>
      <div id="folder-list"></div>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-close>Schließen</button>
    </div>
  `, ov => bind(ov));

  function listHtml()
  {
    if (!folders.length)
    {
      return '<p class="lp-result-hint">Noch keine Ordner. Leg oben einen an.</p>';
    }
    return `<div class="att-list">${folders.map(f => `
      <div class="att-item" data-folder-row="${f.id}">
        ${IC.folder}
        <span class="att-name">${esc(f.name)}</span>
        <span class="att-size">${plural(f.noteCount, 'Notiz', 'Notizen')}</span>
        <button class="btn btn-ghost btn-sm" data-rename="${f.id}"
          title="Umbenennen">${IC.edit}</button>
        <button class="btn btn-ghost btn-sm" data-remove="${f.id}"
          title="Löschen">${IC.trash}</button>
      </div>`).join('')}</div>`;
  }

  function refresh(ov)
  {
    $('#folder-list', ov).innerHTML = listHtml();
    bindRows(ov);
  }

  function showError(ov, message)
  {
    const el = $('#folder-error', ov);
    el.textContent = message;
    el.classList.add('show');
  }

  function bindRows(ov)
  {
    $$('[data-rename]', ov).forEach(btn => btn.addEventListener('click', () =>
      startRename(ov, Number(btn.dataset.rename))));
    $$('[data-remove]', ov).forEach(btn => btn.addEventListener('click', () =>
      confirmRemove(ov, Number(btn.dataset.remove))));
  }

  /* Umbenennen direkt in der Zeile — ein weiteres Modal dafür wäre eine Ebene
     zu viel auf dem Stapel. */
  function startRename(ov, id)
  {
    const folder = folders.find(f => f.id === id);
    const row = $(`[data-folder-row="${id}"]`, ov);
    row.innerHTML = `${IC.folder}
      <input class="form-input" id="rename-input" type="text" maxlength="60"
        value="${esc(folder.name)}" style="flex:1;min-width:0"/>
      <button class="btn btn-primary btn-sm" id="rename-save">${IC.check}</button>
      <button class="btn btn-ghost btn-sm" id="rename-cancel">${IC.x}</button>`;

    const input = $('#rename-input', ov);
    input.focus();
    input.select();

    const save = async () =>
    {
      const name = input.value.trim();
      if (!name || name === folder.name)
      {
        refresh(ov);
        return;
      }
      try
      {
        const updated = await API.noteFolders.rename(id, name);
        folders = folders.map(f => (f.id === id ? updated : f))
          .sort((a, b) => a.name.localeCompare(b.name, 'de'));
        refresh(ov);
        onChanged?.();
      }
      catch (err)
      {
        refresh(ov);
        if (err.offline)
        {
          toastError(err);
          return;
        }
        showError(ov, err.message);
      }
    };

    $('#rename-save', ov).addEventListener('click', save);
    $('#rename-cancel', ov).addEventListener('click', () => refresh(ov));
    input.addEventListener('keydown', e =>
    {
      if (e.key === 'Enter')
      {
        e.preventDefault();
        save();
      }
      if (e.key === 'Escape')
      {
        // Sonst würde ESC das ganze Modal schließen
        e.stopPropagation();
        refresh(ov);
      }
    });
  }

  function confirmRemove(ov, id)
  {
    const folder = folders.find(f => f.id === id);
    const notesKept = folder.noteCount === 1
      ? 'Die Notiz darin bleibt erhalten und steht danach unter „Ohne Ordner".'
      : `Die ${folder.noteCount} Notizen darin bleiben erhalten und stehen danach
         unter „Ohne Ordner".`;

    openConfirm({
      title: 'Ordner löschen',
      bodyHtml: `<strong>${esc(folder.name)}</strong> wird gelöscht.
        ${folder.noteCount ? notesKept : ''}`,
      confirmLabel: 'Löschen',
      confirmIcon: IC.trash,
      onConfirm: async () =>
      {
        try
        {
          await API.noteFolders.remove(id);
          folders = folders.filter(f => f.id !== id);
          refresh(ov);
          toast('Ordner gelöscht', 'success');
          onChanged?.();
        }
        catch (err)
        {
          toastError(err);
        }
      },
    });
  }

  function bind(ov)
  {
    $$('[data-close]', ov).forEach(b => b.addEventListener('click', closeModal));
    refresh(ov);

    $('#folder-new-form', ov).addEventListener('submit', async e =>
    {
      e.preventDefault();
      const input = e.target.querySelector('input[name=name]');
      const name = input.value.trim();
      if (!name)
      {
        return;
      }
      $('#folder-error', ov).classList.remove('show');

      try
      {
        const created = await API.noteFolders.create(name);
        folders = [...folders, created].sort((a, b) => a.name.localeCompare(b.name, 'de'));
        input.value = '';
        refresh(ov);
        onChanged?.();
      }
      catch (err)
      {
        if (err.offline)
        {
          toastError(err);
          return;
        }
        showError(ov, err.message);
      }
    });
  }
}
