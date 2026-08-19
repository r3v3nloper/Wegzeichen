/* =====================================================
   Wegzeichen – views/entryActions.js
   Knöpfe und Verhalten einer Eintragskarte: öffnen, bearbeiten,
   Favorit umschalten, löschen

   Vorher lagen `toggleFavorite` und `confirmDelete` in vier Views nebeneinander
   — Notizen, Leseansicht, Orte/Wege und Reisen —, jeweils mit demselben
   Bestätigungsdialog und demselben Fehlerpfad. Die Unterschiede stecken nur in
   den Beschriftungen und in den Aufrufen ans Backend; genau die kommen hier von
   außen herein.
   ===================================================== */
import { IC } from '../icons.js';
import { $$, esc, toast, toastError } from '../dom.js';
import { openConfirm } from '../modal.js';

export function favButtonHtml(item)
{
  const label = item.is_favorite ? 'Favorit entfernen' : 'Als Favorit markieren';
  return `<button class="btn-fav${item.is_favorite ? ' on' : ''}" data-fav="${item.id}"
    title="${label}" aria-label="${label}">${IC.star}</button>`;
}

export function editButtonHtml(id)
{
  return `<button class="btn btn-ghost btn-sm" data-edit="${id}"
    title="Bearbeiten" aria-label="Bearbeiten">${IC.edit}</button>`;
}

export function deleteButtonHtml(id)
{
  return `<button class="btn btn-ghost btn-sm" data-del="${id}"
    title="Löschen" aria-label="Löschen">${IC.trash}</button>`;
}

/* Verdrahtet die Aktionen innerhalb von `scope`.

   - `itemById` liefert den Eintrag zur ID aus dem State; gebraucht wird daraus
     nur das Favoritenkennzeichen und der Text der Löschabfrage.
   - `setFavorite(id, flag)` und `remove(id)` sind die API-Aufrufe.
   - `describeDeletion(item)` liefert Titel und Text der Abfrage. Der Text ist
     HTML — die Aufrufer setzen dort `esc()` ein, weil Namen darin vorkommen.
   - `onDone()` läuft nach jeder erfolgreichen Änderung, `onRemoved()` nach dem
     Löschen. Ohne eigenes `onRemoved` übernimmt `onDone` beides — die
     Leseansicht braucht die Unterscheidung, weil sie den gelöschten Eintrag
     nicht erneut laden darf.

   Nicht übergebene Aktionen werden nicht verdrahtet: die Leseansicht hat
   keinen „öffnen"-Knopf, die Übersicht keinen zum Löschen. */
export function bindEntryActions({
  scope, itemById, open, edit, setFavorite, remove, describeDeletion, deletedMessage,
  onDone, onRemoved,
})
{
  const within = selector => $$(selector, scope);

  if (open)
  {
    within('[data-open]').forEach(el =>
      el.addEventListener('click', () => open(Number(el.dataset.open))));
  }

  if (edit)
  {
    within('[data-edit]').forEach(btn =>
      btn.addEventListener('click', () => edit(Number(btn.dataset.edit))));
  }

  if (setFavorite)
  {
    within('[data-fav]').forEach(btn =>
      btn.addEventListener('click', async () =>
      {
        const item = itemById(Number(btn.dataset.fav));
        try
        {
          await setFavorite(item.id, !item.is_favorite);
          onDone();
        }
        catch (err)
        {
          toastError(err);
        }
      }));
  }

  if (remove)
  {
    within('[data-del]').forEach(btn =>
      btn.addEventListener('click', () =>
      {
        const item = itemById(Number(btn.dataset.del));
        const { title, bodyHtml } = describeDeletion(item);

        openConfirm({
          title,
          bodyHtml,
          confirmLabel: 'Löschen',
          confirmIcon: IC.trash,
          onConfirm: async () =>
          {
            try
            {
              await remove(item.id);
              toast(deletedMessage, 'success');
              (onRemoved || onDone)();
            }
            catch (err)
            {
              toastError(err);
            }
          },
        });
      }));
  }
}

/* „<Name> wird endgültig gelöscht." — mit optionalem Zusatz für Anhängsel, die
   mitverschwinden (Anhänge einer Notiz, Etappen einer Reise). */
export function deletionBodyHtml(name, extra = '')
{
  return `<strong>${esc(name)}</strong>${extra} wird endgültig gelöscht.`;
}
