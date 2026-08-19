/* =====================================================
   Wegzeichen – router.js
   View-Navigation und zentrales Daten-Laden pro View
   ===================================================== */
import { S } from './state.js';
import { $, esc, renderEmptyState, toast } from './dom.js';
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

  try
  {
    await renderView(view, main);
  }
  catch (err)
  {
    main.innerHTML = renderEmptyState(
      '⚠️', 'Fehler beim Laden', esc(err.message),
      `<button class="btn btn-primary" data-nav="${view}">Nochmal versuchen</button>`
    );
  }
}

async function renderView(view, main)
{
  const kind = SPOT_VIEWS[view];
  if (kind)
  {
    S.spots[kind] = await API.spots.getAll(kind);
    main.innerHTML = renderSpots(kind);
    bindSpots(kind);
    return;
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
      main.innerHTML = renderHome();
      bindHome();
      return;
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
         hier oder in einem anderen Gerät —, wäre die Liste dauerhaft leer.
         Dann auf „Alle" zurückfallen und neu laden. */
      const filtersMissingFolder = /^\d+$/.test(String(S.noteFolder))
        && !S.noteFolders.some(f => String(f.id) === String(S.noteFolder));
      if (filtersMissingFolder)
      {
        S.noteFolder = 'all';
        return renderView('notes', main);
      }

      main.innerHTML = renderNotes();
      bindNotes();
      return;
    }

    case 'note':
    {
      /* Die Leseansicht lädt die Notiz frisch: die Liste führt keine Anhänge
         mit, und der Inhalt kann auf einem anderen Gerät geändert worden sein.
         Ist sie inzwischen gelöscht, zurück zur Liste statt einer Fehlerseite. */
      if (!S.openNoteId)
      {
        return backToNotes(main);
      }
      try
      {
        S.openNote = await API.notes.get(S.openNoteId);
      }
      catch (err)
      {
        toast(err.message, err.offline ? 'offline' : 'error');
        return backToNotes(main);
      }

      main.innerHTML = renderNote();
      bindNote();
      return;
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
      main.innerHTML = renderTrips();
      bindTrips();
      return;
    }

    case 'profile':
      main.innerHTML = renderProfile();
      bindProfile();
      return;

    case 'admin':
      if (!S.user?.is_admin)
      {
        navigate('home');
        return;
      }
      S.adminUsers = await API.admin.getUsers();
      main.innerHTML = renderAdmin();
      bindAdmin();
      return;

    default:
      navigate('home');
  }
}

/* Verlässt die Leseansicht in Richtung Liste. Setzt auch S.view zurück, sonst
   würde reload() weiter die verschwundene Notiz nachladen wollen. */
function backToNotes(main)
{
  S.view = 'notes';
  S.openNoteId = null;
  S.openNote = null;
  updateNav();
  return renderView('notes', main);
}

/* Lädt die aktuelle View neu — nach dem Speichern eines Eintrags */
export function reload()
{
  return navigate(S.view);
}
