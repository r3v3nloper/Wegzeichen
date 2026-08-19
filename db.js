/* Die Datenbankverbindung — der Einstiegspunkt, den alle Routen einbinden.

   Beim ersten `require` läuft der Start in dieser Reihenfolge ab: Verbindung
   öffnen, Schema anlegen, Migrationen nachziehen, Admin säen. Die drei Schritte
   liegen in db/, damit hier nur die Reihenfolge steht — die war vorher zwischen
   260 Zeilen SQL verstreut und nur durch Kommentare gesichert.
   ===================================================== */
const Database = require('better-sqlite3');
const path = require('path');
const { applySchema } = require('./db/schema');
const { runMigrations } = require('./db/migrations');
const { seedAdmin } = require('./db/seed');

const db = new Database(path.join(process.env.DATA_DIR || __dirname, 'wegzeichen.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

applySchema(db);
runMigrations(db);
seedAdmin(db);

module.exports = db;
