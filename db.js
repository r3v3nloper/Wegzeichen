const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');

const db = new Database(path.join(process.env.DATA_DIR || __dirname, 'wegzeichen.db'));

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/* Wanderwege und Orte liegen bewusst in EINER Tabelle mit Diskriminator `kind`:
   beide brauchen Land, Koordinaten, Bewertung, Besucht-Status, Favorit und
   Entfernung. Die vier wanderweg-spezifischen Spalten sind nullable. */
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    is_admin INTEGER DEFAULT 0,
    token_version INTEGER DEFAULT 0,
    home_label TEXT,
    home_lat REAL,
    home_lng REAL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  /* COLLATE NOCASE im UNIQUE-Index: „Reisen" und „reisen" wären sonst zwei
     Ordner, und die Notizen darin wären scheinbar verschwunden. */
  CREATE TABLE IF NOT EXISTS note_folders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL COLLATE NOCASE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (user_id, name)
  );

  CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    folder_id INTEGER,
    title TEXT NOT NULL,
    body TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    -- Ordner löschen darf keine Notizen mitnehmen; sie landen bei „Ohne Ordner"
    FOREIGN KEY (folder_id) REFERENCES note_folders(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS note_attachments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL,
    original_name TEXT NOT NULL,
    stored_name TEXT NOT NULL UNIQUE,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (note_id) REFERENCES notes(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS spots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    is_trail INTEGER NOT NULL DEFAULT 0,
    is_place INTEGER NOT NULL DEFAULT 0,
    name TEXT NOT NULL,
    description TEXT,
    country TEXT,
    region TEXT,
    address TEXT,
    lat REAL,
    lng REAL,
    category TEXT,
    status TEXT NOT NULL DEFAULT 'wishlist' CHECK (status IN ('wishlist', 'visited')),
    rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
    visited_at TEXT,
    planned_at TEXT,
    source_url TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    length_km REAL,
    ascent_m INTEGER,
    duration_min INTEGER,
    difficulty TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    -- Ein Eintrag ohne beides wäre in keiner Liste sichtbar
    CHECK (is_trail = 1 OR is_place = 1),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS trips (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    summary TEXT,
    country TEXT,
    start_date TEXT,
    end_date TEXT,
    rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
    photos_url TEXT,
    is_favorite INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS trip_stages (
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

  CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
  CREATE INDEX IF NOT EXISTS idx_note_folders_user ON note_folders(user_id);
  CREATE INDEX IF NOT EXISTS idx_note_attachments_note ON note_attachments(note_id);
  CREATE INDEX IF NOT EXISTS idx_spots_user ON spots(user_id);
  CREATE INDEX IF NOT EXISTS idx_spots_country ON spots(user_id, country);
  CREATE INDEX IF NOT EXISTS idx_trips_user ON trips(user_id);
  CREATE INDEX IF NOT EXISTS idx_trip_stages_trip ON trip_stages(trip_id, sort_order);
`);

/* Migrationen für bestehende Datenbanken — no-op wenn die Spalte schon existiert */
function addColumnIfMissing(table, columnDef)
{
  try
  {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDef}`);
  }
  catch
  {
    // Spalte existiert bereits
  }
}

addColumnIfMissing('users', 'home_label TEXT');
addColumnIfMissing('users', 'home_lat REAL');
addColumnIfMissing('users', 'home_lng REAL');

function columnsOf(table)
{
  return db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
}

/* Von `kind` auf zwei Kennzeichen umstellen.

   Ein Ziel kann Wanderweg und Ort gleichzeitig sein — eine Schlucht fährt man an
   und läuft sie ab. Ein ALTER TABLE genügt hier nicht: `kind` trägt eine
   CHECK-Bedingung, weshalb SQLite die Spalte nicht löschen kann. Also die
   klassische Neuaufbau-Migration. */
function migrateSpotsToFlags()
{
  db.pragma('foreign_keys = OFF');

  db.transaction(() =>
  {
    db.exec(`
      CREATE TABLE spots_migrated (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        is_trail INTEGER NOT NULL DEFAULT 0,
        is_place INTEGER NOT NULL DEFAULT 0,
        name TEXT NOT NULL,
        description TEXT,
        country TEXT,
        region TEXT,
        address TEXT,
        lat REAL,
        lng REAL,
        category TEXT,
        status TEXT NOT NULL DEFAULT 'wishlist' CHECK (status IN ('wishlist', 'visited')),
        rating INTEGER CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
        visited_at TEXT,
        source_url TEXT,
        is_favorite INTEGER NOT NULL DEFAULT 0,
        length_km REAL,
        ascent_m INTEGER,
        duration_min INTEGER,
        difficulty TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        CHECK (is_trail = 1 OR is_place = 1),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      INSERT INTO spots_migrated (
        id, user_id, is_trail, is_place, name, description, country, region, address,
        lat, lng, category, status, rating, visited_at, source_url, is_favorite,
        length_km, ascent_m, duration_min, difficulty, created_at, updated_at
      )
      SELECT
        id, user_id,
        CASE WHEN kind = 'trail' THEN 1 ELSE 0 END,
        CASE WHEN kind = 'place' THEN 1 ELSE 0 END,
        name, description, country, region, address,
        lat, lng, category, status, rating, visited_at, source_url, is_favorite,
        length_km, ascent_m, duration_min, difficulty, created_at, updated_at
      FROM spots;

      DROP TABLE spots;
      ALTER TABLE spots_migrated RENAME TO spots;

      CREATE INDEX IF NOT EXISTS idx_spots_user ON spots(user_id);
      CREATE INDEX IF NOT EXISTS idx_spots_country ON spots(user_id, country);
    `);
  })();

  /* Die IDs bleiben erhalten, trip_stages.spot_id zeigt also weiter richtig.
     Zur Sicherheit prüfen, bevor die Fremdschlüssel wieder scharf werden. */
  const broken = db.pragma('foreign_key_check');
  db.pragma('foreign_keys = ON');

  if (broken.length)
  {
    throw new Error('Migration der Tabelle spots hat Fremdschlüssel verletzt');
  }
  console.log('Tabelle spots auf is_trail/is_place umgestellt.');
}

if (columnsOf('spots').includes('kind'))
{
  migrateSpotsToFlags();
}

/* Nach dem Neuaufbau, nicht davor: migrateSpotsToFlags kennt nur die Spalten
   von damals und würde eine vorher ergänzte wieder verwerfen. */
addColumnIfMissing('spots', 'planned_at TEXT');

/* ALTER TABLE ADD COLUMN erlaubt eine REFERENCES-Klausel, solange die Spalte
   mit NULL vorbelegt ist — bestehende Notizen liegen damit in keinem Ordner. */
addColumnIfMissing('notes',
  'folder_id INTEGER REFERENCES note_folders(id) ON DELETE SET NULL');

/* Indizes auf nachgerüstete Spalten gehören hierhin, nicht in den Schema-Block
   oben: dort liefe CREATE INDEX vor dem ALTER TABLE und würde bei einer
   bestehenden Datenbank mit „no such column" abbrechen. */
db.exec('CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id)');

/* Admin-Seed beim ersten Start — nur wenn ADMIN_PASSWORD gesetzt ist */
const adminEmail = process.env.ADMIN_EMAIL || 'admin@wegzeichen.local';
const adminPassword = process.env.ADMIN_PASSWORD;
const adminExists = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
if (!adminExists && adminPassword)
{
  const hash = bcrypt.hashSync(adminPassword, 10);
  db.prepare('INSERT INTO users (username, email, password_hash, is_admin) VALUES (?, ?, ?, 1)')
    .run('admin', adminEmail, hash);
  console.log(`Admin-Benutzer angelegt (${adminEmail})`);
}

module.exports = db;
