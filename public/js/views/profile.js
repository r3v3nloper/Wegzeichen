/* =====================================================
   Wegzeichen – views/profile.js
   Profil und Einstellungen: Heimatort, Konto, Passwort
   ===================================================== */
import { IC } from '../icons.js';
import { S, homePoint, rememberSession } from '../state.js';
import { $, esc, toast, toastError } from '../dom.js';
import { API, TOKEN_KEY } from '../api.js';
import { openLocationPicker } from '../modals/location-picker.js';

export function renderProfile()
{
  const u = S.user || {};
  const home = homePoint();

  return `
    <div class="page-header">
      <div class="page-title-row">
        <div class="page-icon">${IC.user}</div>
        <div>
          <div class="page-title">Profil</div>
          <div class="page-sub">${esc(u.username || '')}</div>
        </div>
      </div>
    </div>

    <div class="setting-card">
      <h3>${IC.pin}Heimatort</h3>
      <p>Bezugspunkt für alle Entfernungsangaben bei Orten und Wanderwegen.
         Die Entfernung ist die Luftlinie und wird auf dem Gerät berechnet.</p>
      <div class="setting-value">
        <div class="setting-current" id="home-current">${homeSummaryHtml(home)}</div>
        <div class="setting-actions">
          ${home ? `<button class="btn btn-ghost btn-sm" id="btn-home-clear">
            ${IC.trash}<span>Entfernen</span></button>` : ''}
          <button class="btn btn-secondary btn-sm" id="btn-home-edit">
            ${IC.map}<span>${home ? 'Ändern' : 'Festlegen'}</span></button>
        </div>
      </div>
    </div>

    <div class="setting-card">
      <h3>${IC.user}Konto</h3>
      <form id="account-form">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Benutzername</label>
            <input class="form-input" name="username" type="text"
              value="${esc(u.username || '')}" minlength="3" required/>
          </div>
          <div class="form-group">
            <label class="form-label">E-Mail</label>
            <input class="form-input" name="email" type="email"
              value="${esc(u.email || '')}" required/>
          </div>
        </div>
        <div class="form-error" id="account-error"></div>
        <button type="submit" class="btn btn-primary btn-sm">
          ${IC.check}<span>Speichern</span></button>
      </form>
    </div>

    <div class="setting-card">
      <h3>${IC.key}Passwort ändern</h3>
      <p>Nach dem Ändern bleibt nur dieses Gerät angemeldet — alle anderen
         Sitzungen werden abgemeldet.</p>
      <form id="password-form">
        <div class="form-group">
          <label class="form-label">Aktuelles Passwort</label>
          <input class="form-input" name="currentPassword" type="password"
            autocomplete="current-password" required/>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Neues Passwort</label>
            <input class="form-input" name="newPassword" type="password"
              minlength="6" autocomplete="new-password" required/>
          </div>
          <div class="form-group">
            <label class="form-label">Wiederholen</label>
            <input class="form-input" name="confirm" type="password"
              minlength="6" autocomplete="new-password" required/>
          </div>
        </div>
        <div class="form-error" id="password-error"></div>
        <button type="submit" class="btn btn-primary btn-sm">
          ${IC.key}<span>Passwort ändern</span></button>
      </form>
    </div>

    <div class="setting-card">
      <h3>${IC.info}Über Wegzeichen</h3>
      <p>Kartendaten von OpenStreetMap. Offline sind alle gespeicherten Daten
         lesbar; der Kartenhintergrund und Änderungen brauchen eine Verbindung.</p>
      <button class="btn btn-danger btn-sm" id="btn-logout-profile">
        ${IC.logout}<span>Abmelden</span></button>
    </div>`;
}

function homeSummaryHtml(home)
{
  if (!home)
  {
    return '<span class="muted">Kein Heimatort festgelegt — keine Entfernungsangaben</span>';
  }
  return `<strong>${esc(home.label || 'Heimatort')}</strong>
    <span class="muted"> · ${home.lat.toFixed(4)}, ${home.lng.toFixed(4)}</span>`;
}

export function bindProfile()
{
  $('#btn-home-edit').addEventListener('click', () =>
  {
    const home = homePoint();
    openLocationPicker({
      title: 'Heimatort festlegen',
      initial: home ? { label: home.label, lat: home.lat, lng: home.lng } : null,
      onPick: async picked => saveHome(picked.label, picked.lat, picked.lng),
    });
  });

  $('#btn-home-clear')?.addEventListener('click', () => saveHome(null, null, null));

  bindAccountForm();
  bindPasswordForm();
}

async function saveHome(label, lat, lng)
{
  try
  {
    const { user } = await API.users.setHome(label, lat, lng);
    S.user = user;
    // Auch offline soll die Entfernung zum aktuellen Heimatort gerechnet werden
    rememberSession(S.user, S.countries);
    $('#home-current').innerHTML = homeSummaryHtml(homePoint());
    toast(lat === null ? 'Heimatort entfernt' : 'Heimatort gespeichert', 'success');
  }
  catch (err)
  {
    toastError(err);
  }
}

function bindAccountForm()
{
  const form = $('#account-form');
  form.addEventListener('submit', async e =>
  {
    e.preventDefault();
    const fd = new FormData(form);
    const errEl = $('#account-error');
    errEl.classList.remove('show');
    try
    {
      const { user } = await API.auth.updateProfile({
        username: fd.get('username'),
        email: fd.get('email'),
      });
      S.user = user;
      rememberSession(S.user, S.countries);
      toast('Konto aktualisiert', 'success');
    }
    catch (err)
    {
      errEl.textContent = err.message;
      errEl.classList.add('show');
    }
  });
}

function bindPasswordForm()
{
  const form = $('#password-form');
  form.addEventListener('submit', async e =>
  {
    e.preventDefault();
    const fd = new FormData(form);
    const errEl = $('#password-error');
    errEl.classList.remove('show');

    if (fd.get('newPassword') !== fd.get('confirm'))
    {
      errEl.textContent = 'Passwörter stimmen nicht überein';
      errEl.classList.add('show');
      return;
    }

    try
    {
      const result = await API.auth.updateProfile({
        currentPassword: fd.get('currentPassword'),
        newPassword: fd.get('newPassword'),
      });
      if (result.token)
      {
        localStorage.setItem(TOKEN_KEY, result.token);
        S.token = result.token;
      }
      form.reset();
      toast('Passwort geändert', 'success');
    }
    catch (err)
    {
      errEl.textContent = err.message;
      errEl.classList.add('show');
    }
  });
}
