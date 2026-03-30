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

    // PR7: Create slots table (one row per slot per unit)
    await db.execAsync(`CREATE TABLE IF NOT EXISTS slots (
        id TEXT PRIMARY KEY NOT NULL,
        unitId TEXT NOT NULL,
        slotNumber INTEGER NOT NULL,
        createdAt TEXT NOT NULL,
        FOREIGN KEY (unitId) REFERENCES units(id) ON DELETE CASCADE,
        UNIQUE(unitId, slotNumber)
      );`);

    // PR7: Create recordSlotAssignments table with constraints
    // A slot can have at most one record
    // A record can have at most one slot assignment
    await db.execAsync(`CREATE TABLE IF NOT EXISTS recordSlotAssignments (
        id TEXT PRIMARY KEY NOT NULL,
        recordId TEXT UNIQUE NOT NULL,
        unitId TEXT NOT NULL,
        slotId TEXT NOT NULL,
        assignedAt TEXT NOT NULL,
        FOREIGN KEY (recordId) REFERENCES records(id) ON DELETE CASCADE,
        FOREIGN KEY (unitId) REFERENCES units(id) ON DELETE CASCADE,
        FOREIGN KEY (slotId) REFERENCES slots(id) ON DELETE CASCADE,
        UNIQUE(slotId) -- A slot can have at most one record
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
        bpm INTEGER,
        FOREIGN KEY (recordId) REFERENCES records(id) ON DELETE CASCADE
      );`);
    
    // Migration: Add BPM column if it doesn't exist (for existing databases)
    try {
      await db.execAsync(`ALTER TABLE tracks ADD COLUMN bpm INTEGER;`);
    } catch (error: any) {
      // Column already exists, ignore error
      if (!error.message?.includes('duplicate column name')) {
        console.warn('[Database] Could not add bpm column (may already exist):', error.message);
      }
    }

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
      // PR3: Add normalized columns for duplicate prevention
      { column: 'normalizedTitle', type: 'TEXT' },
      { column: 'normalizedArtist', type: 'TEXT' },
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
    
    // PR3: Create unique indexes for duplicate prevention
    try {
      // Unique index on discogsId (when present)
      await db.execAsync(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_records_discogs_id_unique 
        ON records(discogsId) 
        WHERE discogsId IS NOT NULL;
      `);
      console.log('[Database] ✅ Created unique index on discogsId');
    } catch (error: any) {
      console.warn('[Database] Index creation warning for discogsId:', error.message);
    }
    
    try {
      // Unique index on (normalizedArtist, normalizedTitle, year) when year is present
      await db.execAsync(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_records_identity_with_year 
        ON records(normalizedArtist, normalizedTitle, year) 
        WHERE normalizedArtist IS NOT NULL AND normalizedTitle IS NOT NULL AND year IS NOT NULL;
      `);
      console.log('[Database] ✅ Created unique index on (normalizedArtist, normalizedTitle, year)');
    } catch (error: any) {
      console.warn('[Database] Index creation warning for identity_with_year:', error.message);
    }
    
    try {
      // Unique index on (normalizedArtist, normalizedTitle) when year is NULL
      await db.execAsync(`
        CREATE UNIQUE INDEX IF NOT EXISTS idx_records_identity_no_year 
        ON records(normalizedArtist, normalizedTitle) 
        WHERE normalizedArtist IS NOT NULL AND normalizedTitle IS NOT NULL AND year IS NULL;
      `);
      console.log('[Database] ✅ Created unique index on (normalizedArtist, normalizedTitle)');
    } catch (error: any) {
      console.warn('[Database] Index creation warning for identity_no_year:', error.message);
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
    
    // PR5: Add performance indexes for hot paths
    try {
      // Indexes for records table (search/filter operations)
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_records_normalized_artist ON records(normalizedArtist);`);
      console.log('[Database] ✅ Created index on records(normalizedArtist)');
    } catch (error: any) {
      console.warn('[Database] Index creation warning for normalizedArtist:', error.message);
    }
    
    try {
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_records_normalized_title ON records(normalizedTitle);`);
      console.log('[Database] ✅ Created index on records(normalizedTitle)');
    } catch (error: any) {
      console.warn('[Database] Index creation warning for normalizedTitle:', error.message);
    }
    
    try {
      // Composite index for artist+title searches (already have unique index, but this is for non-unique queries)
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_records_artist_title ON records(normalizedArtist, normalizedTitle);`);
      console.log('[Database] ✅ Created index on records(normalizedArtist, normalizedTitle)');
    } catch (error: any) {
      console.warn('[Database] Index creation warning for artist_title:', error.message);
    }
    
    try {
      // Index for tracks table (foreign key lookups)
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_tracks_record_id ON tracks(recordId);`);
      console.log('[Database] ✅ Created index on tracks(recordId)');
    } catch (error: any) {
      console.warn('[Database] Index creation warning for tracks(recordId):', error.message);
    }
    
    try {
      // Index for playlist_items ordering (position/sortOrder)
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist_position ON playlist_items(playlistId, position);`);
      console.log('[Database] ✅ Created index on playlist_items(playlistId, position)');
    } catch (error: any) {
      console.warn('[Database] Index creation warning for playlist_items(playlistId, position):', error.message);
    }
    
    try {
      // Indexes for recordLocations table (shelf/slot lookups)
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_record_locations_record_id ON recordLocations(recordId);`);
      console.log('[Database] ✅ Created index on recordLocations(recordId)');
    } catch (error: any) {
      console.warn('[Database] Index creation warning for recordLocations(recordId):', error.message);
    }
    
    try {
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_record_locations_unit_id ON recordLocations(unitId);`);
      console.log('[Database] ✅ Created index on recordLocations(unitId)');
    } catch (error: any) {
      console.warn('[Database] Index creation warning for recordLocations(unitId):', error.message);
    }
    
    // PR7: Create indexes for slot assignment tables
    try {
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_slots_unit_id ON slots(unitId);`);
      console.log('[Database] ✅ Created index on slots(unitId)');
    } catch (error: any) {
      console.warn('[Database] Index creation warning for slots(unitId):', error.message);
    }
    
    try {
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_record_slot_assignments_record_id ON recordSlotAssignments(recordId);`);
      console.log('[Database] ✅ Created index on recordSlotAssignments(recordId)');
    } catch (error: any) {
      console.warn('[Database] Index creation warning for recordSlotAssignments(recordId):', error.message);
    }
    
    try {
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_record_slot_assignments_unit_id ON recordSlotAssignments(unitId);`);
      console.log('[Database] ✅ Created index on recordSlotAssignments(unitId)');
    } catch (error: any) {
      console.warn('[Database] Index creation warning for recordSlotAssignments(unitId):', error.message);
    }
    
    try {
      await db.execAsync(`CREATE INDEX IF NOT EXISTS idx_record_slot_assignments_slot_id ON recordSlotAssignments(slotId);`);
      console.log('[Database] ✅ Created index on recordSlotAssignments(slotId)');
    } catch (error: any) {
      console.warn('[Database] Index creation warning for recordSlotAssignments(slotId):', error.message);
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

  // PR3: Backfill normalized columns for existing records
  // NOTE: This runs OUTSIDE the main transaction to avoid nested transaction errors
  // and ensures columns are committed before backfilling
  try {
    const { normalizeText } = await import('../utils/normalizeText');
    const existingRecords = await db.getAllAsync<{ id: string; artist: string; title: string }>(
      `SELECT id, artist, title FROM records WHERE normalizedArtist IS NULL OR normalizedTitle IS NULL`
    );
    
    if (existingRecords.length > 0) {
      // Use a separate transaction for backfill (not nested)
      await db.withTransactionAsync(async () => {
        for (const record of existingRecords) {
          const normalizedArtist = normalizeText(record.artist);
          const normalizedTitle = normalizeText(record.title);
          await db.runAsync(
            `UPDATE records SET normalizedArtist = ?, normalizedTitle = ? WHERE id = ?`,
            normalizedArtist,
            normalizedTitle,
            record.id
          );
        }
      });
      console.log(`[Database] ✅ Backfilled normalized columns for ${existingRecords.length} existing records`);
    }
  } catch (error: any) {
    console.warn('[Database] Backfill warning:', error.message);
  }

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

