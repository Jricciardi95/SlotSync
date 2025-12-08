/**
 * Database Service
 * 
 * High-level wrappers around the local database repository.
 * Provides a clean API for database operations without exposing
 * implementation details.
 */

// Re-export repository functions with service-level naming
export {
  // Records
  createRecord,
  getRecordById,
  getAllRecords,
  updateRecord,
  deleteRecord,
  findDuplicateRecord,
  
  // Tracks
  createTrack,
  getTracksByRecord,
  updateTrack,
  deleteTrack,
  
  // Image Hashes (Cache)
  findRecordByImageHash,
  saveImageHash,
  getImageHashesByRecord,
  deleteImageHash,
  
  // Locations
  createRecordLocation,
  getRecordLocation,
  updateRecordLocation,
  deleteRecordLocation,
  getAllRecordLocations,
  
  // Units, Rows, Sessions, etc.
  createUnit,
  getUnits,
  updateUnit,
  deleteUnit,
  createRow,
  getRows,
  updateRow,
  deleteRow,
  createSession,
  getSessions,
  updateSession,
  deleteSession,
  
  // Batch Jobs
  createBatchJob,
  getBatchJob,
  updateBatchJob,
  deleteBatchJob,
  createBatchPhoto,
  getBatchPhotos,
  updateBatchPhoto,
} from '../../data/repository';

// Re-export types
export type {
  RecordModel,
  Track,
  ImageHash,
  RecordLocation,
  Unit,
  Row,
  Session,
  BatchJob,
  BatchPhoto,
} from '../../data/types';

/**
 * Save a resolved album to the database
 * 
 * This is a convenience function that saves both the record and its tracks.
 * 
 * @param album - Resolved album from identification service
 * @param imageHash - Optional image hash for caching
 * @param imageUri - Optional image URI for cache entry
 * @returns Created record with tracks
 */
export async function saveResolvedAlbum(
  album: {
    artist: string;
    albumTitle: string;
    releaseYear?: number;
    genre?: string;
    discogsId?: string;
    musicbrainzId?: string;
    coverHdUrl?: string;
    tracks?: Array<{
      title: string;
      position: number;
      side?: string;
      discNumber?: number;
      durationSeconds?: number;
    }>;
  },
  imageHash?: string,
  imageUri?: string
): Promise<{ record: any; tracks: any[] }> {
  const { createRecord, createTrack, saveImageHash } = await import('../../data/repository');
  
  // Create record
  const record = await createRecord({
    title: album.albumTitle,
    artist: album.artist,
    year: album.releaseYear ?? null,
    genre: album.genre ?? null,
    coverImageRemoteUrl: album.coverHdUrl ?? null,
    coverImageLocalUri: null, // Never save user photos
    discogsId: album.discogsId ?? null,
    musicbrainzId: album.musicbrainzId ?? null,
  });

  // Save tracks
  const savedTracks = [];
  if (album.tracks && album.tracks.length > 0) {
    for (const track of album.tracks) {
      try {
        const savedTrack = await createTrack({
          recordId: record.id,
          title: track.title,
          trackNumber: track.position,
          side: track.side ?? null,
          discNumber: track.discNumber ?? null,
          durationSeconds: track.durationSeconds ?? null,
        });
        savedTracks.push(savedTrack);
      } catch (error) {
        console.warn('[DB Service] Failed to save track:', error);
        // Continue saving other tracks
      }
    }
  }

  // Save image hash if provided
  if (imageHash) {
    try {
      await saveImageHash(imageHash, record.id, imageUri);
    } catch (error) {
      console.warn('[DB Service] Failed to save image hash:', error);
      // Don't fail - caching is not critical
    }
  }

  return { record, tracks: savedTracks };
}

