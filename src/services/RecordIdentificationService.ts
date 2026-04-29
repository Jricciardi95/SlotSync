/**
 * Record Identification Service (Legacy/Compatibility Layer)
 * 
 * This file provides backward compatibility for existing code.
 * New code should use: src/services/identification/orchestrator.ts
 * 
 * @deprecated Use identifyAlbumFromImage from '../services/identification' instead
 */

import * as FileSystem from 'expo-file-system/legacy';
import { getApiUrl, API_CONFIG } from '../config/api';
import { apiFetch } from '../config/apiFetch';
import { identifyAlbumFromImage } from './identification/orchestrator';
import { saveResolvedAlbum } from './db';
import { generateImageHash } from '../utils/imageHash';
import { ResolvedAlbum } from './metadata/types';
import { logger } from '../utils/logger';

export type TrackInfo = {
  title: string;
  trackNumber?: number;
  discNumber?: number | null;
  side?: string | null;
  durationSeconds?: number | null;
};

export type IdentificationMatch = {
  artist: string;
  title: string;
  year?: number;
  coverImageRemoteUrl?: string;
  discogsId?: string;
  tracks?: TrackInfo[];
  confidence?: number;
  source?: string;
  genre?: string[];
  style?: string[];
  format?: string[];
};

export type IdentifiedAlbum = IdentificationMatch;

export type ScanResult = {
  current: IdentifiedAlbum;
  alternates: IdentifiedAlbum[];
};

export type IdentificationResponse = {
  confidence: number;
  bestMatch: IdentificationMatch;
  alternates: IdentificationMatch[];
  candidates?: IdentificationMatch[];
  primaryMatch?: IdentificationMatch;
};

export type IdentificationError = {
  code: 'NETWORK_ERROR' | 'INVALID_IMAGE' | 'API_ERROR' | 'TIMEOUT' | 'UNKNOWN' | 'LOW_CONFIDENCE';
  message: string;
  originalError?: unknown;
  candidates?: IdentificationMatch[];
  extractedText?: string;
};

/**
 * Frontend safety filter: Check if a candidate looks like a real album
 * Rejects URLs, article titles, Wikipedia pages, social media, etc.
 * This is a second-layer safety filter in addition to backend filtering.
 */
function looksLikeRealAlbumTitle(candidate: IdentificationMatch): boolean {
  if (!candidate.title || candidate.title.length < 2) return false;
  if (!candidate.artist) return false; // Must have artist

  const artist = candidate.artist.trim().toLowerCase();
  const title = candidate.title.trim().toLowerCase();
  const combined = `${artist} ${title}`;

  // Reject URLs
  if (combined.includes('http://') || combined.includes('https://') || 
      combined.includes('www.') || combined.includes('.com') ||
      combined.includes('.net') || combined.includes('.org')) {
    return false;
  }

  // Reject article/blog patterns
  const badPatterns = [
    'wikipedia', 'wiki/', 'review', 'reviews', 'lyrics', 'lyric',
    'blog', 'reddit', 'facebook', 'twitter', 'pinterest', 'instagram',
    'best album covers', 'top ', 'the 10 best', 'the 20 best',
    'album covers from', 'r/musicsuggestions', 'r/', '| releases',
    'discogs', 'releases', 'release',
  ];
  
  if (badPatterns.some(p => combined.includes(p))) return false;

  // Reject pipe characters (common in web page titles)
  if (artist.includes('|') || title.includes('|')) return false;

  // Reject titles that are too long (likely sentences, not album names)
  if (title.length > 80) return false;

  // Reject generic words
  if (['discogs', 'releases', 'album', 'albums'].includes(title)) return false;

  return true;
}

/**
 * Retry configuration for API calls
 */
const RETRY_CONFIG = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 10000, // 10 seconds
  backoffMultiplier: 2,
};

/**
 * Calculates exponential backoff delay
 */
const getRetryDelay = (attempt: number): number => {
  const delay = RETRY_CONFIG.initialDelay * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt);
  return Math.min(delay, RETRY_CONFIG.maxDelay);
};

/**
 * Identifies a vinyl record from a barcode
 * 
 * @param barcode - Barcode string (EAN, UPC, etc.)
 * @param abortSignal - Optional AbortSignal to cancel the request
 * @returns Promise with identification results including best match and alternates
 * @throws IdentificationError if identification fails
 */
export const identifyRecordByBarcode = async (
  barcode: string,
  abortSignal?: AbortSignal
): Promise<IdentificationResponse> => {
  // Retry logic with exponential backoff
  let lastError: IdentificationError | null = null;
  
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = getRetryDelay(attempt - 1);
      logger.debug(`[RecordIdentification] Barcode retry attempt ${attempt}/${RETRY_CONFIG.maxRetries} after ${delay}ms...`);
      
      if (abortSignal?.aborted) {
        throw {
          code: 'UNKNOWN' as const,
          message: 'Request cancelled',
        } as IdentificationError;
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    let timeoutId: NodeJS.Timeout | null = null;
    
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);

      if (abortSignal) {
        abortSignal.addEventListener('abort', () => controller.abort());
      }

      const apiUrl = getApiUrl(API_CONFIG.ENDPOINTS.IDENTIFY_RECORD);
      
      // CRITICAL: Log the exact URL being called
      logger.debug(`[RecordIdentification] ========================================`);
      logger.debug(`[RecordIdentification] 🚀 CALLING API WITH BARCODE (attempt ${attempt + 1})`);
      logger.debug(`[RecordIdentification] 📍 Full URL: ${apiUrl}`);
      logger.debug(`[RecordIdentification] 📍 Base URL: ${API_CONFIG.BASE_URL}`);
      logger.debug(`[RecordIdentification] 📍 Barcode: ${barcode}`);
      logger.debug(`[RecordIdentification] ⏱️  Timeout: ${API_CONFIG.TIMEOUT}ms (90 seconds)`);
      
      // Validate URL doesn't contain localhost (won't work on physical devices)
      if (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
        logger.error(`[RecordIdentification] ❌ ERROR: URL contains localhost/127.0.0.1!`);
        logger.error(`[RecordIdentification] ❌ This will NOT work on physical devices!`);
        logger.error(`[RecordIdentification] ❌ Set EXPO_PUBLIC_API_BASE_URL to staging HTTPS or LAN server`);
        throw {
          code: 'NETWORK_ERROR' as const,
          message:
            'API URL contains localhost — physical devices cannot reach it. Set EXPO_PUBLIC_API_BASE_URL to your staging server or LAN IP (see .env.example and docs/STAGING_CHECKLIST.md).',
        } as IdentificationError;
      }
      
      logger.debug(`[RecordIdentification] ========================================`);

      const response = await apiFetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ barcode }),
        signal: controller.signal,
      });

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (!response.ok) {
        let errorData: any = {};
        try {
          const errorText = await response.text();
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: await response.text().catch(() => 'Unknown error') };
        }

        if (response.status === 400) {
          throw {
            code: 'API_ERROR' as const,
            message: `Barcode not found: ${errorData.message || errorData.error || 'Unknown error'}`,
            originalError: errorData,
          } as IdentificationError;
        }

        if (response.status >= 500 && attempt < RETRY_CONFIG.maxRetries) {
          lastError = {
            code: 'API_ERROR' as const,
            message: `API returned ${response.status}: ${errorData.message || errorData.error || 'Server error'}`,
            originalError: errorData,
          } as IdentificationError;
          continue;
        }

        throw {
          code: 'API_ERROR' as const,
          message: `API returned ${response.status}: ${errorData.message || errorData.error || 'Unknown error'}`,
          originalError: errorData,
        } as IdentificationError;
      }

      const data = await response.json();

      if (!data.bestMatch || !data.bestMatch.artist || !data.bestMatch.title) {
        throw {
          code: 'API_ERROR' as const,
          message: 'Invalid response format from API',
        } as IdentificationError;
      }

      logger.debug(`[RecordIdentification] ✅ Barcode success on attempt ${attempt + 1}`);
      return data as IdentificationResponse;
    } catch (error: any) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (error.name === 'AbortError' || abortSignal?.aborted) {
        if (abortSignal?.aborted) {
          throw {
            code: 'UNKNOWN' as const,
            message: 'Request cancelled',
            originalError: error,
          } as IdentificationError;
        }
        
        if (attempt < RETRY_CONFIG.maxRetries) {
          lastError = {
            code: 'TIMEOUT' as const,
            message: 'Request timed out. Retrying...',
            originalError: error,
          } as IdentificationError;
          continue;
        }
        
        throw {
          code: 'TIMEOUT' as const,
          message: 'Request timed out after multiple attempts.',
          originalError: error,
        } as IdentificationError;
      }

      if (error.message?.includes('Network request failed') || error.message?.includes('Failed to fetch')) {
        if (attempt < RETRY_CONFIG.maxRetries) {
          lastError = {
            code: 'NETWORK_ERROR' as const,
            message: 'Network error. Retrying...',
            originalError: error,
          } as IdentificationError;
          continue;
        }
        
        throw {
          code: 'NETWORK_ERROR' as const,
          message: 'Network error after multiple attempts.',
          originalError: error,
        } as IdentificationError;
      }

      if (error.code && error.message) {
        if (error.code === 'INVALID_IMAGE') {
          throw error as IdentificationError;
        }
        
        if (attempt < RETRY_CONFIG.maxRetries && error.code !== 'API_ERROR') {
          lastError = error as IdentificationError;
          continue;
        }
        
        throw error as IdentificationError;
      }

      if (attempt < RETRY_CONFIG.maxRetries) {
        lastError = {
          code: 'UNKNOWN' as const,
          message: error.message || 'An unexpected error occurred. Retrying...',
          originalError: error,
        } as IdentificationError;
        continue;
      }

      throw {
        code: 'UNKNOWN' as const,
        message: error.message || 'An unexpected error occurred after multiple attempts',
        originalError: error,
      } as IdentificationError;
    }
  }

  if (lastError) {
    throw lastError;
  }

  throw {
    code: 'UNKNOWN' as const,
    message: 'Barcode identification failed after all retry attempts',
  } as IdentificationError;
};

/**
 * Test connectivity to the backend API
 * This should be called before attempting identification
 */
export const testApiConnectivity = async (): Promise<boolean> => {
  try {
    const pingUrl = getApiUrl(API_CONFIG.ENDPOINTS.PING || '/api/ping');
    logger.debug(`[RecordIdentification] 🔍 Testing connectivity to: ${pingUrl}`);
    logger.debug(`[RecordIdentification] 🔍 Base URL: ${API_CONFIG.BASE_URL}`);
    
    // Use AbortController for timeout (AbortSignal.timeout is not available in React Native)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout for ping
    
    const response = await apiFetch(pingUrl, {
      method: 'GET',
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (response.ok) {
      const data = await response.json();
      logger.debug(`[RecordIdentification] ✅ Connectivity test passed:`, data);
      return true;
    } else {
      logger.warn(`[RecordIdentification] ⚠️  Connectivity test failed: HTTP ${response.status}`);
      return false;
    }
  } catch (error: any) {
    // Clear timeout if it was set
    if (error.name === 'AbortError') {
      logger.error(`[RecordIdentification] ❌ Connectivity test timed out after 5 seconds`);
    } else {
      logger.error(`[RecordIdentification] ❌ Connectivity test failed:`, error.message);
    }
    logger.error(`[RecordIdentification] ❌ This usually means the backend is unreachable at ${API_CONFIG.BASE_URL}`);
    logger.error(`[RecordIdentification] ❌ Check that:`);
    logger.error(`[RecordIdentification]    1. Backend server is running (node server-hybrid.js)`);
    logger.error(`[RecordIdentification]    2. EXPO_PUBLIC_API_BASE_URL is set correctly`);
    logger.error(`[RecordIdentification]    3. Device and computer are on the same Wi-Fi network`);
    return false;
  }
};

/**
 * Identifies a vinyl record from an image with automatic caching
 * 
 * Pipeline with caching:
 * 1. Generate image hash from image file
 * 2. Check local database cache by hash → instant return if found
 * 3. If cache miss → preprocess image → send to backend API
 * 4. Backend runs: Vision → Candidates → Discogs → MusicBrainz → CAA
 * 5. Save successful result to cache with image hash
 * 
 * This enables:
 * - Instant repeat matches (same image scanned again)
 * - Offline support for previously identified albums
 * - Reduced API calls and faster response times
 * 
 * @param imageUri - Local file URI of the image
 * @param abortSignal - Optional AbortSignal to cancel the request
 * @returns Promise with identification results
 * @throws IdentificationError if identification fails
 */
/**
 * Legacy identifyRecord function - uses new orchestrator internally
 * 
 * @deprecated Use identifyAlbumFromImage from '../services/identification' instead
 */
export const identifyRecord = async (
  imageUri: string,
  abortSignal?: AbortSignal
): Promise<IdentificationResponse> => {
  try {
    // Use new orchestrator
    const result = await identifyAlbumFromImage(imageUri, {
      minConfidence: 0.6,
      preferVinyl: true,
      fetchTracks: true,
      fetchCoverArt: true,
      abortSignal,
    });

    // Convert ResolvedAlbum to IdentificationResponse format (backward compatibility)
    const response: IdentificationResponse = {
      confidence: result.album.confidence,
      bestMatch: {
        artist: result.album.artist,
        title: result.album.albumTitle,
        year: result.album.releaseYear,
        genre: result.album.genre ? [result.album.genre] : undefined,
        coverImageRemoteUrl: result.album.coverHdUrl,
        discogsId: result.album.discogsId,
        tracks: result.album.tracks.map(t => ({
          title: t.title,
          trackNumber: t.position,
          discNumber: t.discNumber,
          side: t.side,
          durationSeconds: t.durationSeconds,
        })),
        confidence: result.album.confidence,
        source: result.fromCache ? 'cache' : 'api',
      },
      alternates: [],
      candidates: result.sourceCandidates
        .filter(c => c.artist && c.album)
        .map(c => ({
          artist: c.artist!,
          title: c.album!,
          confidence: c.confidence,
          source: c.source,
        })),
    };

    // CRITICAL: DO NOT automatically save records to library
    // Records should only be saved when user explicitly clicks "Looks Good"
    // Caching is handled by the orchestrator (image hash -> record lookup only)
    // The user must confirm the match before saving to library

    return response;
  } catch (error: any) {
    // Convert IdentificationError to legacy format
    if (error.code && error.message) {
      // Map NO_CANDIDATES to LOW_CONFIDENCE for backward compatibility
      if (error.code === 'NO_CANDIDATES') {
        throw {
          code: 'LOW_CONFIDENCE' as const,
          message: error.message,
          candidates: error.candidates,
          extractedText: error.extractedText,
        } as IdentificationError;
      }
      throw error as IdentificationError;
    }
    
    // Handle network errors
    if (error.name === 'TypeError' && error.message.includes('fetch')) {
      throw {
        code: 'NETWORK_ERROR' as const,
        message: 'Network error: Could not reach identification service',
        originalError: error,
      } as IdentificationError;
    }
    
    throw {
      code: 'UNKNOWN' as const,
      message: error.message || 'Unknown error occurred',
      originalError: error,
    } as IdentificationError;
  }
};

/**
 * Identifies a vinyl record from artist and title text (manual entry)
 * 
 * @param artist - Artist name
 * @param title - Album title
 * @param abortSignal - Optional AbortSignal to cancel the request
 * @returns Promise with identification results including best match and alternates
 * @throws IdentificationError if identification fails
 */
export const identifyRecordByText = async (
  artist: string,
  title: string,
  abortSignal?: AbortSignal
): Promise<IdentificationResponse> => {
  // Retry logic with exponential backoff
  let lastError: IdentificationError | null = null;
  
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    if (attempt > 0) {
      const delay = getRetryDelay(attempt - 1);
      logger.debug(`[RecordIdentification] Text lookup retry attempt ${attempt}/${RETRY_CONFIG.maxRetries} after ${delay}ms...`);
      
      if (abortSignal?.aborted) {
        throw {
          code: 'UNKNOWN' as const,
          message: 'Request cancelled',
        } as IdentificationError;
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    let timeoutId: NodeJS.Timeout | null = null;
    
    try {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);

      if (abortSignal) {
        abortSignal.addEventListener('abort', () => controller.abort());
      }

      // Use dedicated text lookup endpoint (NOT image endpoint)
      const apiUrl = getApiUrl('/api/identify-by-text');
      
      logger.debug(`[RecordIdentification] Looking up by text: "${artist}" - "${title}"`);
      logger.debug(`[RecordIdentification] Using endpoint: ${apiUrl}`);
      
      const response = await apiFetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ artist: artist.trim(), title: title.trim() }),
        signal: controller.signal,
      });

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (!response.ok) {
        let errorData: any = {};
        try {
          const errorText = await response.text();
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: await response.text().catch(() => 'Unknown error') };
        }

        if (response.status === 400) {
          throw {
            code: 'API_ERROR' as const,
            message: `Lookup failed: ${errorData.message || errorData.error || 'Unknown error'}`,
            originalError: errorData,
          } as IdentificationError;
        }

        if (response.status >= 500 && attempt < RETRY_CONFIG.maxRetries) {
          lastError = {
            code: 'API_ERROR' as const,
            message: `API returned ${response.status}: ${errorData.message || errorData.error || 'Server error'}`,
            originalError: errorData,
          } as IdentificationError;
          continue;
        }

        throw {
          code: 'API_ERROR' as const,
          message: errorData.message || errorData.error || `HTTP ${response.status}`,
          originalError: errorData,
        } as IdentificationError;
      }

      const data = await response.json();

      if (!data.bestMatch || !data.bestMatch.artist || !data.bestMatch.title) {
        throw {
          code: 'API_ERROR' as const,
          message: 'Invalid response format from API',
        } as IdentificationError;
      }

      logger.debug(`[RecordIdentification] ✅ Text lookup success on attempt ${attempt + 1}`);
      return data as IdentificationResponse;
    } catch (error: any) {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (error.name === 'AbortError' || abortSignal?.aborted) {
        if (abortSignal?.aborted) {
          throw {
            code: 'UNKNOWN' as const,
            message: 'Request cancelled',
          } as IdentificationError;
        }
        throw {
          code: 'TIMEOUT' as const,
          message: 'Request timed out',
          originalError: error,
        } as IdentificationError;
      }

      if (error.code && error.message) {
        throw error as IdentificationError;
      }

      if (attempt < RETRY_CONFIG.maxRetries) {
        lastError = {
          code: 'NETWORK_ERROR' as const,
          message: error.message || 'Network error during text lookup',
          originalError: error,
        } as IdentificationError;
        continue;
      }

      throw lastError || {
        code: 'UNKNOWN' as const,
        message: error.message || 'Unknown error during text lookup',
        originalError: error,
      } as IdentificationError;
    }
  }

  throw lastError || {
    code: 'UNKNOWN' as const,
    message: 'Text lookup failed after retries',
  } as IdentificationError;
};

/**
 * Normalizes an IdentificationResponse into a ScanResult structure
 * Combines primaryMatch/bestMatch with candidates to create current + alternates
 */
export const normalizeScanResult = (response: IdentificationResponse): ScanResult => {
  // Get primary match (could be primaryMatch or bestMatch)
  const primary = response.primaryMatch || response.bestMatch;
  
  // Get all candidates (could be from candidates array or alternates)
  const allCandidates: IdentifiedAlbum[] = response.candidates || response.alternates || [];
  
  // Combine primary with candidates, ensuring primary is first
  const normalized = [primary, ...allCandidates]
    .filter(Boolean)
    .filter((item, index, arr) =>
      index === arr.findIndex(x => x.artist === item.artist && x.title === item.title)
    )
    .map(item => ({
      ...item,
      confidence: item.confidence ?? response.confidence,
    }))
    .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0));
  
  // Split into current and alternates (max 2 alternates)
  const [current, ...rest] = normalized;
  
  return {
    current: current || primary, // Fallback to primary if somehow empty
    alternates: rest.slice(0, 2), // At most 2 alternates
  };
};

