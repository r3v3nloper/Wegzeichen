/* =====================================================
   Wegzeichen – shell.js
   App-Gerüst: Sidebar, Mobile-Header, Bottom-Navigation
   ===================================================== */
import { IC } from './icons.js';
import { S } from './state.js';
import { $, $$, esc } from './dom.js';

/* Die fünf Hauptbereiche liegen mobil in der Bottom-Navigation.
   Profil und Admin sind über das Seitenmenü erreichbar — mehr als fünf
   Einträge nebeneinander werden auf einem Telefon unlesbar. */
export const PRIMARY_VIEWS = [
  { id: 'home', icon: 'home', label: 'Übersicht', short: 'Start' },
  { id: 'notes', icon: 'note', label: 'Notizen', short: 'Notizen' },
  { id: 'trails', icon: 'mountain', label: 'Wanderwege', short: 'Wege' },
  { id: 'places', icon: 'pin', label: 'Orte', short: 'Orte' },
  { id: 'trips', icon: 'route', label: 'Reisen', short: 'Reisen' },
];

const SECONDARY_VIEWS = [
  { id: 'profile', icon: 'user', label: 'Profil' },
];

function sidebarItems()
{
  return [
    ...PRIMARY_VIEWS,
    ...SECONDARY_VIEWS,
    ...(S.user?.is_admin ? [{ id: 'admin', icon: 'shield', label: 'Admin', admin: true }] : []),
  ];
}

export function renderShell()
{
  const v = S.view;
  const u = S.user || {};
  const initials = (u.username || '?').substring(0, 2).toUpperCase();

  return `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-logo">
        <img src="/icons/icon.svg" class="logo-img" alt=""/>
        <span class="logo-text">Wegzeichen</span>
      </div>
      <nav class="sidebar-nav">
        ${sidebarItems().map(n => `
          <button class="nav-item${v === n.id ? ' active' : ''}${n.admin ? ' nav-item-admin' : ''}"
                  data-nav="${n.id}">
            ${IC[n.icon]}<span>${n.label}</span>
          </button>`).join('')}
      </nav>
      <div class="sidebar-user">
        <div class="user-avatar">${esc(initials)}</div>
        <div class="user-info">
          <div class="user-name">${esc(u.username || '')}</div>
          <div class="user-email">${esc(u.email || '')}</div>
        </div>
        <button class="btn-logout" id="btn-logout" title="Abmelden">${IC.logout}</button>
      </div>
    </aside>
    <div class="sidebar-overlay" id="sidebar-overlay"></div>
    <header class="mobile-header">
      <button class="btn-menu" id="btn-menu" aria-label="Menü">${IC.menu}</button>
      <div class="mobile-logo">
        <img src="/icons/icon.svg" class="logo-img logo-img-sm" alt=""/>
        <span class="logo-text">Wegzeichen</span>
      </div>
      <div style="width:34px"></div>
    </header>
    <main class="main-content" id="main-content"></main>
    <nav class="bottom-nav">
      <div class="bottom-nav-inner">
        ${PRIMARY_VIEWS.map(n => `
          <button class="bottom-nav-item${v === n.id ? ' active' : ''}" data-nav="${n.id}">
            ${IC[n.icon]}<span>${n.short}</span>
          </button>`).join('')}
      </div>
    </nav>`;
}

/* Ansichten ohne eigenen Navigationseintrag zeigen den Eintrag ihres Bereichs
   als aktiv — die Leseansicht einer Notiz gehört zu „Notizen". */
const NAV_PARENT = { note: 'notes' };

export function updateNav()
{
  const active = NAV_PARENT[S.view] || S.view;
  $$('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === active));
}

export function closeSidebar()
{
  $('#sidebar')?.classList.remove('open');
  $('#sidebar-overlay')?.classList.remove('open');
}
