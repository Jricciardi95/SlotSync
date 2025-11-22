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
import { identifyRecord, IdentificationMatch } from './RecordIdentificationService';

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
        
        // Store result as JSON
        const resultData = JSON.stringify({
          bestMatch: response.bestMatch,
          alternates: response.alternates,
          confidence: response.confidence,
        });

        await updateBatchPhoto(photo.id, 'success', resultData);
        completed++;
      } catch (error: any) {
        console.error(`[BatchProcessing] Failed to identify photo ${photo.id}:`, error);
        await updateBatchPhoto(
          photo.id,
          'error',
          undefined,
          error.message || 'Identification failed'
        );
        failed++;
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

