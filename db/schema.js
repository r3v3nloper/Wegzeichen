/* Das Schema in seinem heutigen Stand — idempotent über `IF NOT EXISTS`.

   Hier stehen nur Tabellen und Indizes, die von Anfang an so aussehen. Alles,
   was an einer *bestehenden* Datenbank nachgezogen werden muss, gehört nach
   db/migrations.js: ein `CREATE INDEX` auf eine nachgerüstete Spalte würde hier
   vor dem `ALTER TABLE` laufen und mit „no such column" abbrechen.

   Wanderwege und Orte liegen bewusst in EINER Tabelle: beide brauchen Land,
   Koordinaten, Bewertung, Besucht-Status, Favorit und Entfernung. Statt eines
   ausschließenden `kind` tragen sie die Kennzeichen `is_trail` und `is_place`
   und dürfen beide haben — eine Schlucht fährt man an und läuft sie ab. */

function applySchema(db)
{
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
}

module.exports = { applySchema };
