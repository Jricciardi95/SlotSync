/**
 * CSV Import Utilities
 * 
 * Shared utilities for CSV import with concurrency control and retry logic
 */

import { getApiUrl } from '../config/api';
import { apiFetch } from '../config/apiFetch';
import { logger } from './logger';
import { createRecord, createTracksBatch, createRecordsBatch } from '../data/repository';

export interface CsvRow {
  artist: string;
  title: string;
  year: number | null;
  notes: string | null;
  releaseId: number | null;
}

export interface ImportResult {
  success: boolean;
  rowIndex: number;
  artist: string;
  title: string;
  error?: string;
  recordId?: string;
}

export interface ImportOptions {
  concurrency?: number;
  maxRetries?: number;
  onProgress?: (current: number, total: number) => void;
}

/**
 * Create a concurrency limiter (pLimit-style)
 */
export function createConcurrencyLimiter(limit: number) {
  let running = 0;
  const queue: Array<() => void> = [];

  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      const run = async () => {
        running++;
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          running--;
          if (queue.length > 0) {
            const next = queue.shift()!;
            next();
          }
        }
      };

      if (running < limit) {
        run();
      } else {
        queue.push(run);
      }
    });
  };
}

/**
 * Retry with exponential backoff
 */
async function fetchWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2
): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      if (attempt === maxRetries - 1) throw error;

      // Exponential backoff: 1s, 2s
      const delay = Math.pow(2, attempt) * 1000;
      logger.debug(`[CSV Import] Retry ${attempt + 1}/${maxRetries} after ${delay}ms...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw new Error('Unreachable');
}

/**
 * Fetch metadata for a single row (with retry)
 */
async function fetchMetadataForRow(
  artist: string,
  title: string,
  releaseId: number | null,
  maxRetries: number
): Promise<{
  coverImageRemoteUrl: string | null;
  tracks: Array<{
    title: string;
    trackNumber?: number | null;
    discNumber?: number | null;
    side?: string | null;
    durationSeconds?: number | null;
  }>;
  year: number | null;
  discogsReleaseId: number | null;
}> {
  return fetchWithRetry(async () => {
    // PRIORITY 1: If Release ID exists, fetch full metadata from Discogs
    if (releaseId && releaseId > 0) {
      try {
        const apiUrl = getApiUrl(`/api/discogs/release/${releaseId}`);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
          const response = await apiFetch(apiUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (response.ok) {
            const discogsData = await response.json();
            if (discogsData.coverImageRemoteUrl || discogsData.tracks?.length > 0) {
              return {
                coverImageRemoteUrl: discogsData.coverImageRemoteUrl || null,
                tracks: discogsData.tracks || [],
                year: discogsData.year && discogsData.year > 1900 && discogsData.year < 2100 && discogsData.year !== 2025
                  ? discogsData.year
                  : null,
                discogsReleaseId: releaseId,
              };
            }
          }
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          if (fetchError.name !== 'AbortError') {
            throw fetchError;
          }
        }
      } catch (error: any) {
        logger.warn(`[CSV Import] ⚠️  Release ID fetch failed: ${error.message}, falling back to text lookup`);
      }
    }

    // PRIORITY 2: Text-based lookup
    const apiUrl = getApiUrl('/api/identify-by-text');
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 25000);

    try {
      const response = await apiFetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist, title }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const lookupData = await response.json();
      const match = lookupData.bestMatch || lookupData.primaryMatch;

      if (!match) {
        throw new Error('No match found');
      }

      return {
        coverImageRemoteUrl: match.coverImageRemoteUrl || null,
        tracks: match.tracks || [],
        year: match.year && match.year > 1900 && match.year < 2100 && match.year !== 2025
          ? match.year
          : null,
        discogsReleaseId: match.discogsId ? parseInt(String(match.discogsId), 10) : null,
      };
    } catch (fetchError: any) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  }, maxRetries);
}

/**
 * Process a single CSV row
 */
async function processRow(
  row: CsvRow,
  rowIndex: number,
  totalRows: number,
  maxRetries: number,
  onProgress?: (current: number, total: number) => void
): Promise<ImportResult> {
  try {
    logger.debug(`[CSV Import] Processing row ${rowIndex + 1}/${totalRows}: "${row.artist}" - "${row.title}"`);

    // Fetch metadata with retry
    const metadata = await fetchMetadataForRow(
      row.artist,
      row.title,
      row.releaseId,
      maxRetries
    );

    // Validate that we have at least one of: discogsId OR coverImageRemoteUrl OR tracks.length > 0
    // If we have none of these, the lookup likely failed
    if (!metadata.discogsReleaseId && !metadata.coverImageRemoteUrl && metadata.tracks.length === 0) {
      throw new Error('Incomplete metadata: missing discogsId, cover art, and tracks');
    }

    // Year logic: Never persist 2025; prefer Discogs year over CSV year
    let finalYear = row.year;
    // If CSV year is 2025 or missing, use Discogs year
    if (finalYear === 2025 || !finalYear) {
      finalYear = metadata.year;
    }
    // Never persist 2025 (even if Discogs returned it)
    if (finalYear === 2025) {
      finalYear = null;
    }

    // PR3: Create or update record (UPSERT) - handles duplicates automatically
    const { record, isNew } = await createRecord({
      title: row.title,
      artist: row.artist,
      year: finalYear,
      notes: row.notes || null,
      coverImageRemoteUrl: metadata.coverImageRemoteUrl,
      coverImageLocalUri: null,
      discogsId: metadata.discogsReleaseId ? String(metadata.discogsReleaseId) : null,
    });

    // PR3: Only create tracks if this is a new record (existing records keep their tracks)
    if (isNew && metadata.tracks.length > 0) {
      await createTracksBatch(
        metadata.tracks.map((track) => ({
          recordId: record.id,
          title: track.title,
          trackNumber: track.trackNumber || null,
          discNumber: track.discNumber || null,
          side: track.side || null,
          durationSeconds: track.durationSeconds || null,
        }))
      );
    }

    onProgress?.(rowIndex + 1, totalRows);

    return {
      success: true,
      rowIndex,
      artist: row.artist,
      title: row.title,
      recordId: record.id,
    };
  } catch (error: any) {
    logger.error(`[CSV Import] ❌ Row ${rowIndex + 1} failed:`, error.message);
    return {
      success: false,
      rowIndex,
      artist: row.artist,
      title: row.title,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * PR5: Process rows in batches with transactions
 * 
 * Groups rows into batches and processes each batch in a single transaction.
 * This dramatically improves import speed for large datasets.
 */
async function processBatch(
  batch: Array<{ row: CsvRow; index: number; metadata: any }>,
  totalRows: number,
  onProgress?: (current: number, total: number) => void
): Promise<ImportResult[]> {
  const results: ImportResult[] = [];
  
  try {
    // PR5: Create all records + tracks in a single transaction
    const batchInputs = batch.map(({ row, metadata }) => {
      // Year logic: Never persist 2025; prefer Discogs year over CSV year
      let finalYear = row.year;
      if (finalYear === 2025 || !finalYear) {
        finalYear = metadata.year;
      }
      if (finalYear === 2025) {
        finalYear = null;
      }
      
      return {
        title: row.title,
        artist: row.artist,
        year: finalYear,
        notes: row.notes || null,
        coverImageRemoteUrl: metadata.coverImageRemoteUrl,
        coverImageLocalUri: null,
        discogsId: metadata.discogsReleaseId ? String(metadata.discogsReleaseId) : null,
        tracks: metadata.tracks.map((track: any) => ({
          // recordId will be set automatically in createRecordsBatch
          title: track.title,
          trackNumber: track.trackNumber || null,
          discNumber: track.discNumber || null,
          side: track.side || null,
          durationSeconds: track.durationSeconds || null,
        })),
      };
    });
    
    // PR5: Create records in batch transaction
    const createdRecords = await createRecordsBatch(batchInputs);
    
    // Map results back to ImportResult format
    for (let i = 0; i < batch.length; i++) {
      const { row, index } = batch[i];
      const { record, isNew } = createdRecords[i];
      
      // Update track recordIds (they were created in the transaction)
      // Note: tracks are already inserted in createRecordsBatch
      
      results.push({
        success: true,
        rowIndex: index,
        artist: row.artist,
        title: row.title,
        recordId: record.id,
      });
      
      onProgress?.(index + 1, totalRows);
    }
  } catch (error: any) {
    // If batch fails, mark all rows in batch as failed
    logger.error(`[CSV Import] ❌ Batch failed:`, error.message);
    for (const { row, index } of batch) {
      results.push({
        success: false,
        rowIndex: index,
        artist: row.artist,
        title: row.title,
        error: error.message || 'Batch import failed',
      });
    }
  }
  
  return results;
}

/**
 * Import CSV rows with enrichment (metadata fetching)
 * 
 * This function handles:
 * - Concurrency limiting (default: 4 parallel requests)
 * - Retry with exponential backoff (default: 2 retries)
 * - Metadata fetching (Discogs release ID or text lookup)
 * - PR5: Batch transactions (100 records per batch)
 * - Progress tracking
 * - Error collection
 */
export async function importCsvRowsWithEnrichment(
  rows: CsvRow[],
  options: ImportOptions = {}
): Promise<{
  successes: ImportResult[];
  failures: ImportResult[];
  imported: number;
  skipped: number;
}> {
  const concurrency = options.concurrency ?? 4;
  const maxRetries = options.maxRetries ?? 2;
  const batchSize = 100; // PR5: Process 100 records per transaction
  const limit = createConcurrencyLimiter(concurrency);

  logger.debug(`[CSV Import] 🚀 Starting import of ${rows.length} rows (concurrency: ${concurrency}, retries: ${maxRetries}, batch size: ${batchSize})`);

  // PR5: Step 1: Fetch metadata for all rows (with concurrency limit)
  const metadataResults = await Promise.all(
    rows.map((row, index) =>
      limit(() =>
        fetchMetadataForRow(row.artist, row.title, row.releaseId, maxRetries)
          .then((metadata) => ({ row, index, metadata }))
          .catch((error) => {
            logger.error(`[CSV Import] ❌ Row ${index + 1} metadata fetch failed:`, error.message);
            return { row, index, metadata: null, error: error.message };
          })
      )
    )
  );

  // Separate rows with successful metadata from failures
  const rowsWithMetadata: Array<{ row: CsvRow; index: number; metadata: any }> = [];
  const metadataFailures: ImportResult[] = [];

  for (const result of metadataResults) {
    if (result.metadata && !('error' in result)) {
      // Validate metadata completeness
      if (result.metadata.discogsReleaseId || result.metadata.coverImageRemoteUrl || result.metadata.tracks?.length > 0) {
        rowsWithMetadata.push(result as any);
      } else {
        metadataFailures.push({
          success: false,
          rowIndex: result.index,
          artist: result.row.artist,
          title: result.row.title,
          error: 'Incomplete metadata: missing discogsId, cover art, and tracks',
        });
      }
    } else {
      metadataFailures.push({
        success: false,
        rowIndex: result.index,
        artist: result.row.artist,
        title: result.row.title,
        error: (result as any).error || 'Metadata fetch failed',
      });
    }
  }

  // PR5: Step 2: Process rows in batches with transactions
  const batchResults: ImportResult[] = [];
  for (let i = 0; i < rowsWithMetadata.length; i += batchSize) {
    const batch = rowsWithMetadata.slice(i, i + batchSize);
    const batchResult = await processBatch(batch, rows.length, options.onProgress);
    batchResults.push(...batchResult);
  }

  // Combine all results
  const allResults = [...batchResults, ...metadataFailures];
  const successes = allResults.filter((r) => r.success);
  const failures = allResults.filter((r) => !r.success);

  logger.debug(`[CSV Import] ✅ Import complete: ${successes.length} succeeded, ${failures.length} failed`);

  return {
    successes,
    failures,
    imported: successes.length,
    skipped: failures.length,
  };
}

