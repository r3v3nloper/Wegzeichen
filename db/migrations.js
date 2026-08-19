/* Migrationen für Datenbanken, die schon vor einer Schemaänderung existierten.

   Die Schritte stehen in einer nummerierten Liste und laufen in dieser
   Reihenfolge. `PRAGMA user_version` merkt sich, wie weit gekommen wurde — beim
   nächsten Start werden erledigte Schritte übersprungen, statt jedes Mal alle
   Spalten und Tabellen abzuklopfen.

   Jeder Schritt bleibt trotzdem für sich idempotent. Das ist keine
   Doppelsicherung ohne Grund: bestehende Datenbanken tragen `user_version = 0`,
   obwohl das Schema bei ihnen schon vollständig sein kann. Erst nach dem ersten
   Durchlauf ist die Zählung verlässlich.

   Die Reihenfolge zählt. Der Neuaufbau der Tabelle `spots` kennt nur die
   Spalten von damals und würde eine vorher ergänzte wieder verwerfen — deshalb
   kommen Nachrüstungen an `spots` danach. Und Indizes auf nachgerüstete Spalten
   stehen zuletzt: im Schema-Block liefen sie vor dem `ALTER TABLE` und brächen
   mit „no such column" ab. */

function addColumnIfMissing(db, table, columnDefinition)
{
  try
  {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${columnDefinition}`);
  }
  catch
  {
    // Spalte existiert bereits
  }
}

function columnsOf(db, table)
{
  return db.prepare(`PRAGMA table_info(${table})`).all().map(column => column.name);
}

/* Von `kind` auf zwei Kennzeichen umstellen.

   Ein Ziel kann Wanderweg und Ort gleichzeitig sein. Ein ALTER TABLE genügt
   hier nicht: `kind` trägt eine CHECK-Bedingung, weshalb SQLite die Spalte nicht
   löschen kann. Also die klassische Neuaufbau-Migration. */
function migrateSpotsToFlags(db)
{
  if (!columnsOf(db, 'spots').includes('kind'))
  {
    return;
  }

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

/* Die Liste wächst am Ende. Ein einmal veröffentlichter Schritt behält seine
   Nummer, sonst überspringen bereits migrierte Datenbanken den Falschen. */
const STEPS = [
  {
    name: 'Heimatort am Nutzer',
    run: db =>
    {
      addColumnIfMissing(db, 'users', 'home_label TEXT');
      addColumnIfMissing(db, 'users', 'home_lat REAL');
      addColumnIfMissing(db, 'users', 'home_lng REAL');
    },
  },
  {
    name: 'spots: kind wird is_trail/is_place',
    run: migrateSpotsToFlags,
  },
  {
    name: 'spots: geplantes Datum',
    run: db => addColumnIfMissing(db, 'spots', 'planned_at TEXT'),
  },
  {
    /* ALTER TABLE ADD COLUMN erlaubt eine REFERENCES-Klausel, solange die
       Spalte mit NULL vorbelegt ist — bestehende Notizen liegen damit in
       keinem Ordner. */
    name: 'notes: Ordnerzuordnung',
    run: db => addColumnIfMissing(db, 'notes',
      'folder_id INTEGER REFERENCES note_folders(id) ON DELETE SET NULL'),
  },
  {
    name: 'Index auf notes.folder_id',
    run: db => db.exec('CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id)'),
  },
];

function runMigrations(db)
{
  const applied = db.pragma('user_version', { simple: true });

  STEPS.forEach((step, index) =>
  {
    const version = index + 1;
    if (version <= applied)
    {
      return;
    }
    step.run(db);
    db.pragma(`user_version = ${version}`);
  });
}

module.exports = { runMigrations, STEPS };
