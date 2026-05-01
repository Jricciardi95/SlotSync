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
  ImageHash,
  Playlist,
  PlaylistItem,
  PlaylistRecord,
  Slot,
  RecordSlotAssignment,
  SlotWithAssignment,
} from './types';
import { generateId } from '../utils/id';
import { logger } from '../utils/logger';
import { normalizeText } from '../utils/normalizeText';

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

/**
 * Blueprint / standalone unit creation uses rowId = NULL. The record detail
 * "Assign Location" flow lists rows, then units per row — orphan units never appear.
 * Attach those units to a single default row so assignment always works.
 */
export const attachOrphanUnitsToDefaultRow = async (): Promise<void> => {
  const db = await getDatabase();
  const orphans = await db.getAllAsync<Unit>(
    `SELECT * FROM units WHERE rowId IS NULL ORDER BY createdAt ASC`
  );
  if (orphans.length === 0) return;

  const rows = await getRows();
  let targetRowId: string;

  if (rows.length === 0) {
    const row = await createRow('Shelves');
    targetRowId = row.id;
  } else {
    targetRowId = rows[0].id;
  }

  const timestamp = now();
  await db.withTransactionAsync(async () => {
    for (const unit of orphans) {
      const nextIndex = await getNextPositionIndex(db, targetRowId);
      await db.runAsync(
        `UPDATE units SET rowId = ?, positionIndex = ?, updatedAt = ? WHERE id = ?`,
        targetRowId,
        nextIndex,
        timestamp,
        unit.id
      );
    }
  });
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

// PR7: Initialize slots for a unit (one row per slot)
const initializeSlotsForUnit = async (
  db: SQLiteDatabase,
  unitId: string,
  totalSlots: number
) => {
  await db.withTransactionAsync(async () => {
    for (let slotNumber = 1; slotNumber <= totalSlots; slotNumber += 1) {
      await db.runAsync(
        `INSERT OR IGNORE INTO slots (id, unitId, slotNumber, createdAt)
         VALUES (?, ?, ?, ?)`,
        generateId('slot'),
        unitId,
        slotNumber,
        now()
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
  // PR7: Also initialize slots table
  await initializeSlotsForUnit(db, id, totalSlots);

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

export const getAllUnits = async (): Promise<Unit[]> => {
  const db = await getDatabase();
  return db.getAllAsync<Unit>(`SELECT * FROM units ORDER BY updatedAt DESC, createdAt DESC`);
};

export const getUnitById = async (unitId: string): Promise<Unit | null> => {
  const db = await getDatabase();
  const unit = await db.getFirstAsync<Unit>(
    `SELECT * FROM units WHERE id = ? LIMIT 1`,
    unitId
  );
  return unit ?? null;
};

export const updateUnitNetwork = async (
  unitId: string,
  updates: { ipAddress?: string; totalSlots?: number }
): Promise<void> => {
  const db = await getDatabase();
  const timestamp = now();
  const existing = await getUnitById(unitId);
  if (!existing) return;
  await db.runAsync(
    `UPDATE units
     SET ipAddress = ?, totalSlots = ?, updatedAt = ?
     WHERE id = ?`,
    updates.ipAddress ?? existing.ipAddress,
    updates.totalSlots ?? existing.totalSlots,
    timestamp,
    unitId
  );
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
type CreateRecordInput = Omit<RecordModel, 'id' | 'createdAt' | 'updatedAt' | 'normalizedTitle' | 'normalizedArtist'> & {
  id?: string;
};

/**
 * PR3: Find existing record by identity (discogsId or normalized artist+title+year)
 * 
 * @param discogsId - Discogs release ID (primary identity)
 * @param artist - Artist name
 * @param title - Album title
 * @param year - Optional year
 * @returns Existing record or null
 */
export const findRecordByIdentity = async (
  discogsId: string | null | undefined,
  artist: string,
  title: string,
  year?: number | null
): Promise<RecordModel | null> => {
  const db = await getDatabase();
  
  // Primary: Check by discogsId if present
  if (discogsId) {
    const byDiscogsId = await db.getFirstAsync<RecordModel>(
      `SELECT * FROM records WHERE discogsId = ? LIMIT 1`,
      discogsId
    );
    if (byDiscogsId) return byDiscogsId;
  }
  
  // Fallback: Check by normalized artist+title+year
  const normalizedArtist = normalizeText(artist);
  const normalizedTitle = normalizeText(title);
  
  if (year) {
    const byIdentity = await db.getFirstAsync<RecordModel>(
      `SELECT * FROM records 
       WHERE normalizedArtist = ? AND normalizedTitle = ? AND year = ?
       LIMIT 1`,
      normalizedArtist,
      normalizedTitle,
      year
    );
    if (byIdentity) return byIdentity;
  } else {
    // Year is NULL - check for records with NULL year
    const byIdentity = await db.getFirstAsync<RecordModel>(
      `SELECT * FROM records 
       WHERE normalizedArtist = ? AND normalizedTitle = ? AND year IS NULL
       LIMIT 1`,
      normalizedArtist,
      normalizedTitle
    );
    if (byIdentity) return byIdentity;
  }
  
  return null;
};

/**
 * PR3: Create or update record (UPSERT)
 * 
 * If a record with the same identity exists:
 * - Updates missing fields (cover, tracks, metadata)
 * - Returns existing record with isNew: false
 * 
 * Otherwise creates a new record with isNew: true.
 * 
 * @param input - Record data
 * @returns Created or updated record with isNew flag
 */
export const createRecord = async (
  input: CreateRecordInput
): Promise<{ record: RecordModel; isNew: boolean }> => {
  const db = await getDatabase();
  const timestamp = now();
  
  // PR3: Normalize fields for identity matching
  const normalizedArtist = normalizeText(input.artist);
  const normalizedTitle = normalizeText(input.title);
  
  // PR3: Check for existing record by identity
  const existing = await findRecordByIdentity(
    input.discogsId ?? null,
    input.artist,
    input.title,
    input.year ?? null
  );
  
  if (existing) {
    // PR3: Update existing record with missing fields
    const updates: string[] = [];
    const values: any[] = [];
    
    // Only update if new value is provided and existing is missing
    if (input.discogsId && !existing.discogsId) {
      updates.push('discogsId = ?');
      values.push(input.discogsId);
    }
    if (input.coverImageRemoteUrl && !existing.coverImageRemoteUrl) {
      updates.push('coverImageRemoteUrl = ?');
      values.push(input.coverImageRemoteUrl);
    }
    if (input.coverImageLocalUri && !existing.coverImageLocalUri) {
      updates.push('coverImageLocalUri = ?');
      values.push(input.coverImageLocalUri);
    }
    if (input.musicbrainzId && !existing.musicbrainzId) {
      updates.push('musicbrainzId = ?');
      values.push(input.musicbrainzId);
    }
    if (input.genre && !existing.genre) {
      updates.push('genre = ?');
      values.push(input.genre);
    }
    
    // Always update normalized fields and updatedAt
    updates.push('normalizedArtist = ?', 'normalizedTitle = ?', 'updatedAt = ?');
    values.push(normalizedArtist, normalizedTitle, timestamp);
    values.push(existing.id);
    
    if (updates.length > 3) { // More than just normalized fields + updatedAt
      await db.runAsync(
        `UPDATE records SET ${updates.join(', ')} WHERE id = ?`,
        ...values
      );
    } else {
      // Only update normalized fields
      await db.runAsync(
        `UPDATE records SET normalizedArtist = ?, normalizedTitle = ?, updatedAt = ? WHERE id = ?`,
        normalizedArtist,
        normalizedTitle,
        timestamp,
        existing.id
      );
    }
    
    // Return updated record
    const updated = await getRecordById(existing.id);
    if (!updated) throw new Error('Record not found after update');
    
    return { record: updated, isNew: false };
  }
  
  // PR3: Create new record with normalized fields
  const id = input.id ?? generateId('record');
  
  await db.runAsync(
    `INSERT INTO records (
      id, title, artist, artistLastName, year, genre, notes,
      coverImageLocalUri, coverImageRemoteUrl, discogsId, musicbrainzId,
      normalizedTitle, normalizedArtist,
      createdAt, updatedAt
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.title,
    input.artist,
    input.artistLastName ?? null,
    input.year ?? null,
    input.genre ?? null,
    input.notes ?? null,
    input.coverImageLocalUri ?? null,
    input.coverImageRemoteUrl ?? null,
    input.discogsId ?? null,
    input.musicbrainzId ?? null,
    normalizedTitle,
    normalizedArtist,
    timestamp,
    timestamp
  );

  const newRecord: RecordModel = {
    id,
    title: input.title,
    artist: input.artist,
    artistLastName: input.artistLastName ?? null,
    year: input.year ?? null,
    genre: input.genre ?? null,
    notes: input.notes ?? null,
    coverImageLocalUri: input.coverImageLocalUri ?? null,
    coverImageRemoteUrl: input.coverImageRemoteUrl ?? null,
    discogsId: input.discogsId ?? null,
    musicbrainzId: input.musicbrainzId ?? null,
    normalizedTitle,
    normalizedArtist,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  
  return { record: newRecord, isNew: true };
};

type UpdateRecordInput = Partial<Omit<RecordModel, 'id' | 'createdAt' | 'updatedAt'>>;

export const updateRecord = async (
  recordId: string,
  input: UpdateRecordInput
): Promise<RecordModel> => {
  const db = await getDatabase();
  const timestamp = now();

  // Build dynamic update query
  const updates: string[] = [];
  const values: any[] = [];

  if (input.title !== undefined) {
    updates.push('title = ?');
    values.push(input.title);
  }
  if (input.artist !== undefined) {
    updates.push('artist = ?');
    values.push(input.artist);
  }
  if (input.artistLastName !== undefined) {
    updates.push('artistLastName = ?');
    values.push(input.artistLastName ?? null);
  }
  if (input.year !== undefined) {
    updates.push('year = ?');
    values.push(input.year ?? null);
  }
  if (input.genre !== undefined) {
    updates.push('genre = ?');
    values.push(input.genre ?? null);
  }
  if (input.notes !== undefined) {
    updates.push('notes = ?');
    values.push(input.notes ?? null);
  }
  if (input.coverImageLocalUri !== undefined) {
    updates.push('coverImageLocalUri = ?');
    values.push(input.coverImageLocalUri ?? null);
  }
  if (input.coverImageRemoteUrl !== undefined) {
    updates.push('coverImageRemoteUrl = ?');
    values.push(input.coverImageRemoteUrl ?? null);
  }
  if (input.discogsId !== undefined) {
    updates.push('discogsId = ?');
    values.push(input.discogsId ?? null);
  }
  if (input.musicbrainzId !== undefined) {
    updates.push('musicbrainzId = ?');
    values.push(input.musicbrainzId ?? null);
  }

  if (updates.length === 0) {
    // No updates, just return existing record
    const existing = await getRecordById(recordId);
    if (!existing) throw new Error('Record not found');
    return existing;
  }

  updates.push('updatedAt = ?');
  values.push(timestamp);
  values.push(recordId);

  await db.runAsync(
    `UPDATE records SET ${updates.join(', ')} WHERE id = ?`,
    ...values
  );

  const updated = await getRecordById(recordId);
  if (!updated) throw new Error('Record not found after update');
  return updated;
};

/**
 * PR5: Optimized getRecords - can select only needed fields for list views
 * 
 * @param fields - Optional array of field names to select (default: all fields)
 * @param limit - Optional limit for pagination
 * @param offset - Optional offset for pagination
 */
export const getRecords = async (
  fields?: string[],
  limit?: number,
  offset?: number
): Promise<RecordModel[]> => {
  const db = await getDatabase();
  
  // PR5: Select only requested fields (or all if not specified)
  const fieldList = fields && fields.length > 0 
    ? fields.join(', ')
    : '*';
  
  let query = `SELECT ${fieldList} FROM records ORDER BY updatedAt DESC`;
  const params: any[] = [];
  
  // PR5: Add pagination if specified
  if (limit !== undefined) {
    query += ' LIMIT ?';
    params.push(limit);
    if (offset !== undefined) {
      query += ' OFFSET ?';
      params.push(offset);
    }
  }
  
  return db.getAllAsync<RecordModel>(query, ...params);
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

/**
 * Get all records assigned to a unit, sorted by first slot number.
 * Used by Closer Look horizontal shelf browsing.
 */
export const getUnitAssignedRecords = async (
  unitId: string
): Promise<Array<RecordModel & { slotNumbers: number[]; firstSlot: number }>> => {
  const db = await getDatabase();
  const rows = await db.getAllAsync<(RecordModel & { locationSlots: string })>(
    `SELECT r.*, rl.slotNumbers as locationSlots
     FROM recordLocations rl
     JOIN records r ON rl.recordId = r.id
     WHERE rl.unitId = ?
     ORDER BY CAST(json_extract(rl.slotNumbers, '$[0]') AS INTEGER) ASC`,
    unitId
  );

  return rows.map((row) => {
    const slots = parseNumberArray(row.locationSlots as unknown as string).sort((a, b) => a - b);
    return {
      ...row,
      slotNumbers: slots,
      firstSlot: slots[0] ?? 0,
    };
  });
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
  bpm?: number | null; // Beats Per Minute - from Spotify/Apple Music API
};

export const createTrack = async (input: CreateTrackInput): Promise<Track> => {
  const db = await getDatabase();
  const id = generateId('track');

  await db.runAsync(
    `INSERT INTO tracks (id, recordId, title, trackNumber, discNumber, side, durationSeconds, bpm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    input.recordId,
    input.title,
    input.trackNumber ?? null,
    input.discNumber ?? null,
    input.side ?? null,
    input.durationSeconds ?? null,
    input.bpm ?? null
  );

  return {
    id,
    recordId: input.recordId,
    title: input.title,
    trackNumber: input.trackNumber ?? null,
    discNumber: input.discNumber ?? null,
    side: input.side ?? null,
    durationSeconds: input.durationSeconds ?? null,
    bpm: input.bpm ?? null,
  };
};

/**
 * Create multiple tracks in a single batch operation (more efficient than individual inserts)
 * Uses a single SQL INSERT statement with multiple VALUES clauses for maximum performance
 * PR5: Now uses transaction for better performance
 */
export const createTracksBatch = async (inputs: CreateTrackInput[]): Promise<Track[]> => {
  if (inputs.length === 0) return [];

  const db = await getDatabase();
  const tracks: Track[] = [];

  // PR5: Wrap in transaction for better performance
  await db.withTransactionAsync(async () => {
    // Generate all IDs upfront
    const trackData = inputs.map((input) => ({
      id: generateId('track'),
      input,
    }));

    // Build single INSERT statement with multiple VALUES
    const valuesPlaceholders = trackData.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
    const values = trackData.flatMap(({ id, input }) => [
      id,
      input.recordId,
      input.title,
      input.trackNumber ?? null,
      input.discNumber ?? null,
      input.side ?? null,
      input.durationSeconds ?? null,
      input.bpm ?? null,
    ]);

    // Execute single batch INSERT
    await db.runAsync(
      `INSERT INTO tracks (id, recordId, title, trackNumber, discNumber, side, durationSeconds, bpm)
       VALUES ${valuesPlaceholders}`,
      ...values
    );

    // Build return array
    for (const { id, input } of trackData) {
      tracks.push({
        id,
        recordId: input.recordId,
        title: input.title,
        trackNumber: input.trackNumber ?? null,
        discNumber: input.discNumber ?? null,
        side: input.side ?? null,
        durationSeconds: input.durationSeconds ?? null,
        bpm: input.bpm ?? null,
      });
    }
  });

  return tracks;
};

/**
 * PR5: Batch create records with tracks in a single transaction
 * 
 * This is optimized for CSV imports where we want to insert many records
 * and their tracks together in batches.
 * 
 * @param inputs - Array of record inputs with optional tracks
 * @returns Array of created records with isNew flags
 */
type BatchRecordInput = CreateRecordInput & {
  tracks?: Array<Omit<CreateTrackInput, 'recordId'>>; // recordId will be set automatically
};

export const createRecordsBatch = async (
  inputs: BatchRecordInput[]
): Promise<Array<{ record: RecordModel; isNew: boolean }>> => {
  if (inputs.length === 0) return [];

  const db = await getDatabase();
  const timestamp = now();
  const results: Array<{ record: RecordModel; isNew: boolean }> = [];
  
  // PR5: Process in a single transaction for maximum performance
  await db.withTransactionAsync(async () => {
    for (const input of inputs) {
      // Normalize fields
      const normalizedArtist = normalizeText(input.artist);
      const normalizedTitle = normalizeText(input.title);
      
      // Check for existing record
      const existing = await findRecordByIdentity(
        input.discogsId ?? null,
        input.artist,
        input.title,
        input.year ?? null
      );
      
      if (existing) {
        // Update existing record (minimal updates)
        const updates: string[] = [];
        const values: any[] = [];
        
        if (input.discogsId && !existing.discogsId) {
          updates.push('discogsId = ?');
          values.push(input.discogsId);
        }
        if (input.coverImageRemoteUrl && !existing.coverImageRemoteUrl) {
          updates.push('coverImageRemoteUrl = ?');
          values.push(input.coverImageRemoteUrl);
        }
        
        updates.push('normalizedArtist = ?', 'normalizedTitle = ?', 'updatedAt = ?');
        values.push(normalizedArtist, normalizedTitle, timestamp, existing.id);
        
        await db.runAsync(
          `UPDATE records SET ${updates.join(', ')} WHERE id = ?`,
          ...values
        );
        
        const updated = await getRecordById(existing.id);
        if (updated) {
          results.push({ record: updated, isNew: false });
        }
      } else {
        // Create new record
        const id = input.id ?? generateId('record');
        
        await db.runAsync(
          `INSERT INTO records (
            id, title, artist, artistLastName, year, genre, notes,
            coverImageLocalUri, coverImageRemoteUrl, discogsId, musicbrainzId,
            normalizedTitle, normalizedArtist,
            createdAt, updatedAt
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          id,
          input.title,
          input.artist,
          input.artistLastName ?? null,
          input.year ?? null,
          input.genre ?? null,
          input.notes ?? null,
          input.coverImageLocalUri ?? null,
          input.coverImageRemoteUrl ?? null,
          input.discogsId ?? null,
          input.musicbrainzId ?? null,
          normalizedTitle,
          normalizedArtist,
          timestamp,
          timestamp
        );
        
        const newRecord: RecordModel = {
          id,
          title: input.title,
          artist: input.artist,
          artistLastName: input.artistLastName ?? null,
          year: input.year ?? null,
          genre: input.genre ?? null,
          notes: input.notes ?? null,
          coverImageLocalUri: input.coverImageLocalUri ?? null,
          coverImageRemoteUrl: input.coverImageRemoteUrl ?? null,
          discogsId: input.discogsId ?? null,
          musicbrainzId: input.musicbrainzId ?? null,
          normalizedTitle,
          normalizedArtist,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        
        results.push({ record: newRecord, isNew: true });
        
        // PR5: Insert tracks in the same transaction if provided
        if (input.tracks && input.tracks.length > 0) {
          const trackData = input.tracks.map((track) => ({
            id: generateId('track'),
            track,
          }));
          
          const valuesPlaceholders = trackData.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ');
          const trackValues = trackData.flatMap(({ id, track }) => [
            id,
            newRecord.id, // Use the record id we just created
            track.title,
            track.trackNumber ?? null,
            track.discNumber ?? null,
            track.side ?? null,
            track.durationSeconds ?? null,
            track.bpm ?? null,
          ]);
          
          await db.runAsync(
            `INSERT INTO tracks (id, recordId, title, trackNumber, discNumber, side, durationSeconds, bpm)
             VALUES ${valuesPlaceholders}`,
            ...trackValues
          );
        }
      }
    }
  });
  
  return results;
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
  // If empty query, return all tracks
  if (!query || !query.trim()) {
    return db.getAllAsync<Track>(
      `SELECT * FROM tracks ORDER BY recordId, trackNumber ASC, discNumber ASC`
    );
  }
  return db.getAllAsync<Track>(
    `SELECT * FROM tracks WHERE title LIKE ? ORDER BY recordId, trackNumber ASC, discNumber ASC`,
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
  if (updates.bpm !== undefined) {
    fields.push('bpm = ?');
    values.push(updates.bpm);
  }

  if (fields.length === 0) return;

  values.push(trackId);
  await db.runAsync(
    `UPDATE tracks SET ${fields.join(', ')} WHERE id = ?`,
    ...values
  );
};

/* Batch Processing */
export const createBatchJob = async (photoUris: string[]): Promise<BatchJob> => {
  const db = await getDatabase();
  const jobId = generateId('batch');
  const timestamp = now();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO batch_jobs (id, createdAt, status) VALUES (?, ?, ?)`,
      jobId,
      timestamp,
      'pending'
    );

    for (const uri of photoUris) {
      const photoId = generateId('photo');
      await db.runAsync(
        `INSERT INTO batch_photos (id, jobId, photoUri, status) VALUES (?, ?, ?, ?)`,
        photoId,
        jobId,
        uri,
        'pending'
      );
    }
  });

  return {
    id: jobId,
    createdAt: timestamp,
    status: 'pending',
  };
};

export const getBatchJob = async (jobId: string): Promise<BatchJob | null> => {
  const db = await getDatabase();
  const job = await db.getFirstAsync<BatchJob>(
    `SELECT * FROM batch_jobs WHERE id = ?`,
    jobId
  );
  return job ?? null;
};

export const getBatchPhotos = async (jobId: string): Promise<BatchPhoto[]> => {
  const db = await getDatabase();
  return db.getAllAsync<BatchPhoto>(
    `SELECT * FROM batch_photos WHERE jobId = ? ORDER BY processedAt ASC, id ASC`,
    jobId
  );
};

export const updateBatchPhoto = async (
  photoId: string,
  status: BatchPhoto['status'],
  resultData?: string,
  errorMessage?: string
): Promise<void> => {
  const db = await getDatabase();
  const timestamp = now();
  await db.runAsync(
    `UPDATE batch_photos 
     SET status = ?, resultData = ?, errorMessage = ?, processedAt = ?
     WHERE id = ?`,
    status,
    resultData || null,
    errorMessage || null,
    timestamp,
    photoId
  );
};

export const updateBatchJobStatus = async (
  jobId: string,
  status: BatchJob['status']
): Promise<void> => {
  const db = await getDatabase();
  const timestamp = now();
  await db.runAsync(
    `UPDATE batch_jobs 
     SET status = ?, completedAt = ?
     WHERE id = ?`,
    status,
    status === 'completed' || status === 'failed' ? timestamp : null,
    jobId
  );
};

export const getActiveBatchJobs = async (): Promise<BatchJob[]> => {
  const db = await getDatabase();
  return db.getAllAsync<BatchJob>(
    `SELECT * FROM batch_jobs 
     WHERE status IN ('pending', 'processing')
     ORDER BY createdAt DESC`
  );
};

export const deleteBatchJob = async (jobId: string): Promise<void> => {
  const db = await getDatabase();
  // Cascade delete will handle batch_photos
  await db.runAsync(`DELETE FROM batch_jobs WHERE id = ?`, jobId);
};

/* Image Hashes - Caching for instant repeat matches */

/**
 * Find a record by image hash
 * 
 * This allows instant lookups for previously identified albums.
 * If the same image (or similar) was scanned before, we can return
 * the cached result immediately without calling Vision/Discogs APIs.
 * 
 * @param imageHash - Image hash string (hex)
 * @returns Record with tracks or null if not found
 */
export const findRecordByImageHash = async (
  imageHash: string
): Promise<(RecordModel & { tracks: Track[] }) | null> => {
  if (!imageHash || imageHash.trim().length === 0) {
    return null;
  }

  const db = await getDatabase();
  
  // Find image hash entry
  const hashEntry = await db.getFirstAsync<ImageHash>(
    `SELECT * FROM image_hashes WHERE imageHash = ? LIMIT 1`,
    imageHash.trim()
  );

  if (!hashEntry) {
    return null;
  }

  // Get the record
  const record = await getRecordById(hashEntry.recordId);
  if (!record) {
    return null;
  }

  // Get tracks
  const tracks = await getTracksByRecord(record.id);

  logger.debug(`[Repository] ✅ Found cached record by hash: "${record.artist}" - "${record.title}"`);
  
  return {
    ...record,
    tracks,
  };
};

/**
 * Save an image hash association with a record
 * 
 * This caches the identification result so future scans of the same
 * (or similar) image can be resolved instantly.
 * 
 * @param imageHash - Image hash string (hex)
 * @param recordId - Record ID to associate with
 * @param submittedImageUri - Optional: URI of the submitted image
 */
export const saveImageHash = async (
  imageHash: string,
  recordId: string,
  submittedImageUri?: string | null
): Promise<void> => {
  if (!imageHash || imageHash.trim().length === 0) {
    logger.warn('[Repository] Cannot save empty image hash');
    return;
  }

  if (!recordId) {
    logger.warn('[Repository] Cannot save image hash without recordId');
    return;
  }

  const db = await getDatabase();
  const id = generateId('imghash');
  const timestamp = now();

  try {
    // Use INSERT OR REPLACE to handle duplicates
    await db.runAsync(
      `INSERT OR REPLACE INTO image_hashes (id, imageHash, recordId, submittedImageUri, createdAt)
       VALUES (?, ?, ?, ?, ?)`,
      id,
      imageHash.trim(),
      recordId,
      submittedImageUri ?? null,
      timestamp
    );

    logger.debug(`[Repository] ✅ Saved image hash ${imageHash.substring(0, 8)}... for record ${recordId}`);
  } catch (error) {
    logger.error('[Repository] Error saving image hash:', error);
    // Don't throw - hash saving is not critical
  }
};

/**
 * Find all image hashes for a record
 * 
 * @param recordId - Record ID
 * @returns Array of image hash entries
 */
export const getImageHashesByRecord = async (
  recordId: string
): Promise<ImageHash[]> => {
  const db = await getDatabase();
  return db.getAllAsync<ImageHash>(
    `SELECT * FROM image_hashes WHERE recordId = ? ORDER BY createdAt DESC`,
    recordId
  );
};

/**
 * Delete an image hash entry
 * 
 * @param imageHash - Image hash to delete
 */
export const deleteImageHash = async (imageHash: string): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM image_hashes WHERE imageHash = ?`, imageHash.trim());
};

/* Playlists */
export const createPlaylist = async (name: string, description?: string): Promise<Playlist> => {
  const db = await getDatabase();
  const id = generateId('playlist');
  const timestamp = now();

  await db.runAsync(
    `INSERT INTO playlists (id, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`,
    id,
    name.trim(),
    description?.trim() || null,
    timestamp,
    timestamp
  );

  return {
    id,
    name: name.trim(),
    description: description?.trim() || null,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
};

export const getPlaylists = async (): Promise<Playlist[]> => {
  const db = await getDatabase();
  return db.getAllAsync<Playlist>(`SELECT * FROM playlists ORDER BY name ASC`);
};

export const getPlaylistById = async (playlistId: string): Promise<Playlist | null> => {
  const db = await getDatabase();
  const result = await db.getFirstAsync<Playlist>(
    `SELECT * FROM playlists WHERE id = ?`,
    playlistId
  );
  return result || null;
};

export const updatePlaylist = async (
  playlistId: string,
  name: string,
  description?: string
): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync(
    `UPDATE playlists SET name = ?, description = ?, updatedAt = ? WHERE id = ?`,
    name.trim(),
    description?.trim() || null,
    now(),
    playlistId
  );
};

export const deletePlaylist = async (playlistId: string): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync(`DELETE FROM playlists WHERE id = ?`, playlistId);
};

/* Playlist Items (supports both records/albums and tracks/songs) */
export const addRecordToPlaylist = async (
  playlistId: string,
  recordId: string
): Promise<PlaylistItem> => {
  const db = await getDatabase();
  
  // Check if record is already in playlist
  const existing = await db.getFirstAsync<PlaylistItem>(
    `SELECT * FROM playlist_items WHERE playlistId = ? AND itemType = 'record' AND recordId = ?`,
    playlistId,
    recordId
  );
  
  if (existing) {
    return existing; // Already in playlist
  }

  // Get max position for this playlist
  const maxPosition = await db.getFirstAsync<{ max: number }>(
    `SELECT MAX(position) as max FROM playlist_items WHERE playlistId = ?`,
    playlistId
  );
  
  const id = generateId('playlist_item');
  const position = (maxPosition?.max ?? -1) + 1;

  await db.runAsync(
    `INSERT INTO playlist_items (id, playlistId, itemType, recordId, trackId, position, addedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    playlistId,
    'record',
    recordId,
    null,
    position,
    now()
  );

  // Update playlist updatedAt
  await db.runAsync(
    `UPDATE playlists SET updatedAt = ? WHERE id = ?`,
    now(),
    playlistId
  );

  return {
    id,
    playlistId,
    itemType: 'record',
    recordId,
    trackId: null,
    position,
    addedAt: now(),
  };
};

export const addTrackToPlaylist = async (
  playlistId: string,
  trackId: string
): Promise<PlaylistItem> => {
  const db = await getDatabase();
  
  // Check if track is already in playlist
  const existing = await db.getFirstAsync<PlaylistItem>(
    `SELECT * FROM playlist_items WHERE playlistId = ? AND itemType = 'track' AND trackId = ?`,
    playlistId,
    trackId
  );
  
  if (existing) {
    return existing; // Already in playlist
  }

  // Get max position for this playlist
  const maxPosition = await db.getFirstAsync<{ max: number }>(
    `SELECT MAX(position) as max FROM playlist_items WHERE playlistId = ?`,
    playlistId
  );
  
  const id = generateId('playlist_item');
  const position = (maxPosition?.max ?? -1) + 1;

  await db.runAsync(
    `INSERT INTO playlist_items (id, playlistId, itemType, recordId, trackId, position, addedAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    id,
    playlistId,
    'track',
    null,
    trackId,
    position,
    now()
  );

  // Update playlist updatedAt
  await db.runAsync(
    `UPDATE playlists SET updatedAt = ? WHERE id = ?`,
    now(),
    playlistId
  );

  return {
    id,
    playlistId,
    itemType: 'track',
    recordId: null,
    trackId,
    position,
    addedAt: now(),
  };
};

export const removeRecordFromPlaylist = async (
  playlistId: string,
  recordId: string
): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync(
    `DELETE FROM playlist_items WHERE playlistId = ? AND itemType = 'record' AND recordId = ?`,
    playlistId,
    recordId
  );

  // Update playlist updatedAt
  await db.runAsync(
    `UPDATE playlists SET updatedAt = ? WHERE id = ?`,
    now(),
    playlistId
  );
};

export const removeTrackFromPlaylist = async (
  playlistId: string,
  trackId: string
): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync(
    `DELETE FROM playlist_items WHERE playlistId = ? AND itemType = 'track' AND trackId = ?`,
    playlistId,
    trackId
  );

  // Update playlist updatedAt
  await db.runAsync(
    `UPDATE playlists SET updatedAt = ? WHERE id = ?`,
    now(),
    playlistId
  );
};

export const removeItemFromPlaylist = async (
  playlistId: string,
  itemId: string
): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync(
    `DELETE FROM playlist_items WHERE playlistId = ? AND id = ?`,
    playlistId,
    itemId
  );

  // Update playlist updatedAt
  await db.runAsync(
    `UPDATE playlists SET updatedAt = ? WHERE id = ?`,
    now(),
    playlistId
  );
};

export const getTrackById = async (trackId: string): Promise<Track | null> => {
  const db = await getDatabase();
  const result = await db.getFirstAsync<Track>(
    `SELECT * FROM tracks WHERE id = ?`,
    trackId
  );
  return result || null;
};

export type PlaylistItemWithDetails = PlaylistItem & {
  record?: RecordModel;
  track?: Track;
};

export const getPlaylistItems = async (playlistId: string): Promise<PlaylistItemWithDetails[]> => {
  const db = await getDatabase();
  const playlistItems = await db.getAllAsync<PlaylistItem>(
    `SELECT * FROM playlist_items WHERE playlistId = ? ORDER BY position ASC`,
    playlistId
  );

  // Fetch details for each playlist item (record or track)
  const itemsWithDetails: PlaylistItemWithDetails[] = [];
  
  for (const item of playlistItems) {
    if (item.itemType === 'record' && item.recordId) {
      const record = await getRecordById(item.recordId);
      if (record) {
        itemsWithDetails.push({
          ...item,
          record,
        });
      }
    } else if (item.itemType === 'track' && item.trackId) {
      const track = await getTrackById(item.trackId);
      if (track) {
        itemsWithDetails.push({
          ...item,
          track,
        });
      }
    }
  }

  return itemsWithDetails;
};

// Legacy function for backward compatibility
export const getPlaylistRecords = async (playlistId: string): Promise<(PlaylistItem & { record: RecordModel })[]> => {
  const items = await getPlaylistItems(playlistId);
  return items
    .filter((item): item is PlaylistItemWithDetails & { record: RecordModel } => 
      item.itemType === 'record' && item.record !== undefined
    )
    .map(item => ({
      id: item.id,
      playlistId: item.playlistId,
      itemType: item.itemType,
      recordId: item.recordId!,
      trackId: item.trackId,
      position: item.position,
      addedAt: item.addedAt,
      record: item.record,
    }));
};

export const getPlaylistsForRecord = async (recordId: string): Promise<Playlist[]> => {
  const db = await getDatabase();
  return db.getAllAsync<Playlist>(
    `SELECT p.* FROM playlists p
     INNER JOIN playlist_items pi ON p.id = pi.playlistId
     WHERE pi.itemType = 'record' AND pi.recordId = ?
     ORDER BY p.name ASC`,
    recordId
  );
};

export const getPlaylistsForTrack = async (trackId: string): Promise<Playlist[]> => {
  const db = await getDatabase();
  return db.getAllAsync<Playlist>(
    `SELECT p.* FROM playlists p
     INNER JOIN playlist_items pi ON p.id = pi.playlistId
     WHERE pi.itemType = 'track' AND pi.trackId = ?
     ORDER BY p.name ASC`,
    trackId
  );
};

/* PR7: Slot Assignment Functions for LED Readiness */

/**
 * Get all slots for a unit
 */
export const getSlotsByUnit = async (unitId: string): Promise<Slot[]> => {
  const db = await getDatabase();
  return db.getAllAsync<Slot>(
    `SELECT * FROM slots WHERE unitId = ? ORDER BY slotNumber ASC`,
    unitId
  );
};

/**
 * Get slot by ID
 */
export const getSlotById = async (slotId: string): Promise<Slot | null> => {
  const db = await getDatabase();
  return db.getFirstAsync<Slot>(
    `SELECT * FROM slots WHERE id = ? LIMIT 1`,
    slotId
  );
};

/**
 * Get slot assignment for a record
 */
export const getSlotAssignmentByRecord = async (
  recordId: string
): Promise<RecordSlotAssignment | null> => {
  const db = await getDatabase();
  return db.getFirstAsync<RecordSlotAssignment>(
    `SELECT * FROM recordSlotAssignments WHERE recordId = ? LIMIT 1`,
    recordId
  );
};

/**
 * Get slot assignment with slot and record details
 */
export const getSlotAssignmentDetails = async (
  recordId: string
): Promise<(RecordSlotAssignment & { slot: Slot; unit: Unit; record: RecordModel }) | null> => {
  const db = await getDatabase();
  const assignment = await db.getFirstAsync<
    RecordSlotAssignment & {
      slotId: string;
      unitId: string;
      recordId: string;
    }
  >(
    `SELECT * FROM recordSlotAssignments WHERE recordId = ? LIMIT 1`,
    recordId
  );

  if (!assignment) return null;

  const slot = await getSlotById(assignment.slotId);
  const unit = await getUnitById(assignment.unitId);
  const record = await getRecordById(assignment.recordId);

  if (!slot || !unit || !record) return null;

  return {
    ...assignment,
    slot,
    unit,
    record,
  };
};

/**
 * Get all slots for a unit with their assignments
 */
export const getSlotsWithAssignments = async (
  unitId: string
): Promise<SlotWithAssignment[]> => {
  const db = await getDatabase();
  const slots = await db.getAllAsync<
    Slot & {
      recordId: string | null;
      recordTitle: string | null;
      recordArtist: string | null;
    }
  >(
    `SELECT 
      s.*,
      rsa.recordId,
      r.title as recordTitle,
      r.artist as recordArtist
     FROM slots s
     LEFT JOIN recordSlotAssignments rsa ON s.id = rsa.slotId
     LEFT JOIN records r ON rsa.recordId = r.id
     WHERE s.unitId = ?
     ORDER BY s.slotNumber ASC`,
    unitId
  );

  return slots.map((s) => ({
    id: s.id,
    unitId: s.unitId,
    slotNumber: s.slotNumber,
    createdAt: s.createdAt,
    recordId: s.recordId || undefined,
    recordTitle: s.recordTitle || undefined,
    recordArtist: s.recordArtist || undefined,
  }));
};

/**
 * Assign a record to a slot
 * Enforces constraints: one record per slot, one slot per record
 */
export const assignRecordToSlot = async (
  recordId: string,
  slotId: string
): Promise<RecordSlotAssignment> => {
  const db = await getDatabase();
  const timestamp = now();

  // Get slot details
  const slot = await getSlotById(slotId);
  if (!slot) {
    throw new Error('Slot not found');
  }

  let assignmentToReturn: RecordSlotAssignment | null = null;
  
  await db.withTransactionAsync(async () => {
    // Check if slot is already assigned
    const existingAssignment = await db.getFirstAsync<RecordSlotAssignment>(
      `SELECT * FROM recordSlotAssignments WHERE slotId = ? LIMIT 1`,
      slotId
    );

    if (existingAssignment && existingAssignment.recordId !== recordId) {
      throw new Error(`Slot ${slot.slotNumber} is already assigned to another record`);
    }

    // Remove any existing assignment for this record (one slot per record)
    await db.runAsync(
      `DELETE FROM recordSlotAssignments WHERE recordId = ?`,
      recordId
    );

    // If slot already has this record, do nothing
    if (existingAssignment && existingAssignment.recordId === recordId) {
      assignmentToReturn = existingAssignment;
      return;
    }

    // Create new assignment
    const id = generateId('slotassign');
    await db.runAsync(
      `INSERT INTO recordSlotAssignments (id, recordId, unitId, slotId, assignedAt)
       VALUES (?, ?, ?, ?, ?)`,
      id,
      recordId,
      slot.unitId,
      slotId,
      timestamp
    );
    
    // Fetch the newly created assignment
    const newAssignment = await db.getFirstAsync<RecordSlotAssignment>(
      `SELECT * FROM recordSlotAssignments WHERE id = ? LIMIT 1`,
      id
    );
    if (newAssignment) {
      assignmentToReturn = newAssignment;
    }
  });

  const assignment = await getSlotAssignmentByRecord(recordId);
  if (!assignment) {
    throw new Error('Failed to create slot assignment');
  }

  return assignment;
};

/**
 * Unassign a record from its slot
 */
export const unassignRecordFromSlot = async (recordId: string): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync(
    `DELETE FROM recordSlotAssignments WHERE recordId = ?`,
    recordId
  );
};

/**
 * Unassign a slot (remove any record from it)
 */
export const unassignSlot = async (slotId: string): Promise<void> => {
  const db = await getDatabase();
  await db.runAsync(
    `DELETE FROM recordSlotAssignments WHERE slotId = ?`,
    slotId
  );
};

