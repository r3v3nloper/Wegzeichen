/* Migration einer bestehenden Datenbank.

   Alle anderen Tests starten mit einer frischen Datenbank und können deshalb
   eine ganze Fehlerklasse nicht sehen: Anweisungen, die auf nachgerüstete
   Spalten zugreifen, bevor die Migration sie angelegt hat. Genau daran ist der
   Start schon einmal mit „no such column: folder_id" abgebrochen.

   Dieser Test baut eine Datenbank im alten Schema auf, lädt db.js darauf und
   prüft, dass die Umstellung greift und keine Daten verloren gehen. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { test, describe, before } = require('node:test');
const assert = require('node:assert');
const Database = require('better-sqlite3');

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';
delete process.env.ADMIN_PASSWORD;

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wegzeichen-migration-'));
const dbFile = path.join(dataDir, 'wegzeichen.db');

/* Das Schema aus der ersten Fassung: spots mit `kind`, notes ohne folder_id,
   spots ohne planned_at, keine Ordnertabelle. */
function createLegacyDatabase()
{
  const db = new Database(dbFile);
  db.pragma('foreign_keys = ON');
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      is_admin INTEGER DEFAULT 0,
      token_version INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      body TEXT,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE note_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      note_id INTEGER NOT NULL,
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
    );
    CREATE TABLE spots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      kind TEXT NOT NULL CHECK (kind IN ('trail', 'place')),
      name TEXT NOT NULL,
      description TEXT,
      country TEXT,
      region TEXT,
      address TEXT,
      lat REAL,
      lng REAL,
      category TEXT,
      status TEXT NOT NULL DEFAULT 'wishlist' CHECK (status IN ('wishlist', 'visited')),
      rating INTEGER,
      visited_at TEXT,
      source_url TEXT,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      length_km REAL,
      ascent_m INTEGER,
      duration_min INTEGER,
      difficulty TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE trips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      summary TEXT,
      country TEXT,
      start_date TEXT,
      end_date TEXT,
      rating INTEGER,
      photos_url TEXT,
      is_favorite INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE TABLE trip_stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trip_id INTEGER NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 0,
      day_from INTEGER,
      day_to INTEGER,
      location_name TEXT NOT NULL,
      lat REAL,
      lng REAL,
      notes TEXT,
      spot_id INTEGER,
      FOREIGN KEY (trip_id) REFERENCES trips(id) ON DELETE CASCADE,
      FOREIGN KEY (spot_id) REFERENCES spots(id) ON DELETE SET NULL
    );
  `);

  db.prepare(`INSERT INTO users (id, username, email, password_hash)
    VALUES (1, 'alt', 'alt@example.com', 'hash')`).run();
  db.prepare(`INSERT INTO notes (id, user_id, title, body, is_favorite)
    VALUES (1, 1, 'Alte Notiz', 'Inhalt bleibt', 1)`).run();
  db.prepare(`INSERT INTO spots (id, user_id, kind, name, length_km, category, status)
    VALUES (1, 1, 'trail', 'Alter Weg', 11.4, NULL, 'wishlist')`).run();
  db.prepare(`INSERT INTO spots (id, user_id, kind, name, category, status, rating)
    VALUES (2, 1, 'place', 'Altes Hotel', 'Hotel', 'visited', 4)`).run();
  db.prepare(`INSERT INTO trips (id, user_id, title) VALUES (1, 1, 'Alte Reise')`).run();
  db.prepare(`INSERT INTO trip_stages (id, trip_id, sort_order, location_name, spot_id)
    VALUES (1, 1, 0, 'Rom', 2)`).run();

  db.close();
}

let db;

before(() =>
{
  createLegacyDatabase();
  process.env.DATA_DIR = dataDir;
  // Lädt und migriert die vorhandene Datenbank
  db = require('../db');
});

function columnsOf(table)
{
  return db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
}

describe('Start gegen eine bestehende Datenbank', () =>
{
  test('bricht nicht ab', () =>
  {
    assert.ok(db, 'db.js muss sich auf einer Altdatenbank laden lassen');
  });

  test('legt die Ordnertabelle an', () =>
  {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all().map(r => r.name);

    assert.ok(tables.includes('note_folders'));
  });

  test('rüstet die neuen Spalten nach', () =>
  {
    assert.ok(columnsOf('notes').includes('folder_id'));
    assert.ok(columnsOf('spots').includes('planned_at'));
    assert.ok(columnsOf('users').includes('home_lat'));
  });

  test('legt den Index auf der nachgerüsteten Spalte an', () =>
  {
    /* Genau hier lag der Fehler: der Index stand im Schema-Block und lief
       damit vor dem ALTER TABLE. */
    const indexes = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='notes'"
    ).all().map(r => r.name);

    assert.ok(indexes.includes('idx_notes_folder'));
  });
});

describe('Umstellung von kind auf is_trail/is_place', () =>
{
  test('entfernt die alte Spalte', () =>
  {
    assert.equal(columnsOf('spots').includes('kind'), false);
    assert.ok(columnsOf('spots').includes('is_trail'));
    assert.ok(columnsOf('spots').includes('is_place'));
  });

  test('überträgt die Art in die Kennzeichen', () =>
  {
    const rows = db.prepare('SELECT id, name, is_trail, is_place FROM spots ORDER BY id').all();

    assert.deepEqual(rows, [
      { id: 1, name: 'Alter Weg', is_trail: 1, is_place: 0 },
      { id: 2, name: 'Altes Hotel', is_trail: 0, is_place: 1 },
    ]);
  });

  test('behält die übrigen Felder', () =>
  {
    const trail = db.prepare('SELECT * FROM spots WHERE id = 1').get();
    const place = db.prepare('SELECT * FROM spots WHERE id = 2').get();

    assert.equal(trail.length_km, 11.4);
    assert.equal(place.category, 'Hotel');
    assert.equal(place.rating, 4);
    assert.equal(place.status, 'visited');
  });

  test('behält die IDs und damit die Verknüpfung aus trip_stages', () =>
  {
    const stage = db.prepare('SELECT spot_id, location_name FROM trip_stages WHERE id = 1').get();

    assert.equal(stage.spot_id, 2);
    assert.equal(stage.location_name, 'Rom');
  });

  test('hinterlässt keine verletzten Fremdschlüssel', () =>
  {
    assert.deepEqual(db.pragma('foreign_key_check'), []);
  });
});

describe('Bestehende Daten', () =>
{
  test('bleiben unangetastet', () =>
  {
    const note = db.prepare('SELECT * FROM notes WHERE id = 1').get();

    assert.equal(note.title, 'Alte Notiz');
    assert.equal(note.body, 'Inhalt bleibt');
    assert.equal(note.is_favorite, 1);
    assert.equal(note.folder_id, null, 'ohne Ordner, nicht kaputt');
  });

  test('die Umstellung läuft beim nächsten Start nicht erneut', () =>
  {
    /* Ein zweites require liefert dieselbe Instanz; entscheidend ist, dass ein
       frisch geladenes Modul auf der migrierten Datenbank fehlerfrei läuft. */
    delete require.cache[require.resolve('../db')];

    assert.doesNotThrow(() => require('../db'));
  });
});
