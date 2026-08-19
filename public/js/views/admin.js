/* =====================================================
   Wegzeichen – views/admin.js
   Nutzerverwaltung für Administratoren
   ===================================================== */
import { IC } from '../icons.js';
import { S } from '../state.js';
import { $, $$, esc, timeAgo, toast, toastError, renderEmptyState } from '../dom.js';
import { API } from '../api.js';
import { openModal, closeModal, openConfirm } from '../modal.js';
import { navigate } from '../router.js';

export function renderAdmin()
{
  return `
    <div class="page-header">
      <div class="page-title-row">
        <div class="page-icon admin-icon">${IC.shield}</div>
        <div>
          <div class="page-title">Admin</div>
          <div class="page-sub">${S.adminUsers.length} Nutzerkonten</div>
        </div>
      </div>
    </div>
    ${S.adminUsers.length ? tableHtml() : renderEmptyState(
    '👥', 'Keine weiteren Nutzer', 'Außer dir gibt es noch keine Konten.')}`;
}

function tableHtml()
{
  return `<div class="admin-table-wrap">
    <table class="admin-table">
      <thead>
        <tr>
          <th>Nutzer</th><th>Notizen</th><th>Orte &amp; Wege</th>
          <th>Reisen</th><th>Registriert</th><th></th>
        </tr>
      </thead>
      <tbody>
        ${S.adminUsers.map(u => `
          <tr>
            <td>
              <div class="admin-username">${esc(u.username)}</div>
              <div class="admin-email">${esc(u.email)}</div>
            </td>
            <td class="admin-count">${u.noteCount}</td>
            <td class="admin-count">${u.spotCount}</td>
            <td class="admin-count">${u.tripCount}</td>
            <td class="admin-date">${esc(timeAgo(u.created_at))}</td>
            <td>
              <div class="admin-actions">
                <button class="btn btn-ghost btn-sm" data-pw="${u.id}"
                  title="Passwort setzen">${IC.key}</button>
                <button class="btn btn-danger btn-sm" data-del="${u.id}"
                  title="Konto löschen">${IC.trash}</button>
              </div>
            </td>
          </tr>`).join('')}
      </tbody>
    </table>
  </div>`;
}

export function bindAdmin()
{
  $$('[data-pw]').forEach(btn =>
    btn.addEventListener('click', () => openPasswordModal(Number(btn.dataset.pw))));

  $$('[data-del]').forEach(btn =>
    btn.addEventListener('click', () => openDeleteModal(Number(btn.dataset.del))));
}

function userById(id)
{
  return S.adminUsers.find(u => u.id === id);
}

function openPasswordModal(id)
{
  const user = userById(id);
  openModal(`
    <div class="modal-head">
      <h2>Passwort setzen</h2>
      <button class="btn-modal-close" data-close>${IC.x}</button>
    </div>
    <div class="modal-body">
      <p class="text-muted" style="font-size:.84rem;margin-bottom:14px">
        Setzt ein neues Passwort für <strong>${esc(user.username)}</strong>.
        Alle Sitzungen dieses Kontos werden abgemeldet.
      </p>
      <form id="admin-pw-form">
        <div class="form-group">
          <label class="form-label">Neues Passwort</label>
          <input class="form-input" name="password" type="text"
            minlength="6" required autocomplete="off"/>
        </div>
        <div class="form-error" id="admin-pw-error"></div>
      </form>
    </div>
    <div class="modal-foot">
      <button class="btn btn-ghost" data-close>Abbrechen</button>
      <button class="btn btn-primary" id="admin-pw-save">${IC.check}<span>Setzen</span></button>
    </div>`, ov =>
  {
    $$('[data-close]', ov).forEach(b => b.addEventListener('click', closeModal));
    $('#admin-pw-save', ov).addEventListener('click', async () =>
    {
      const form = $('#admin-pw-form', ov);
      if (!form.reportValidity())
      {
        return;
      }
      try
      {
        await API.admin.changePassword(id, new FormData(form).get('password'));
        closeModal();
        toast('Passwort gesetzt', 'success');
      }
      catch (err)
      {
        const errEl = $('#admin-pw-error', ov);
        errEl.textContent = err.message;
        errEl.classList.add('show');
      }
    });
  });
}

function openDeleteModal(id)
{
  const user = userById(id);
  openConfirm({
    title: 'Konto löschen',
    bodyHtml: `<strong>${esc(user.username)}</strong> und alle zugehörigen Notizen,
      Orte, Wanderwege, Reisen und Anhänge werden endgültig gelöscht.
      Das lässt sich nicht rückgängig machen.`,
    confirmLabel: 'Endgültig löschen',
    confirmIcon: IC.trash,
    onConfirm: async () =>
    {
      try
      {
        await API.admin.deleteUser(id);
        toast('Konto gelöscht', 'success');
        navigate('admin');
      }
      catch (err)
      {
        toastError(err);
      }
    },
  });
}
