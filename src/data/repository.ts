import { SQLiteDatabase } from 'expo-sqlite';
import { getDatabase } from './database';
import {
  RecordLocation,
  RecordModel,
  Row,
  Session,
  SessionRecord,
  ShelfSlotGroup,
  Track,
  Unit,
  RecordLocationDetails,
  BatchJob,
  BatchPhoto,
} from './types';
import { generateId } from '../utils/id';

const now = () => new Date().toISOString();

const serializeNumberArray = (values: number[]) => JSON.stringify(values);
const parseNumberArray = (payload: string | null): number[] => {
  if (!payload) return [];
  try {
    const parsed = JSON.parse(payload);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/* Rows */
export const createRow = async (name: string): Promise<Row> => {
  const db = await getDatabase();
  const id = generateId('row');
  const timestamp = now();

  await db.runAsync(
    `INSERT INTO rows (id, name, createdAt, updatedAt) VALUES (?, ?, ?, ?)`,
    id,
    name.trim(),
    timestamp,
    timestamp
  );

  return {
    id,
    name: name.trim(),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const getRows = async (): Promise<Row[]> => {
  const db = await getDatabase();
  return db.getAllAsync<Row>(
    `SELECT * FROM rows ORDER BY updatedAt DESC, createdAt DESC`
  );
};

export const updateRow = async (rowId: string, name: string): Promise<void> => {
  const db = await getDatabase();
  const timestamp = now();
  await db.runAsync(
    `UPDATE rows SET name = ?, updatedAt = ? WHERE id = ?`,
    name.trim(),
    timestamp,
    rowId
  );
};

export const deleteRow = async (rowId: string): Promise<void> => {
  const db = await getDatabase();
  // Delete row (cascade will handle units and slot groups)
  await db.runAsync(`DELETE FROM rows WHERE id = ?`, rowId);
};

export const getRowUnitCounts = async (): Promise<Record<string, number>> => {
  const db = await getDatabase();
  const counts = await db.getAllAsync<{ rowId: string | null; total: number }>(
    `SELECT rowId, COUNT(*) as total FROM units WHERE rowId IS NOT NULL GROUP BY rowId`
  );

  return counts.reduce<Record<string, number>>((acc, entry) => {
    if (entry.rowId) {
      acc[entry.rowId] = entry.total;
    }
    return acc;
  }, {});
};

/* Units */
type CreateUnitInput = {
  name: string;
  rowId?: string | null;
  positionIndex?: number;
  ipAddress: string;
  totalSlots: number;
};

const getNextPositionIndex = async (
  db: SQLiteDatabase,
  rowId?: string | null
) => {
  if (!rowId) return 0;
  const result = await db.getFirstAsync<{ maxIndex: number | null }>(
    `SELECT MAX(positionIndex) as maxIndex FROM units WHERE rowId = ?`,
    rowId
  );
  return (result?.maxIndex ?? -1) + 1;
};

const initializeSlotGroupsForUnit = async (
  db: SQLiteDatabase,
  unitId: string,
  totalSlots: number
) => {
  await db.withTransactionAsync(async () => {
    for (let slot = 1; slot <= totalSlots; slot += 1) {
      await db.runAsync(
        `INSERT INTO shelfSlotGroups (id, unitId, physicalSlots, recordId)
         VALUES (?, ?, ?, NULL)`,
        generateId('slotgrp'),
        unitId,
        serializeNumberArray([slot])
      );
    }
  });
};

export const createUnit = async ({
  name,
  rowId = null,
  positionIndex,
  ipAddress,
  totalSlots,
}: CreateUnitInput): Promise<Unit> => {
  const db = await getDatabase();
  const id = generateId('unit');
  const timestamp = now();
  const resolvedPosition =
    typeof positionIndex === 'number'
      ? positionIndex
      : await getNextPositionIndex(db, rowId);

  await db.runAsync(
    `INSERT INTO units (id, name, rowId, positionIndex, ipAddress, totalSlots, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    name.trim(),
    rowId,
    resolvedPosition,
    ipAddress,
    totalSlots,
    timestamp,
    timestamp
  );

  await initializeSlotGroupsForUnit(db, id, totalSlots);

  return {
    id,
    name: name.trim(),
    rowId,
    positionIndex: resolvedPosition,
    ipAddress,
    totalSlots,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const getUnitsByRow = async (rowId: string): Promise<Unit[]> => {
  const db = await getDatabase();
  return db.getAllAsync<Unit>(
    `SELECT * FROM units WHERE rowId = ? ORDER BY positionIndex ASC`,
    rowId
  );
};

export const getUnitById = async (unitId: string): Promise<Unit | null> => {
  const db = await getDatabase();
  const unit = await db.getFirstAsync<Unit>(
    `SELECT * FROM units WHERE id = ? LIMIT 1`,
    unitId
  );
  return unit ?? null;
};

export const persistUnitOrder = async (
  rowId: string,
  orderedUnits: Unit[]
): Promise<void> => {
  const db = await getDatabase();
  const timestamp = now();

  await db.withTransactionAsync(async () => {
    for (let index = 0; index < orderedUnits.length; index += 1) {
      const unit = orderedUnits[index];
      await db.runAsync(
        `UPDATE units SET positionIndex = ?, updatedAt = ? WHERE id = ? AND rowId = ?`,
        index,
        timestamp,
        unit.id,
        rowId
      );
    }
  });
};

/* Shelf slot groups */
export const getShelfSlotGroupsByUnit = async (
  unitId: string
): Promise<ShelfSlotGroup[]> => {
  const db = await getDatabase();
  const rawGroups = await db.getAllAsync<
    ShelfSlotGroup & { physicalSlots: string }
  >(
    `SELECT * FROM shelfSlotGroups
      WHERE unitId = ?
      ORDER BY CAST(json_extract(physicalSlots, '$[0]') AS INTEGER) ASC`,
    unitId
  );

  return rawGroups.map((group) => ({
    ...group,
    physicalSlots: parseNumberArray(
      group.physicalSlots as unknown as string
    ).sort((a, b) => a - b),
  }));
};

export const mergeShelfSlotGroups = async (
  unitId: string,
  groupIds: string[],
  mergedSlots: number[]
): Promise<void> => {
  if (!groupIds.length) return;
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    const placeholders = groupIds.map(() => '?').join(', ');
    await db.runAsync(
      `DELETE FROM shelfSlotGroups WHERE id IN (${placeholders})`,
      ...groupIds
    );
    await db.runAsync(
      `INSERT INTO shelfSlotGroups (id, unitId, physicalSlots, recordId)
       VALUES (?, ?, ?, NULL)`,
      generateId('slotgrp'),
      unitId,
      serializeNumberArray(mergedSlots)
    );
  });
};

export const splitShelfSlotGroup = async (
  groupId: string,
  unitId: string,
  slots: number[]
): Promise<void> => {
  const db = await getDatabase();
  await db.withTransactionAsync(async () => {
    await db.runAsync(`DELETE FROM shelfSlotGroups WHERE id = ?`, groupId);
    for (const slot of slots) {
      await db.runAsync(
        `INSERT INTO shelfSlotGroups (id, unitId, physicalSlots, recordId)
         VALUES (?, ?, ?, NULL)`,
        generateId('slotgrp'),
        unitId,
        serializeNumberArray([slot])
      );
    }
  });
};

/* Records */
type CreateRecordInput = Omit<RecordModel, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

export const createRecord = async (
  input: CreateRecordInput
): Promise<RecordModel> => {
  const db = await getDatabase();
  const id = input.id ?? generateId('record');
  const timestamp = now();

  await db.runAsync(
    `INSERT INTO records (
      id, title, artist, artistLastName, year, notes,
      coverImageLocalUri, coverImageRemoteUrl, createdAt, updatedAt
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.title,
    input.artist,
    input.artistLastName ?? null,
    input.year ?? null,
    input.notes ?? null,
    input.coverImageLocalUri ?? null,
    input.coverImageRemoteUrl ?? null,
    timestamp,
    timestamp
  );

  return {
    id,
    title: input.title,
    artist: input.artist,
    artistLastName: input.artistLastName ?? null,
    year: input.year ?? null,
    notes: input.notes ?? null,
    coverImageLocalUri: input.coverImageLocalUri ?? null,
    coverImageRemoteUrl: input.coverImageRemoteUrl ?? null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const getRecords = async (): Promise<RecordModel[]> => {
  const db = await getDatabase();
  return db.getAllAsync<RecordModel>(
    `SELECT * FROM records ORDER BY updatedAt DESC`
  );
};

/* Record locations */
type SetRecordLocationInput = {
  recordId: string;
  unitId: string;
  slotNumbers: number[];
  locationId?: string;
};

export const setRecordLocation = async ({
  recordId,
  unitId,
  slotNumbers,
  locationId,
}: SetRecordLocationInput): Promise<RecordLocation> => {
  const db = await getDatabase();
  const id = locationId ?? generateId('recloc');
  const serializedSlots = serializeNumberArray(slotNumbers);

  await db.runAsync(
    `INSERT INTO recordLocations (id, recordId, unitId, slotNumbers)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(recordId) DO UPDATE SET
       unitId=excluded.unitId,
       slotNumbers=excluded.slotNumbers`,
    id,
    recordId,
    unitId,
    serializedSlots
  );

  return {
    id,
    recordId,
    unitId,
    slotNumbers,
  };
};

export const getRecordLocationByRecord = async (
  recordId: string
): Promise<RecordLocation | null> => {
  const db = await getDatabase();
  const location = await db.getFirstAsync<
    RecordLocation & { slotNumbers: string }
  >(
    `SELECT * FROM recordLocations WHERE recordId = ? LIMIT 1`,
    recordId
  );

  if (!location) return null;

  return {
    ...location,
    slotNumbers: parseNumberArray(
      location.slotNumbers as unknown as string
    ),
  };
};

export const getRecordLocationDetails = async (
  recordId: string
): Promise<RecordLocationDetails | null> => {
  const db = await getDatabase();
  const location = await db.getFirstAsync<
    RecordLocationDetails & { slotNumbers: string; unitName: string; rowName: string | null }
  >(
    `SELECT rl.*, u.name as unitName, rw.name as rowName
     FROM recordLocations rl
     JOIN units u ON rl.unitId = u.id
     LEFT JOIN rows rw ON u.rowId = rw.id
     WHERE rl.recordId = ?
     LIMIT 1`,
    recordId
  );

  if (!location) return null;

  return {
    ...location,
    slotNumbers: parseNumberArray(location.slotNumbers as unknown as string),
    unitName: location.unitName,
    rowName: location.rowName,
  };
};

export const getPlacedRecordIds = async (): Promise<Set<string>> => {
  const db = await getDatabase();
  const rows = await db.getAllAsync<{ recordId: string }>(
    `SELECT recordId FROM recordLocations`
  );
  return new Set(rows.map((row) => row.recordId));
};

export const getRecordById = async (
  recordId: string
): Promise<RecordModel | null> => {
  const db = await getDatabase();
  const record = await db.getFirstAsync<RecordModel>(
    `SELECT * FROM records WHERE id = ? LIMIT 1`,
    recordId
  );
  return record ?? null;
};

/**
 * Check if a record with the same artist and title already exists
 */
export const findDuplicateRecord = async (
  artist: string,
  title: string
): Promise<RecordModel | null> => {
  const db = await getDatabase();
  const record = await db.getFirstAsync<RecordModel>(
    `SELECT * FROM records 
     WHERE LOWER(artist) = LOWER(?) AND LOWER(title) = LOWER(?)
     LIMIT 1`,
    artist.trim(),
    title.trim()
  );
  return record ?? null;
};

/**
 * Delete a record and all associated tracks
 */
export const deleteRecord = async (recordId: string): Promise<void> => {
  const db = await getDatabase();
  // Foreign key cascade will handle tracks deletion
  await db.runAsync(`DELETE FROM records WHERE id = ?`, recordId);
};

type AssignRecordToSlotGroupInput = {
  recordId: string;
  slotGroupId: string;
};

export const assignRecordToSlotGroup = async ({
  recordId,
  slotGroupId,
}: AssignRecordToSlotGroupInput): Promise<RecordLocation> => {
  const db = await getDatabase();
  const slotGroup = await db.getFirstAsync<{
    id: string;
    unitId: string;
    physicalSlots: string;
  }>(
    `SELECT id, unitId, physicalSlots FROM shelfSlotGroups WHERE id = ? LIMIT 1`,
    slotGroupId
  );

  if (!slotGroup) {
    throw new Error('Slot group not found');
  }

  const slotNumbers = parseNumberArray(
    slotGroup.physicalSlots as unknown as string
  );

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE shelfSlotGroups SET recordId = NULL WHERE recordId = ?`,
      recordId
    );
    await db.runAsync(
      `UPDATE shelfSlotGroups SET recordId = ? WHERE id = ?`,
      recordId,
      slotGroupId
    );
  });

  return setRecordLocation({
    recordId,
    unitId: slotGroup.unitId,
    slotNumbers,
  });
};

/* Sessions */
export const createSession = async (): Promise<Session> => {
  const db = await getDatabase();
  const id = generateId('session');
  const startedAt = now();

  await db.runAsync(
    `INSERT INTO sessions (id, startedAt, cleanedUp) VALUES (?, ?, 0)`,
    id,
    startedAt
  );

  return { id, startedAt, cleanedUp: false, endedAt: null };
};

type UpdateSessionInput = {
  sessionId: string;
  endedAt?: string | null;
  cleanedUp?: boolean;
};

export const updateSession = async ({
  sessionId,
  endedAt,
  cleanedUp,
}: UpdateSessionInput): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE sessions SET
      endedAt = COALESCE(?, endedAt),
      cleanedUp = COALESCE(?, cleanedUp)
     WHERE id = ?`,
    endedAt ?? null,
    typeof cleanedUp === 'boolean' ? Number(cleanedUp) : null,
    sessionId
  );
};

type SessionRow = Omit<Session, 'cleanedUp'> & { cleanedUp: number };

export const getSessions = async (): Promise<Session[]> => {
  const db = await getDatabase();
  const rawSessions = await db.getAllAsync<SessionRow>(
    `SELECT * FROM sessions ORDER BY startedAt DESC`
  );

  return rawSessions.map((session) => ({
    ...session,
    cleanedUp: Boolean(session.cleanedUp),
  }));
};

/* Session Records */
type CreateSessionRecordInput = {
  sessionId: string;
  recordId: string;
};

export const createSessionRecord = async ({
  sessionId,
  recordId,
}: CreateSessionRecordInput): Promise<SessionRecord> => {
  const db = await getDatabase();
  const id = generateId('sessrec');
  const pulledAt = now();

  await db.runAsync(
    `INSERT INTO sessionRecords (id, sessionId, recordId, pulledAt)
     VALUES (?, ?, ?, ?)`,
    id,
    sessionId,
    recordId,
    pulledAt
  );

  return { id, sessionId, recordId, pulledAt, returnedAt: null };
};

export const markSessionRecordReturned = async (
  sessionRecordId: string
): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE sessionRecords SET returnedAt = ? WHERE id = ?`,
    now(),
    sessionRecordId
  );
};

export const getActiveSession = async (): Promise<Session | null> => {
  const db = await getDatabase();
  const session = await db.getFirstAsync<SessionRow>(
    `SELECT * FROM sessions WHERE endedAt IS NULL ORDER BY startedAt DESC LIMIT 1`
  );
  if (!session) return null;
  return {
    ...session,
    cleanedUp: Boolean(session.cleanedUp),
  };
};

export const getSessionRecords = async (
  sessionId: string
): Promise<SessionRecord[]> => {
  const db = await getDatabase();
  return db.getAllAsync<SessionRecord>(
    `SELECT * FROM sessionRecords WHERE sessionId = ? ORDER BY pulledAt DESC`,
    sessionId
  );
};

export const getSessionRecordsByRecordIds = async (
  recordIds: string[]
): Promise<SessionRecord[]> => {
  if (!recordIds.length) return [];
  const db = await getDatabase();
  const placeholders = recordIds.map(() => '?').join(', ');
  return db.getAllAsync<SessionRecord>(
    `SELECT * FROM sessionRecords WHERE recordId IN (${placeholders}) AND returnedAt IS NULL`,
    ...recordIds
  );
};

export const markSessionRecordsReturnedByRecordIds = async (
  recordIds: string[]
): Promise<void> => {
  if (!recordIds.length) return;
  const db = await getDatabase();
  const placeholders = recordIds.map(() => '?').join(', ');
  await db.runAsync(
    `UPDATE sessionRecords SET returnedAt = ? WHERE recordId IN (${placeholders}) AND returnedAt IS NULL`,
    now(),
    ...recordIds
  );
};

export const getRecordsByRow = async (rowId: string): Promise<RecordModel[]> => {
  const db = await getDatabase();
  return db.getAllAsync<RecordModel>(
    `SELECT r.* FROM records r
     INNER JOIN recordLocations rl ON r.id = rl.recordId
     INNER JOIN units u ON rl.unitId = u.id
     WHERE u.rowId = ?
     ORDER BY r.updatedAt DESC`,
    rowId
  );
};

export const getSlotGroupsByRow = async (
  rowId: string
): Promise<(ShelfSlotGroup & { unitName: string; unitIpAddress: string })[]> => {
  const db = await getDatabase();
  const rawGroups = await db.getAllAsync<
    ShelfSlotGroup & {
      physicalSlots: string;
      unitName: string;
      unitIpAddress: string;
    }
  >(
    `SELECT ssg.*, u.name as unitName, u.ipAddress as unitIpAddress
     FROM shelfSlotGroups ssg
     INNER JOIN units u ON ssg.unitId = u.id
     WHERE u.rowId = ?
     ORDER BY u.positionIndex ASC, CAST(json_extract(ssg.physicalSlots, '$[0]') AS INTEGER) ASC`,
    rowId
  );

  return rawGroups.map((group) => ({
    ...group,
    physicalSlots: parseNumberArray(
      group.physicalSlots as unknown as string
    ).sort((a, b) => a - b),
  }));
};

/* Tracks */
type CreateTrackInput = {
  recordId: string;
  title: string;
  trackNumber?: number | null;
  discNumber?: number | null;
  side?: string | null;
  durationSeconds?: number | null;
};

export const createTrack = async (input: CreateTrackInput): Promise<Track> => {
  const db = await getDatabase();
  const id = generateId('track');

  await db.runAsync(
    `INSERT INTO tracks (id, recordId, title, trackNumber, discNumber, side, durationSeconds)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.recordId,
    input.title,
    input.trackNumber ?? null,
    input.discNumber ?? null,
    input.side ?? null,
    input.durationSeconds ?? null
  );

  return {
    id,
    recordId: input.recordId,
    title: input.title,
    trackNumber: input.trackNumber ?? null,
    discNumber: input.discNumber ?? null,
    side: input.side ?? null,
    durationSeconds: input.durationSeconds ?? null,
  };
};

export const getTracksByRecord = async (recordId: string): Promise<Track[]> => {
  const db = await getDatabase();
  return db.getAllAsync<Track>(
    `SELECT * FROM tracks WHERE recordId = ? ORDER BY trackNumber ASC, discNumber ASC, side ASC`,
    recordId
  );
};

export const searchTracksByTitle = async (query: string): Promise<Track[]> => {
  const db = await getDatabase();
  return db.getAllAsync<Track>(
    `SELECT * FROM tracks WHERE title LIKE ? ORDER BY title ASC`,
    `%${query}%`
  );
};

export const getRecordsByTrackTitle = async (
  trackTitle: string
): Promise<RecordModel[]> => {
  const db = await getDatabase();
  return db.getAllAsync<RecordModel>(
    `SELECT DISTINCT r.* FROM records r
     INNER JOIN tracks t ON r.id = t.recordId
     WHERE t.title LIKE ?
     ORDER BY r.updatedAt DESC`,
    `%${trackTitle}%`
  );
};

/**
 * Get all unique artists from records
 */
export const getAllArtists = async (): Promise<string[]> => {
  const db = await getDatabase();
  const results = await db.getAllAsync<{ artist: string }>(
    `SELECT DISTINCT artist FROM records WHERE artist IS NOT NULL AND artist != '' ORDER BY artist ASC`
  );
  return results.map((r) => r.artist);
};

/**
 * Search artists by name (fuzzy search)
 */
export const searchArtists = async (query: string): Promise<string[]> => {
  const db = await getDatabase();
  return db.getAllAsync<{ artist: string }>(
    `SELECT DISTINCT artist FROM records 
     WHERE artist LIKE ? 
     ORDER BY artist ASC`,
    `%${query}%`
  ).then(results => results.map(r => r.artist));
};

export const deleteTrack = async (trackId: string): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM tracks WHERE id = ?`, trackId);
};

export const updateTrack = async (
  trackId: string,
  updates: Partial<Omit<Track, 'id' | 'recordId'>>
): Promise<void> => {
  const db = await getDatabase();
  const fields: string[] = [];
  const values: (string | number | null)[] = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.trackNumber !== undefined) {
    fields.push('trackNumber = ?');
    values.push(updates.trackNumber);
  }
  if (updates.discNumber !== undefined) {
    fields.push('discNumber = ?');
    values.push(updates.discNumber);
  }
  if (updates.side !== undefined) {
    fields.push('side = ?');
    values.push(updates.side);
  }
  if (updates.durationSeconds !== undefined) {
    fields.push('durationSeconds = ?');
    values.push(updates.durationSeconds);
  }

  if (fields.length === 0) return;

  values.push(trackId);
  await db.runAsync(
    `UPDATE tracks SET ${fields.join(', ')} WHERE id = ?`,
    ...values
  );
};

