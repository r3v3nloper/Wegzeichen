/* Zugriffsprüfung für alle nutzerbezogenen Tabellen.

   Jede Abfrage filtert zusätzlich über user_id. Der Grund: eine ID allein ist
   erratbar, und ohne diesen Filter könnte ein angemeldeter Nutzer die Einträge
   eines anderen lesen oder ändern. tests/routes/isolation.test.js prüft das
   für jede Ressource und jede Methode. */

const db = require('../db');

/* Whitelist statt freier Tabellennamen — Tabellennamen lassen sich nicht
   parametrisieren, deshalb darf nur diese Liste in ein Statement gelangen. */
const OWNED_TABLES = new Set(['notes', 'note_folders', 'spots', 'trips']);

function findOwned(table, id, userId)
{
  if (!OWNED_TABLES.has(table))
  {
    throw new Error(`Tabelle ${table} ist nicht als nutzerbezogen registriert`);
  }
  return db.prepare(`SELECT * FROM ${table} WHERE id = ? AND user_id = ?`).get(id, userId);
}

/* Escaped die LIKE-Sonderzeichen, damit eine Suche nach "100%" nicht
   plötzlich alles findet. Nutzung: LIKE ? ESCAPE '\' */
function likePattern(term)
{
  const escaped = String(term).replace(/[\\%_]/g, ch => `\\${ch}`);
  return `%${escaped}%`;
}

module.exports = { findOwned, likePattern };
