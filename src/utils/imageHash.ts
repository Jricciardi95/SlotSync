/**
 * Image Hash Utility
 * 
 * Generates a hash from an image for caching and duplicate detection.
 * 
 * Uses multiple samples from different parts of the image to avoid collisions.
 * This matches the backend hash generation logic for consistency.
 */

import * as FileSystem from 'expo-file-system/legacy';
import { logger } from './logger';

/**
 * Generates a hash from an image file
 * 
 * Uses multiple samples from different parts of the image to create
 * a unique hash. This allows instant lookups for previously identified albums.
 * 
 * @param imageUri - Local file URI of the image
 * @returns Image hash string (hex) or null if generation fails
 */
export async function generateImageHash(imageUri: string): Promise<string | null> {
  try {
    // Read file as base64
    const base64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    if (!base64 || base64.length === 0) {
      logger.warn('[ImageHash] Empty file, cannot generate hash');
      return null;
    }

    // Convert base64 to binary for hashing
    // We'll use a simple hash function that matches backend logic
    const buffer = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
    
    if (buffer.length === 0) {
      return null;
    }

    // Sample from multiple locations to create unique hash
    const samples: Uint8Array[] = [];
    const sampleSize = Math.min(500, Math.floor(buffer.length / 10));
    
    // Sample from beginning
    if (buffer.length > sampleSize) {
      samples.push(buffer.slice(0, sampleSize));
    }
    
    // Sample from middle
    if (buffer.length > sampleSize * 2) {
      const midStart = Math.floor(buffer.length / 2);
      samples.push(buffer.slice(midStart, midStart + sampleSize));
    }
    
    // Sample from end
    if (buffer.length > sampleSize) {
      samples.push(buffer.slice(-sampleSize));
    }
    
    // Combine samples with buffer length and size for uniqueness
    let hash = buffer.length;
    for (const sample of samples) {
      for (let i = 0; i < sample.length; i++) {
        hash = ((hash << 5) - hash) + sample[i];
        hash = hash & hash; // Convert to 32-bit integer
      }
    }
    
    // Add buffer size to hash for additional uniqueness
    hash = hash ^ buffer.length;
    
    // Convert to positive hex string
    const hashString = Math.abs(hash).toString(16);
    
    logger.debug(`[ImageHash] Generated hash: ${hashString} (from ${buffer.length} bytes)`);
    return hashString;
  } catch (error) {
    logger.error('[ImageHash] Error generating hash:', error);
    return null;
  }
}

/**
 * Generates a hash from image buffer (for use with FormData)
 * 
 * This is used when we have the image in memory but haven't saved it yet.
 * 
 * @param imageUri - Local file URI
 * @returns Image hash string (hex) or null
 */
export async function generateImageHashFromUri(imageUri: string): Promise<string | null> {
  return generateImageHash(imageUri);
}

