/* =====================================================
   Wegzeichen – router.js
   View-Navigation und zentrales Daten-Laden pro View

   Laden und Zeichnen sind getrennt: `navigate()` wechselt die Ansicht mit
   Ladeindikator, `refresh()` zeichnet die aktuelle neu, ohne sie vorher durch
   einen Spinner zu ersetzen. Letzteres ist der Weg nach einer Änderung an einem
   Eintrag — ein Stern soll die Liste nicht kurz verschwinden lassen und die
   Scrollposition kosten.
   ===================================================== */
import { S } from './state.js';
import { $, renderEmptyState, toast } from './dom.js';
import { API } from './api.js';
import { updateNav, closeSidebar } from './shell.js';
import { renderHome, bindHome } from './views/home.js';
import { renderNotes, bindNotes } from './views/notes.js';
import { renderNote, bindNote } from './views/note.js';
import { renderSpots, bindSpots } from './views/spots.js';
import { renderTrips, bindTrips } from './views/trips.js';
import { renderProfile, bindProfile } from './views/profile.js';
import { renderAdmin, bindAdmin } from './views/admin.js';

/* Nav-ID → Spot-Art. Wanderwege und Orte teilen View und Datenmodell
   und unterscheiden sich nur über diesen Wert. */
const SPOT_VIEWS = { trails: 'trail', places: 'place' };

export async function navigate(view)
{
  S.view = view;
  updateNav();
  closeSidebar();

  const main = $('#main-content');
  if (!main)
  {
    return;
  }
  main.innerHTML = '<div class="loader-wrap"><div class="spinner"></div></div>';

  await loadAndPaint(view, main);
}

/* Lädt die Daten der aktuellen Ansicht neu und zeichnet sie — ohne
   Ladeindikator und ohne Ansichtswechsel. Für Änderungen, nach denen dieselbe
   Ansicht stehen bleiben soll: Favorit umschalten, löschen, speichern. */
export async function refresh()
{
  const main = $('#main-content');
  if (!main)
  {
    return;
  }
  await loadAndPaint(S.view, main);
}

async function loadAndPaint(view, main)
{
  try
  {
    // Das Laden kann auf eine andere Ansicht umlenken, siehe fallbackTo()
    paintView(await loadView(view), main);
  }
  catch (err)
  {
    main.innerHTML = renderEmptyState(
      '⚠️', 'Fehler beim Laden', err.message,
      `<button class="btn btn-primary" data-nav="${view}">Nochmal versuchen</button>`
    );
  }
}

/* Wechselt während des Ladens die Ansicht — etwa weil die geöffnete Notiz
   inzwischen gelöscht ist. S.view muss mitwandern, sonst zeigt die Navigation
   den falschen Eintrag als aktiv und ein spätere refresh() lädt ins Leere. */
function fallbackTo(view)
{
  S.view = view;
  updateNav();
  return loadView(view);
}

/* Holt die Daten einer Ansicht in den State und liefert die Ansicht zurück,
   die danach gezeichnet werden soll. */
async function loadView(view)
{
  const kind = SPOT_VIEWS[view];
  if (kind)
  {
    S.spots[kind] = await API.spots.getAll(kind);
    return view;
  }

  switch (view)
  {
    case 'home':
    {
      const [notes, trails, places, trips] = await Promise.all([
        API.notes.getAll(),
        API.spots.getAll('trail'),
        API.spots.getAll('place'),
        API.trips.getAll(),
      ]);
      S.notes = notes;
      S.spots.trail = trails;
      S.spots.place = places;
      S.trips = trips;
      return 'home';
    }

    case 'notes':
    {
      const [notes, folderInfo] = await Promise.all([
        API.notes.getAll(S.noteQuery, S.noteFolder),
        API.noteFolders.getAll(),
      ]);
      S.notes = notes;
      S.noteFolders = folderInfo.folders;
      S.noteCounts = { total: folderInfo.total, unfiled: folderInfo.unfiled };

      /* Zeigt der Filter auf einen Ordner, den es nicht mehr gibt — gelöscht
         hier oder auf einem anderen Gerät —, wäre die Liste dauerhaft leer.
         Dann auf „Alle" zurückfallen und neu laden. */
      const filtersMissingFolder = /^\d+$/.test(String(S.noteFolder))
        && !S.noteFolders.some(f => String(f.id) === String(S.noteFolder));
      if (filtersMissingFolder)
      {
        S.noteFolder = 'all';
        return loadView('notes');
      }
      return 'notes';
    }

    case 'note':
    {
      /* Die Leseansicht lädt die Notiz frisch: die Liste führt keine Anhänge
         mit, und der Inhalt kann auf einem anderen Gerät geändert worden sein.
         Ist sie inzwischen gelöscht, zurück zur Liste statt einer Fehlerseite. */
      if (!S.openNoteId)
      {
        return fallbackTo('notes');
      }
      try
      {
        S.openNote = await API.notes.get(S.openNoteId);
      }
      catch (err)
      {
        toast(err.message, err.offline ? 'offline' : 'error');
        S.openNoteId = null;
        S.openNote = null;
        return fallbackTo('notes');
      }
      return 'note';
    }

    case 'trips':
    {
      /* Orte und Wanderwege mitladen: der Etappen-Editor lässt eine Etappe
         mit einem gespeicherten Ort verknüpfen und braucht dafür die Auswahl */
      const [trips, trails, places] = await Promise.all([
        API.trips.getAll(),
        API.spots.getAll('trail'),
        API.spots.getAll('place'),
      ]);
      S.trips = trips;
      S.spots.trail = trails;
      S.spots.place = places;
      return 'trips';
    }

    case 'profile':
      return 'profile';

    case 'admin':
      if (!S.user?.is_admin)
      {
        return fallbackTo('home');
      }
      S.adminUsers = await API.admin.getUsers();
      return 'admin';

    default:
      return fallbackTo('home');
  }
}

/* Zeichnet eine Ansicht aus dem State und verdrahtet sie. Ohne Serverzugriff —
   alles, was gebraucht wird, hat loadView() vorher geholt. */
function paintView(view, main)
{
  const kind = SPOT_VIEWS[view];
  if (kind)
  {
    main.innerHTML = renderSpots(kind);
    bindSpots(kind);
    return;
  }

  const painters = {
    home: [renderHome, bindHome],
    notes: [renderNotes, bindNotes],
    note: [renderNote, bindNote],
    trips: [renderTrips, bindTrips],
    profile: [renderProfile, bindProfile],
    admin: [renderAdmin, bindAdmin],
  };

  const [render, bind] = painters[view] || painters.home;
  main.innerHTML = render();
  bind();
}
