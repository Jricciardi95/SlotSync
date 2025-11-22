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
        notes TEXT,
        coverImageLocalUri TEXT,
        coverImageRemoteUrl TEXT,
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

