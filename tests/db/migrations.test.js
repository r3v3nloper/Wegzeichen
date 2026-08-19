/* Schema, Migrationen und Admin-Seed sind seit der Aufteilung reine Funktionen
   über einem Datenbank-Handle. Damit lassen sie sich einzeln prüfen — gegen eine
   Datenbank im Speicher, ohne Dateien und ohne die App.

   tests/migration.test.js prüft weiterhin den echten Start gegen eine
   Altdatenbank auf der Platte; hier geht es um die Buchführung der Versionen. */
const { test, describe, beforeEach } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');
const { applySchema } = require('../../db/schema');
const { runMigrations, STEPS } = require('../../db/migrations');
const { seedAdmin } = require('../../db/seed');

let db;

beforeEach(() =>
{
  db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
});

function userVersion()
{
  return db.pragma('user_version', { simple: true });
}

function columnsOf(table)
{
  return db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name);
}

describe('Schema', () =>
{
  test('legt alle Tabellen an', () =>
  {
    applySchema(db);

    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all().map(row => row.name);

    ['users', 'note_folders', 'notes', 'note_attachments', 'spots', 'trips', 'trip_stages']
      .forEach(table => assert.ok(tables.includes(table), `${table} fehlt`));
  });

  test('lässt sich zweimal anwenden', () =>
  {
    applySchema(db);

    assert.doesNotThrow(() => applySchema(db));
  });
});

describe('Migrationsstand', () =>
{
  test('beginnt bei null', () =>
  {
    assert.equal(userVersion(), 0);
  });

  test('steht nach dem Lauf auf der Zahl der Schritte', () =>
  {
    applySchema(db);
    runMigrations(db);

    assert.equal(userVersion(), STEPS.length);
  });

  test('ein zweiter Lauf ändert nichts', () =>
  {
    applySchema(db);
    runMigrations(db);

    assert.doesNotThrow(() => runMigrations(db));
    assert.equal(userVersion(), STEPS.length);
  });

  test('überspringt Schritte, die als erledigt vermerkt sind', () =>
  {
    /* Der eigentliche Zweck der Versionsnummer: eine Datenbank, die schon auf
       dem Stand ist, klopft nicht bei jedem Start alle Spalten ab. Geprüft an
       einer Tabelle ohne die nachgerüstete Spalte — sie darf nicht entstehen. */
    db.exec(`
      CREATE TABLE spots (id INTEGER PRIMARY KEY, user_id INTEGER,
        is_trail INTEGER DEFAULT 1, is_place INTEGER DEFAULT 0, name TEXT);
      CREATE TABLE notes (id INTEGER PRIMARY KEY, user_id INTEGER, title TEXT);
      CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT);
    `);
    db.pragma(`user_version = ${STEPS.length}`);

    runMigrations(db);

    assert.equal(columnsOf('spots').includes('planned_at'), false);
    assert.equal(columnsOf('notes').includes('folder_id'), false);
  });

  test('jeder Schritt trägt einen Namen', () =>
  {
    // Die Namen stehen im Changelog und in der Fehlersuche — leere wären wertlos
    STEPS.forEach((step, index) =>
    {
      assert.ok(step.name && step.name.length > 3, `Schritt ${index + 1} ohne Namen`);
      assert.equal(typeof step.run, 'function');
    });
  });
});

describe('Admin-Seed', () =>
{
  const savedPassword = process.env.ADMIN_PASSWORD;
  const savedEmail = process.env.ADMIN_EMAIL;

  function restoreEnv()
  {
    if (savedPassword === undefined)
    {
      delete process.env.ADMIN_PASSWORD;
    }
    else
    {
      process.env.ADMIN_PASSWORD = savedPassword;
    }
    if (savedEmail === undefined)
    {
      delete process.env.ADMIN_EMAIL;
    }
    else
    {
      process.env.ADMIN_EMAIL = savedEmail;
    }
  }

  function countUsers()
  {
    return db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  }

  test('legt ohne ADMIN_PASSWORD niemanden an', () =>
  {
    /* Sonst hätte jede Installation ein Konto mit vorhersehbarem Passwort. */
    applySchema(db);
    delete process.env.ADMIN_PASSWORD;

    seedAdmin(db);

    assert.equal(countUsers(), 0);
    restoreEnv();
  });

  test('legt mit ADMIN_PASSWORD ein Adminkonto an', () =>
  {
    applySchema(db);
    process.env.ADMIN_PASSWORD = 'startpasswort123';
    process.env.ADMIN_EMAIL = 'chef@example.org';

    seedAdmin(db);

    const admin = db.prepare('SELECT * FROM users WHERE email = ?').get('chef@example.org');
    assert.ok(admin);
    assert.equal(admin.is_admin, 1);
    assert.notEqual(admin.password_hash, 'startpasswort123', 'Passwort muss gehasht sein');
    restoreEnv();
  });

  test('legt bei einem zweiten Start kein zweites Konto an', () =>
  {
    applySchema(db);
    process.env.ADMIN_PASSWORD = 'startpasswort123';
    process.env.ADMIN_EMAIL = 'chef@example.org';

    seedAdmin(db);
    seedAdmin(db);

    assert.equal(countUsers(), 1);
    restoreEnv();
  });
});
