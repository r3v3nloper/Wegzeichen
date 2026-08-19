/* =====================================================
   Wegzeichen – main.js
   Einstiegspunkt: Boot, App-Shell, Logout, PWA-Install
   ===================================================== */
import { IC } from './icons.js';
import {
  S, resetUserData, rememberSession, lastKnownUser, lastKnownCountries, forgetSession,
} from './state.js';
import { $, toast } from './dom.js';
import { API, TOKEN_KEY, setCacheListener, clearApiCache } from './api.js';
import { renderShell, closeSidebar } from './shell.js';
import { navigate } from './router.js';
import { bindAuth } from './views/auth.js';

/* Einmalige globale Klick-Delegation — darf bei Logout/Login-Zyklen nicht stapeln */
let delegationBound = false;

function bindGlobalDelegation()
{
  if (delegationBound)
  {
    return;
  }
  delegationBound = true;

  document.addEventListener('click', e =>
  {
    // Navigationsknöpfe in Modals dürfen nicht die Hauptansicht wechseln
    const navBtn = e.target.closest('[data-nav]');
    if (navBtn && !navBtn.closest('.modal-overlay'))
    {
      navigate(navBtn.dataset.nav);
      return;
    }
    if (e.target.closest('#btn-logout') || e.target.closest('#btn-logout-profile'))
    {
      logout();
      return;
    }
    if (e.target.closest('#btn-menu'))
    {
      $('#sidebar')?.classList.toggle('open');
      $('#sidebar-overlay')?.classList.toggle('open');
      return;
    }
    if (e.target.id === 'sidebar-overlay')
    {
      closeSidebar();
    }
  });
}

export function initApp()
{
  document.getElementById('app').innerHTML = renderShell();
  bindGlobalDelegation();
  navigate('home');
}

export function logout()
{
  localStorage.removeItem(TOKEN_KEY);
  S.token = null;
  S.user = null;
  resetUserData();
  forgetSession();
  clearApiCache();
  bindAuth();
}

/* Länderliste einmal pro Sitzung holen. Ohne Netz kommt der zuletzt bekannte
   Stand zum Einsatz — sonst stünden überall ISO-Codes statt Ländernamen. */
export async function loadCountries()
{
  try
  {
    S.countries = await API.meta.countries();
  }
  catch
  {
    S.countries = lastKnownCountries();
  }
}

function bindInstallPrompt()
{
  let deferredPrompt;
  window.addEventListener('beforeinstallprompt', e =>
  {
    e.preventDefault();
    deferredPrompt = e;
    const banner = document.createElement('div');
    banner.className = 'install-banner';
    banner.innerHTML = `<span class="install-emoji">🧭</span>
      <p>Wegzeichen als App installieren — dann läuft sie auch offline.</p>
      <button class="btn btn-primary btn-sm" id="btn-pwa-install">Installieren</button>
      <button class="btn btn-icon" id="btn-pwa-dismiss"
        aria-label="Hinweis ausblenden" title="Ausblenden">${IC.x}</button>`;
    document.body.appendChild(banner);

    banner.querySelector('#btn-pwa-install')?.addEventListener('click', async () =>
    {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted')
      {
        toast('App installiert', 'success');
      }
      banner.remove();
    });
    banner.querySelector('#btn-pwa-dismiss')?.addEventListener('click', () => banner.remove());
  });
}

async function boot()
{
  if ('serviceWorker' in navigator)
  {
    navigator.serviceWorker.register('/sw.js').catch(() =>
    {
      // Ohne Service Worker läuft die App weiter, nur ohne Offline-Fähigkeit
    });
  }

  setCacheListener(fromCache =>
  {
    S.servedOffline = fromCache;
  });

  bindInstallPrompt();

  if (!S.token)
  {
    bindAuth();
    return;
  }

  try
  {
    S.user = await API.auth.me();
    await loadCountries();
    rememberSession(S.user, S.countries);
    initApp();
    return;
  }
  catch (err)
  {
    if (!err.offline)
    {
      // Der Server hat den Token abgelehnt — dann ist die Sitzung wirklich vorbei
      localStorage.removeItem(TOKEN_KEY);
      S.token = null;
      forgetSession();
      bindAuth();
      return;
    }
  }

  /* Offline darf nicht ausloggen: der Token ist noch gültig, nur nicht prüfbar.
     Mit dem zuletzt bekannten Profil läuft die App aus dem Cache weiter. */
  const known = lastKnownUser();
  if (!known)
  {
    toast('Offline — Anmeldung konnte nicht geprüft werden', 'offline', 'Offline');
    bindAuth();
    return;
  }

  S.user = known;
  await loadCountries();
  initApp();
}

window.addEventListener('DOMContentLoaded', boot);
