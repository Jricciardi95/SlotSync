import { getDatabase } from '../data/database';
import {
  getBatchJob,
  getBatchPhotos,
  updateBatchPhoto,
  updateBatchJobStatus,
  getActiveBatchJobs,
  BatchJob,
  BatchPhoto,
} from '../data/repository';
import { 
  identifyRecord, 
  IdentificationMatch,
  normalizeScanResult,
  IdentificationResponse,
} from './RecordIdentificationService';

type BatchProcessingCallback = (progress: {
  jobId: string;
  current: number;
  total: number;
  completed: number;
  failed: number;
}) => void;

class BatchProcessingService {
  private activeJobs: Set<string> = new Set();
  private callbacks: Map<string, BatchProcessingCallback> = new Map();

  /**
   * Start processing a batch job in the background
   */
  async startProcessing(jobId: string, onProgress?: BatchProcessingCallback): Promise<void> {
    if (this.activeJobs.has(jobId)) {
      console.log(`[BatchProcessing] Job ${jobId} already processing`);
      return;
    }

    this.activeJobs.add(jobId);
    if (onProgress) {
      this.callbacks.set(jobId, onProgress);
    }

    // Update job status
    await updateBatchJobStatus(jobId, 'processing');

    // Process in background (don't await - let it run)
    this.processJob(jobId).catch((error) => {
      console.error(`[BatchProcessing] Error processing job ${jobId}:`, error);
      updateBatchJobStatus(jobId, 'failed').catch(console.error);
      this.activeJobs.delete(jobId);
      this.callbacks.delete(jobId);
    });
  }

  /**
   * Process a batch job (runs in background)
   */
  private async processJob(jobId: string): Promise<void> {
    const job = await getBatchJob(jobId);
    if (!job) {
      console.error(`[BatchProcessing] Job ${jobId} not found`);
      return;
    }

    const photos = await getBatchPhotos(jobId);
    const pendingPhotos = photos.filter((p) => p.status === 'pending' || p.status === 'processing');
    
    if (pendingPhotos.length === 0) {
      // All done
      await updateBatchJobStatus(jobId, 'completed');
      this.activeJobs.delete(jobId);
      this.callbacks.delete(jobId);
      return;
    }

    let completed = 0;
    let failed = 0;

    for (const photo of pendingPhotos) {
      // Update to processing
      await updateBatchPhoto(photo.id, 'processing');

      // Notify progress
      this.notifyProgress(jobId, {
        current: photos.indexOf(photo) + 1,
        total: photos.length,
        completed,
        failed,
      });

      try {
        // Add small delay between requests to avoid rate limiting
        // and ensure backend has time to process each image properly
        if (photos.indexOf(photo) > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000)); // 1 second delay
        }

        // Use same identification logic as single scan
        const response = await identifyRecord(photo.photoUri);
        
        // Normalize response into ScanResult structure (same as library flow)
        const normalizedResult = normalizeScanResult(response);
        
        // Store result as JSON (include both normalized structure and original fields for compatibility)
        const resultData = JSON.stringify({
          // Normalized structure (current + alternates)
          current: normalizedResult.current,
          alternates: normalizedResult.alternates,
          // Original structure (for backward compatibility)
          bestMatch: response.bestMatch,
          alternates: response.alternates,
          confidence: response.confidence,
        });

        await updateBatchPhoto(photo.id, 'success', resultData);
        completed++;
      } catch (error: any) {
        // CRITICAL: Treat LOW_CONFIDENCE with albumSuggestions as suggestions, not a hard error
        // This should not log as console.error - it's expected behavior when confidence is low
        if (error.code === 'LOW_CONFIDENCE') {
          // CRITICAL: Check for albumSuggestions from backend (canonical Discogs releases)
          // This is the same approach as ScanRecordScreen uses
          const albumSuggestions = error.albumSuggestions || error.discogsSuggestions || [];
          const legacyCandidates = error.candidates || [];
          
          // Prefer albumSuggestions (canonical Discogs releases) over raw candidates
          let validCandidates: any[] = [];
          
          if (albumSuggestions.length > 0) {
            // Use canonical album suggestions from backend (already filtered by Discogs)
            console.log(`[BatchProcessing] Low confidence for photo ${photo.id} with ${albumSuggestions.length} canonical album suggestions - treating as suggestion`);
            validCandidates = albumSuggestions.map((suggestion: any) => ({
              artist: suggestion.artist,
              title: suggestion.albumTitle,
              year: suggestion.releaseYear,
              discogsId: suggestion.discogsId,
              confidence: suggestion.confidence || 0.5,
              source: suggestion.source || 'discogs',
            }));
          } else if (legacyCandidates.length > 0) {
            // Fallback to legacy candidates (for backward compatibility)
            console.log(`[BatchProcessing] Low confidence for photo ${photo.id} with ${legacyCandidates.length} legacy candidates - treating as suggestion`);
            
            // Backend should already filter candidates, but add extra safety filter here
            // Filter out obviously bad candidates (e.g., "Discogs", "| Releases", Reddit posts, etc.)
            validCandidates = legacyCandidates.filter((candidate: any) => {
            if (!candidate.artist || !candidate.title) return false;
            
            // Reject candidates that are clearly from web page titles, not album info
            const artistLower = candidate.artist.toLowerCase();
            const titleLower = candidate.title.toLowerCase();
            const combined = `${artistLower} ${titleLower}`;
            
            // Bad patterns that indicate non-album content
            const badPatterns = [
              'best album covers',
              'top ',
              'the 20 best',
              'the 10 best',
              'album covers from',
              'album covers i find',
              'album covers i',
              'r/musicsuggestions',
              'reddit',
              'cover.jpg',
              '.jpg',
              '.jpeg',
              '.png',
              'media/file:',
              'wiki/',
              'facebook',
              'pinterest',
              'twitter',
              'instagram',
              'creative bloq',
              'tumblr',
              'blogspot',
              'view all',
              'image result',
              'debut album cover',
              'album art by',
              'stock photo',
              'stock image',
              'http://',
              'https://',
              'www.',
            ];
            
            // Check combined string for bad patterns (catches cases where artist/title are swapped)
            if (badPatterns.some(p => combined.includes(p))) {
              return false;
            }
            
            // Reject if title is just "Discogs" or similar
            if (titleLower === 'discogs' || titleLower === 'releases' || titleLower === 'release' || titleLower === 'reddit') {
              return false;
            }
            
            // Reject if artist contains "|" (common in web page titles like "Artist | Releases")
            if (artistLower.includes('|') || titleLower.includes('|')) {
              return false;
            }
            
            // Reject if both artist and title are very short (likely not real album info)
            if (artistLower.length < 2 || titleLower.length < 2) {
              return false;
            }
            
            // Reject if title contains "releases" or "discogs" as a standalone word
            if (/\b(releases?|discogs)\b/i.test(titleLower)) {
              return false;
            }
            
            // Reject if title looks like a URL or file path
            if (titleLower.includes('/') && (titleLower.includes('.') || titleLower.includes('#'))) {
              return false;
            }
            
            // Reject if artist looks like a title fragment (e.g., "The 20 best album covers from the 70s")
            if (artistLower.length > 30 && (artistLower.includes('best') || artistLower.includes('top'))) {
              return false;
            }
            
            return true;
            });
          }
          
          // Only treat as success if we have valid candidates
          if (validCandidates.length > 0) {
            // Normalize candidates into ScanResult structure (same as library flow)
            const normalizedResult = normalizeScanResult({
              bestMatch: validCandidates[0],
              alternates: validCandidates.slice(1),
              confidence: validCandidates[0].confidence || 0.5,
            });
            
            // Store candidates as suggestions (user can review later)
            // Use same structure as successful identification for consistency
            const resultData = JSON.stringify({
              // Normalized structure (current + alternates)
              current: normalizedResult.current,
              alternates: normalizedResult.alternates,
              // Original structure (for backward compatibility)
              bestMatch: validCandidates[0],
              alternates: validCandidates.slice(1),
              confidence: validCandidates[0].confidence || 0.5, // Use actual confidence from suggestion
              isSuggestion: true,
              extractedText: error.extractedText,
              // Store albumSuggestions metadata for reference
              albumSuggestions: albumSuggestions.length > 0 ? albumSuggestions : undefined,
            });
            await updateBatchPhoto(photo.id, 'success', resultData);
            completed++;
          } else {
            // All candidates were filtered out - treat as failure
            console.warn(`[BatchProcessing] All candidates filtered out for photo ${photo.id} - treating as failure`);
            await updateBatchPhoto(
              photo.id,
              'error',
              undefined,
              'Could not identify album. The candidates found were not valid. Please try manual entry or ensure the album cover is clear and well-lit.'
            );
            failed++;
          }
        } else {
          // Hard errors: log as error
          console.error(`[BatchProcessing] Error identifying photo ${photo.id}:`, error);
          
          if (error.code === 'TIMEOUT') {
            // Timeout - provide helpful error message
            await updateBatchPhoto(
              photo.id,
              'error',
              undefined,
              'Request timed out. The backend may be slow or unavailable. Please try again or check your connection.'
            );
            failed++;
          } else {
            // Other errors
            await updateBatchPhoto(
              photo.id,
              'error',
              undefined,
              error.message || 'Identification failed. Please try again or enter manually.'
            );
            failed++;
          }
        }
      }

      // Notify progress after each photo
      this.notifyProgress(jobId, {
        current: photos.indexOf(photo) + 1,
        total: photos.length,
        completed,
        failed,
      });
    }

    // Mark job as completed
    await updateBatchJobStatus(jobId, 'completed');
    this.activeJobs.delete(jobId);
    this.callbacks.delete(jobId);
  }

  /**
   * Resume processing for all active jobs (called on app start)
   */
  async resumeAllJobs(onProgress?: (jobId: string, progress: any) => void): Promise<void> {
    const activeJobs = await getActiveBatchJobs();
    
    for (const job of activeJobs) {
      if (job.status === 'pending' || job.status === 'processing') {
        const callback = onProgress
          ? (progress: any) => onProgress(job.id, progress)
          : undefined;
        this.startProcessing(job.id, callback).catch(console.error);
      }
    }
  }

  /**
   * Get processed results for a job
   */
  async getJobResults(jobId: string): Promise<{
    photos: BatchPhoto[];
    results: Map<string, { bestMatch: IdentificationMatch; alternates: IdentificationMatch[]; confidence: number }>;
  }> {
    const photos = await getBatchPhotos(jobId);
    const results = new Map();

    for (const photo of photos) {
      if (photo.status === 'success' && photo.resultData) {
        try {
          const result = JSON.parse(photo.resultData);
          results.set(photo.id, result);
        } catch (error) {
          console.error(`[BatchProcessing] Failed to parse result for photo ${photo.id}:`, error);
        }
      }
    }

    return { photos, results };
  }

  /**
   * Check if a job is currently processing
   */
  isProcessing(jobId: string): boolean {
    return this.activeJobs.has(jobId);
  }

  /**
   * Notify progress callback
   */
  private notifyProgress(jobId: string, progress: {
    current: number;
    total: number;
    completed: number;
    failed: number;
  }): void {
    const callback = this.callbacks.get(jobId);
    if (callback) {
      callback({
        jobId,
        ...progress,
      });
    }
  }
}

export const batchProcessingService = new BatchProcessingService();

