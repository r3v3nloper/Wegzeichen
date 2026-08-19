/* Lädt einen nutzerbezogenen Eintrag anhand des ID-Parameters und legt ihn auf
   den Request.

   Vorher stand dieses Vorspiel — ID prüfen, Besitz prüfen, sonst 404 — in
   jeder einzelnen Route: sechzehnmal derselbe Block. Der 404 statt 403 ist
   Absicht: ein fremder Eintrag soll nicht einmal seine Existenz verraten.

   `load` erlaubt eine eigene Abfrage für Routen, die mehr als die Tabellenzeile
   brauchen — die Notiz etwa kommt mit dem Namen ihres Ordners. Die Prüfung auf
   den Besitzer bleibt dabei Pflicht des Ladens. */
const { findOwned, assertOwnedTable } = require('../utils/ownership');
const v = require('../utils/validate');

function loadOwned(table, notFoundMessage, { param = 'id', as = 'entity', load } = {})
{
  // Früh statt bei der ersten Anfrage scheitern, wenn die Tabelle fehlt
  assertOwnedTable(table);

  const loadEntity = load || ((id, userId) => findOwned(table, id, userId));

  return (req, res, next) =>
  {
    const id = v.parseIdParam(req.params[param]);
    const entity = id === null ? null : loadEntity(id, req.userId);
    if (!entity)
    {
      return res.status(404).json({ error: notFoundMessage });
    }
    req[as] = entity;
    next();
  };
}

module.exports = loadOwned;
