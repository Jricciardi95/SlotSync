import * as SQLite from 'expo-sqlite';

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

const createDatabaseAsync = async () => {
  const db = await SQLite.openDatabaseAsync('slotsync.db');
  await db.execAsync('PRAGMA journal_mode = WAL;');
  await db.execAsync('PRAGMA foreign_keys = ON;');

  await db.withTransactionAsync(async () => {
    await db.execAsync(`CREATE TABLE IF NOT EXISTS rows (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );`);

    await db.execAsync(`CREATE TABLE IF NOT EXISTS units (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        rowId TEXT,
        positionIndex INTEGER NOT NULL DEFAULT 0,
        ipAddress TEXT NOT NULL,
        totalSlots INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL,
        FOREIGN KEY (rowId) REFERENCES rows(id) ON DELETE SET NULL
      );`);

    await db.execAsync(`CREATE TABLE IF NOT EXISTS records (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        artist TEXT NOT NULL,
        artistLastName TEXT,
        year INTEGER,
        genre TEXT,
        notes TEXT,
        coverImageLocalUri TEXT,
        coverImageRemoteUrl TEXT,
        discogsId TEXT,
        musicbrainzId TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );`);

    await db.execAsync(`CREATE TABLE IF NOT EXISTS shelfSlotGroups (
        id TEXT PRIMARY KEY NOT NULL,
        unitId TEXT NOT NULL,
        physicalSlots TEXT NOT NULL,
        recordId TEXT,
        FOREIGN KEY (unitId) REFERENCES units(id) ON DELETE CASCADE,
        FOREIGN KEY (recordId) REFERENCES records(id) ON DELETE SET NULL
      );`);

    await db.execAsync(`CREATE TABLE IF NOT EXISTS recordLocations (
        id TEXT PRIMARY KEY NOT NULL,
        recordId TEXT UNIQUE NOT NULL,
        unitId TEXT NOT NULL,
        slotNumbers TEXT NOT NULL,
        FOREIGN KEY (recordId) REFERENCES records(id) ON DELETE CASCADE,
        FOREIGN KEY (unitId) REFERENCES units(id) ON DELETE CASCADE
      );`);

    await db.execAsync(`CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY NOT NULL,
        startedAt TEXT NOT NULL,
        endedAt TEXT,
        cleanedUp INTEGER NOT NULL DEFAULT 0
      );`);

    await db.execAsync(`CREATE TABLE IF NOT EXISTS sessionRecords (
        id TEXT PRIMARY KEY NOT NULL,
        sessionId TEXT NOT NULL,
        recordId TEXT NOT NULL,
        pulledAt TEXT NOT NULL,
        returnedAt TEXT,
        FOREIGN KEY (sessionId) REFERENCES sessions(id) ON DELETE CASCADE,
        FOREIGN KEY (recordId) REFERENCES records(id) ON DELETE CASCADE
      );`);

    await db.execAsync(`CREATE TABLE IF NOT EXISTS tracks (
        id TEXT PRIMARY KEY NOT NULL,
        recordId TEXT NOT NULL,
        title TEXT NOT NULL,
        trackNumber INTEGER,
        discNumber INTEGER,
        side TEXT,
        durationSeconds INTEGER,
        FOREIGN KEY (recordId) REFERENCES records(id) ON DELETE CASCADE
      );`);

    await db.execAsync(`CREATE TABLE IF NOT EXISTS batch_jobs (
        id TEXT PRIMARY KEY NOT NULL,
        createdAt TEXT NOT NULL,
        completedAt TEXT,
        status TEXT NOT NULL DEFAULT 'pending'
      );`);

    await db.execAsync(`CREATE TABLE IF NOT EXISTS batch_photos (
        id TEXT PRIMARY KEY NOT NULL,
        jobId TEXT NOT NULL,
        photoUri TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        resultData TEXT,
        errorMessage TEXT,
        processedAt TEXT,
        FOREIGN KEY (jobId) REFERENCES batch_jobs(id) ON DELETE CASCADE
      );`);

    // Migrations: Add columns to records table if they don't exist
    const migrations = [
      { column: 'genre', type: 'TEXT' },
      { column: 'discogsId', type: 'TEXT' },
      { column: 'musicbrainzId', type: 'TEXT' },
    ];

    for (const migration of migrations) {
      try {
        await db.execAsync(`ALTER TABLE records ADD COLUMN ${migration.column} ${migration.type};`);
        console.log(`[Database] ✅ Added column: ${migration.column}`);
      } catch (error: any) {
        // Column already exists, ignore error
        if (!error.message?.includes('duplicate column name')) {
          console.warn(`[Database] Migration warning for ${migration.column}:`, error.message);
        }
      }
    }

    // Create image_hashes table for caching identified albums
    await db.execAsync(`CREATE TABLE IF NOT EXISTS image_hashes (
        id TEXT PRIMARY KEY NOT NULL,
        imageHash TEXT UNIQUE NOT NULL,
        recordId TEXT NOT NULL,
        submittedImageUri TEXT,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (recordId) REFERENCES records(id) ON DELETE CASCADE
      );`);

    // Create index on imageHash for fast lookups
    try {
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_image_hashes_hash ON image_hashes(imageHash);`);
    } catch (error: any) {
      // Index might already exist, ignore
      console.warn('[Database] Index creation warning:', error.message);
    }

    // Create playlists table
    await db.execAsync(`CREATE TABLE IF NOT EXISTS playlists (
        id TEXT PRIMARY KEY NOT NULL,
        name TEXT NOT NULL,
        description TEXT,
        createdAt TEXT NOT NULL,
        updatedAt TEXT NOT NULL
      );`);

    // Create playlist_items table (supports both records/albums and tracks/songs)
    await db.execAsync(`CREATE TABLE IF NOT EXISTS playlist_items (
        id TEXT PRIMARY KEY NOT NULL,
        playlistId TEXT NOT NULL,
        itemType TEXT NOT NULL CHECK(itemType IN ('record', 'track')),
        recordId TEXT,
        trackId TEXT,
        position INTEGER NOT NULL DEFAULT 0,
        addedAt TEXT NOT NULL,
        FOREIGN KEY (playlistId) REFERENCES playlists(id) ON DELETE CASCADE,
        FOREIGN KEY (recordId) REFERENCES records(id) ON DELETE CASCADE,
        FOREIGN KEY (trackId) REFERENCES tracks(id) ON DELETE CASCADE,
        CHECK((itemType = 'record' AND recordId IS NOT NULL AND trackId IS NULL) OR
              (itemType = 'track' AND trackId IS NOT NULL AND recordId IS NULL)),
        UNIQUE(playlistId, recordId, trackId)
      );`);

    // Create index on playlist_items for fast lookups
    try {
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist ON playlist_items(playlistId);`);
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_playlist_items_record ON playlist_items(recordId);`);
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_playlist_items_track ON playlist_items(trackId);`);
    } catch (error: any) {
      console.warn('[Database] Playlist index creation warning:', error.message);
    }

    // Migration: Rename playlist_records to playlist_items if it exists
    try {
      await db.execAsync(`ALTER TABLE playlist_records RENAME TO playlist_records_old;`);
      // Copy data from old table to new table
      await db.execAsync(`
        INSERT INTO playlist_items (id, playlistId, itemType, recordId, trackId, position, addedAt)
        SELECT id, playlistId, 'record', recordId, NULL, position, addedAt
        FROM playlist_records_old;
      `);
      await db.execAsync(`DROP TABLE playlist_records_old;`);
      console.log('[Database] ✅ Migrated playlist_records to playlist_items');
    } catch (error: any) {
      // Table doesn't exist or already migrated, ignore
      if (!error.message?.includes('no such table') && !error.message?.includes('already exists')) {
        console.warn('[Database] Migration warning:', error.message);
      }
    }
  });

  return db;
};

export const getDatabase = async () => {
  if (!dbPromise) {
    dbPromise = createDatabaseAsync();
  }

  return dbPromise;
};

export const initializeDatabase = async () => {
  await getDatabase();
};

