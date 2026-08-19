/* =====================================================
   Wegzeichen – views/auth.js
   Login-/Registrierungs-Ansicht
   ===================================================== */
import { S, rememberSession } from '../state.js';
import { $ } from '../dom.js';
import { API, TOKEN_KEY, clearApiCache } from '../api.js';
import { initApp, loadCountries } from '../main.js';

function renderAuthView()
{
  return `<div class="auth-wrap">
    <div class="auth-box">
      <div class="auth-logo">
        <img src="/icons/icon.svg" alt=""/>
        <h1>Wegzeichen</h1>
        <p>Notizen, Wanderwege, Orte und Reisen an einem Ort</p>
      </div>
      <div class="auth-tabs">
        <button class="auth-tab active" id="tab-login">Anmelden</button>
        <button class="auth-tab" id="tab-register">Registrieren</button>
      </div>
      <div id="auth-form-wrap">${loginFormHtml()}</div>
    </div>
  </div>`;
}

function loginFormHtml()
{
  return `<form id="login-form">
    <div class="form-group">
      <label class="form-label">E-Mail</label>
      <input class="form-input" type="email" name="email"
        placeholder="name@beispiel.de" required autocomplete="email"/>
    </div>
    <div class="form-group">
      <label class="form-label">Passwort</label>
      <input class="form-input" type="password" name="password"
        placeholder="Passwort" required autocomplete="current-password"/>
    </div>
    <div class="form-error" id="login-error"></div>
    <button type="submit" class="btn btn-primary btn-full btn-lg">Anmelden</button>
  </form>`;
}

function registerFormHtml()
{
  return `<form id="register-form">
    <div class="form-group">
      <label class="form-label">Benutzername</label>
      <input class="form-input" type="text" name="username"
        placeholder="Mindestens 3 Zeichen" required minlength="3" autocomplete="username"/>
    </div>
    <div class="form-group">
      <label class="form-label">E-Mail</label>
      <input class="form-input" type="email" name="email"
        placeholder="name@beispiel.de" required autocomplete="email"/>
    </div>
    <div class="form-group">
      <label class="form-label">Passwort</label>
      <input class="form-input" type="password" name="password"
        placeholder="Mindestens 6 Zeichen" required minlength="6" autocomplete="new-password"/>
    </div>
    <div class="form-group">
      <label class="form-label">Passwort bestätigen</label>
      <input class="form-input" type="password" name="confirm"
        placeholder="Passwort wiederholen" required autocomplete="new-password"/>
    </div>
    <div class="form-error" id="register-error"></div>
    <button type="submit" class="btn btn-primary btn-full btn-lg">Konto erstellen</button>
  </form>`;
}

export function bindAuth()
{
  document.getElementById('app').innerHTML = renderAuthView();

  $('#tab-login').addEventListener('click', () =>
  {
    $('#tab-login').classList.add('active');
    $('#tab-register').classList.remove('active');
    $('#auth-form-wrap').innerHTML = loginFormHtml();
    bindLoginForm();
  });
  $('#tab-register').addEventListener('click', () =>
  {
    $('#tab-register').classList.add('active');
    $('#tab-login').classList.remove('active');
    $('#auth-form-wrap').innerHTML = registerFormHtml();
    bindRegisterForm();
  });
  bindLoginForm();
}

async function startSession(token, user)
{
  // Cache des zuvor angemeldeten Kontos verwerfen, bevor neue Daten geladen werden
  await clearApiCache();
  localStorage.setItem(TOKEN_KEY, token);
  S.token = token;
  S.user = user;
  await loadCountries();
  rememberSession(S.user, S.countries);
  initApp();
}

function bindLoginForm()
{
  const form = $('#login-form');
  if (!form)
  {
    return;
  }
  form.addEventListener('submit', async e =>
  {
    e.preventDefault();
    const fd = new FormData(form);
    const errEl = $('#login-error');
    const btn = form.querySelector('button[type=submit]');
    errEl.classList.remove('show');
    btn.disabled = true;
    btn.textContent = 'Anmelden…';
    try
    {
      const { token, user } = await API.auth.login(fd.get('email'), fd.get('password'));
      startSession(token, user);
    }
    catch (err)
    {
      errEl.textContent = err.message;
      errEl.classList.add('show');
      btn.disabled = false;
      btn.textContent = 'Anmelden';
    }
  });
}

function bindRegisterForm()
{
  const form = $('#register-form');
  if (!form)
  {
    return;
  }
  form.addEventListener('submit', async e =>
  {
    e.preventDefault();
    const fd = new FormData(form);
    const errEl = $('#register-error');
    const btn = form.querySelector('button[type=submit]');
    errEl.classList.remove('show');
    if (fd.get('password') !== fd.get('confirm'))
    {
      errEl.textContent = 'Passwörter stimmen nicht überein';
      errEl.classList.add('show');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Registrieren…';
    try
    {
      const { token, user } = await API.auth.register(
        fd.get('username'), fd.get('email'), fd.get('password')
      );
      startSession(token, user);
    }
    catch (err)
    {
      errEl.textContent = err.message;
      errEl.classList.add('show');
      btn.disabled = false;
      btn.textContent = 'Konto erstellen';
    }
  });
}
