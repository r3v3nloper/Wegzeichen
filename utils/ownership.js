/* Zugriffsprüfung für alle nutzerbezogenen Tabellen.

   Jede Abfrage filtert zusätzlich über user_id. Der Grund: eine ID allein ist
   erratbar, und ohne diesen Filter könnte ein angemeldeter Nutzer die Einträge
   eines anderen lesen oder ändern. tests/routes/isolation.test.js prüft das
   für jede Ressource und jede Methode. */

const db = require('../db');

/* Whitelist statt freier Tabellennamen — Tabellennamen lassen sich nicht
   parametrisieren, deshalb darf nur diese Liste in ein Statement gelangen. */
const OWNED_TABLES = new Set(['notes', 'note_folders', 'spots', 'trips']);

/* Tabellen mit Favoritenkennzeichen. Ordner haben keines — und dürfen deshalb
   auch nicht versehentlich in setFavoriteOwned landen. */
const FAVORITE_TABLES = new Set(['notes', 'spots', 'trips']);

function assertOwnedTable(table)
{
  if (!OWNED_TABLES.has(table))
  {
    throw new Error(`Tabelle ${table} ist nicht als nutzerbezogen registriert`);
  }
}

function findOwned(table, id, userId)
{
  assertOwnedTable(table);
  return db.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`).get(id, userId);
}

/* Setzt allein das Favoritenkennzeichen.

   Eine eigene Funktion, weil drei Routen sie brauchen und weil damit an einer
   Stelle steht, dass ein Sternklick auch updated_at fortschreibt. */
function setFavoriteOwned(table, id, userId, isFavorite)
{
  if (!FAVORITE_TABLES.has(table))
  {
    throw new Error(`Tabelle ${table} hat kein Favoritenkennzeichen`);
  }
  db.prepare(`
    UPDATE ${table} SET is_favorite = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(isFavorite, id, userId);
}

/* Escaped die LIKE-Sonderzeichen, damit eine Suche nach "100%" nicht
   plötzlich alles findet. Nutzung: LIKE ? ESCAPE '\' */
function likePattern(term)
{
  const escaped = String(term).replace(/[\\%_]/g, ch => `\\${ch}`);
  return `%${escaped}%`;
}

module.exports = { findOwned, setFavoriteOwned, assertOwnedTable, likePattern };
