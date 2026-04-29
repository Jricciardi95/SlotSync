/**
 * Identification Orchestrator
 * 
 * High-level orchestrator for album identification from images.
 * 
 * BACKEND IS THE SINGLE SOURCE OF TRUTH:
 * - All identification logic (Vision → Candidates → Discogs → MusicBrainz → CAA) happens on backend
 * - Frontend only: validates image, hashes it, calls backend, caches result
 * 
 * Flow:
 * 1. Validate image
 * 2. Generate image hash
 * 3. Check local DB cache
 * 4. If cache miss: Call backend /api/identify-record
 * 5. Parse backend response → ResolvedAlbum
 * 6. Save to cache
 * 7. Return ResolvedAlbum
 */

import * as FileSystem from 'expo-file-system/legacy';
import { generateImageHash } from '../../utils/imageHash';
import { preprocessImageForVision, validateImageForVision } from '../vision/visionService';
import { findRecordByImageHash } from '../db';
import { saveResolvedAlbum } from '../db';
import { getApiUrl, API_CONFIG } from '../../config/api';
import { apiFetch } from '../../config/apiFetch';
import { IdentificationResult, IdentificationError, IdentificationOptions } from './types';
import { ResolvedAlbum } from '../metadata/types';
import { debug } from '../../utils/debug';
import { logger } from '../../utils/logger';

/**
 * Converts a cached database record to ResolvedAlbum format
 */
function cachedRecordToResolvedAlbum(cached: any): ResolvedAlbum {
  return {
    artist: cached.artist,
    albumTitle: cached.title,
    releaseYear: cached.year ?? undefined,
    genre: cached.genre ?? undefined,
    discogsId: cached.discogsId ?? undefined,
    musicbrainzId: cached.musicbrainzId ?? undefined,
    coverHdUrl: cached.coverImageRemoteUrl ?? undefined,
    tracks: cached.tracks.map((t: any) => ({
      title: t.title,
      position: t.trackNumber ?? 0,
      side: t.side ?? undefined,
      discNumber: t.discNumber ?? undefined,
      durationSeconds: t.durationSeconds ?? undefined,
    })),
    confidence: 1.0, // High confidence for cached results
    sourceCandidates: [], // Not stored in cache
  };
}

/**
 * Calls backend /api/identify-record endpoint
 * 
 * Backend performs the full pipeline:
 * - Google Vision (OCR + Web Detection + Labels)
 * - Candidate extraction
 * - Discogs search & resolution
 * - MusicBrainz enrichment
 * - Cover Art Archive fetching
 * 
 * Returns complete ResolvedAlbum with all metadata.
 */
async function callBackendIdentification(
  imageUri: string,
  abortSignal?: AbortSignal
): Promise<ResolvedAlbum> {
  const formData = new FormData();
  formData.append('image', {
    uri: imageUri,
    type: 'image/jpeg',
    name: 'cover.jpg',
  } as any);

  const apiUrl = getApiUrl(API_CONFIG.ENDPOINTS.IDENTIFY_RECORD);
  
  logger.debug('[IDENTIFICATION] Calling API', {
    url: apiUrl,
    base: API_CONFIG.BASE_URL,
    timeoutMs: API_CONFIG.TIMEOUT,
  });

  // Validate URL doesn't contain localhost (won't work on physical devices)
  if (apiUrl.includes('localhost') || apiUrl.includes('127.0.0.1')) {
    const errorMsg =
      'API URL contains localhost — physical devices cannot reach it. Set EXPO_PUBLIC_API_BASE_URL to your staging or LAN server (see .env.example and docs/STAGING_CHECKLIST.md).';
    logger.error('[IDENTIFICATION]', errorMsg);
    throw {
      code: 'NETWORK_ERROR' as const,
      message: errorMsg,
    } as IdentificationError;
  }
  
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    logger.error(
      '[IDENTIFICATION] Request timed out — check backend running and LAN URL (not localhost on device)'
    );
    controller.abort();
  }, API_CONFIG.TIMEOUT);
  
  if (abortSignal) {
    abortSignal.addEventListener('abort', () => controller.abort());
  }

  try {
    debug.log('IDENTIFICATION', `Calling backend: ${apiUrl}`);
    
    const response = await apiFetch(apiUrl, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
      headers: {
        Accept: 'application/json',
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      
      debug.error('IDENTIFICATION', `Backend error: ${response.status}`, errorData);
      
      // Handle specific error codes from backend
      if (errorData.code === 'LOW_CONFIDENCE') {
        throw {
          code: 'LOW_CONFIDENCE' as const,
          message: errorData.message || 'Could not identify album with sufficient confidence',
          candidates: errorData.candidates || [],
          extractedText: errorData.extractedText,
        } as IdentificationError;
      }
      
      if (errorData.code === 'NO_CANDIDATES') {
        throw {
          code: 'NO_CANDIDATES' as const,
          message: errorData.message || 'Could not extract any album candidates from image',
          extractedText: errorData.extractedText,
        } as IdentificationError;
      }
      
      throw {
        code: 'API_ERROR' as const,
        message: errorData.error || errorData.message || `API error: ${response.status}`,
        originalError: errorData,
      } as IdentificationError;
    }

    const data = await response.json();
    
    // Backend returns new format:
    // { status, confidenceLevel, bestMatch: { artist, title, year, discogsId, coverImageRemoteUrl, tracks }, suggestions, ... }
    // OR legacy format: { success, artist, albumTitle, ... }
    
    // Check for new format first (bestMatch structure)
    if (data.bestMatch && data.bestMatch.artist && data.bestMatch.title) {
      // New format: use bestMatch
      const bestMatch = data.bestMatch;
      const album: ResolvedAlbum = {
        artist: bestMatch.artist,
        albumTitle: bestMatch.title,
        releaseYear: bestMatch.year ?? undefined,
        discogsId: bestMatch.discogsId ?? undefined,
        musicbrainzId: bestMatch.musicbrainzId ?? undefined,
        coverHdUrl: bestMatch.coverImageRemoteUrl ?? undefined,
        tracks: (bestMatch.tracks || []).map((t: any) => ({
          title: t.title,
          position: t.position || t.trackNumber || 0,
          side: t.side ?? undefined,
          discNumber: t.discNumber ?? undefined,
          durationSeconds: t.durationSeconds ?? undefined,
        })),
        confidence: bestMatch.confidence ?? data.confidence ?? 0.5,
        sourceCandidates: [], // Backend doesn't return candidates in response
      };
      
      debug.log('IDENTIFICATION', `✅ Backend identified: "${album.artist}" - "${album.albumTitle}" (confidence: ${album.confidence.toFixed(3)})`);
      return album;
    }
    
    // Legacy format: { success, artist, albumTitle, ... }
    if (data.success && data.artist && data.albumTitle) {
      const album: ResolvedAlbum = {
        artist: data.artist,
        albumTitle: data.albumTitle,
        releaseYear: data.releaseYear ?? undefined,
        discogsId: data.discogsId ?? undefined,
        musicbrainzId: data.musicbrainzId ?? undefined,
        coverHdUrl: data.coverImageUrl ?? undefined,
        tracks: (data.tracks || []).map((t: any) => ({
          title: t.title,
          position: t.position || 0,
          side: t.side ?? undefined,
          discNumber: t.discNumber ?? undefined,
          durationSeconds: t.durationSeconds ?? undefined,
        })),
        confidence: data.confidence || 0.5,
        sourceCandidates: [], // Backend doesn't return candidates in response
      };
      
      debug.log('IDENTIFICATION', `✅ Backend identified: "${album.artist}" - "${album.albumTitle}" (confidence: ${album.confidence.toFixed(3)})`);
      return album;
    }
    
    // Invalid response format
    throw {
      code: 'API_ERROR' as const,
      message: 'Invalid response format from backend',
      originalError: data,
    } as IdentificationError;
  } catch (error: any) {
    clearTimeout(timeoutId);
    
    // Check for timeout/abort errors
    if (error.name === 'AbortError' || controller.signal.aborted || error.message?.includes('timeout')) {
      const base = API_CONFIG.BASE_URL;
      const errorMessage = `Network request timed out after ${API_CONFIG.TIMEOUT}ms.

Check: backend running, URL correct (${base}), same network if LAN, firewall open, and staging HTTPS reachable. Test: GET ${base}/health`;
      
      logger.debug('[IDENTIFICATION] Timeout/Abort', errorMessage);
      logger.captureException(error, {
        screen: 'identification',
        kind: 'timeout',
        url: apiUrl,
        aborted: controller.signal.aborted,
      });
      throw {
        code: 'TIMEOUT' as const,
        message: errorMessage,
        originalError: error,
      } as IdentificationError;
    }
    
    // Check for network errors
    if (error.message?.includes('Network request failed') || error.message?.includes('Failed to fetch')) {
      const errorMessage = `Network request failed. Backend: ${API_CONFIG.BASE_URL}. If using a shared API key, set EXPO_PUBLIC_SLOTSYNC_API_KEY to match server SLOTSYNC_API_KEY.`;
      logger.debug('[IDENTIFICATION] Network error', errorMessage);
      logger.captureException(error, { screen: 'identification', kind: 'network' });
      throw {
        code: 'NETWORK_ERROR' as const,
        message: errorMessage,
        originalError: error,
      } as IdentificationError;
    }
    
    // Re-throw IdentificationError as-is
    if (error.code && error.message) {
      throw error as IdentificationError;
    }
    
    logger.captureException(error, { screen: 'identification', kind: 'api' });
    throw {
      code: 'API_ERROR' as const,
      message: error.message || 'Failed to call backend identification API',
      originalError: error,
    } as IdentificationError;
  }
}

/**
 * Identifies an album from an image
 * 
 * BACKEND IS THE SINGLE SOURCE OF TRUTH:
 * - All identification logic happens on backend
 * - Frontend only: validates, hashes, calls backend, caches result
 * 
 * Flow:
 * 1. Validate image
 * 2. Generate image hash
 * 3. Check local DB cache
 * 4. If cache miss: Call backend /api/identify-record
 * 5. Parse backend response → ResolvedAlbum
 * 6. Save to cache
 * 7. Return ResolvedAlbum
 * 
 * @param imageUri - Local file URI of the image
 * @param options - Identification options (passed to backend if needed)
 * @returns Identification result with album and metadata
 * @throws IdentificationError if identification fails
 */
export async function identifyAlbumFromImage(
  imageUri: string,
  options: IdentificationOptions = {}
): Promise<IdentificationResult> {
  const { abortSignal } = options;

  debug.log('IDENTIFICATION', 'Starting album identification...');

  // STEP 1: Validate image
  const fileInfo = await FileSystem.getInfoAsync(imageUri);
  if (!fileInfo.exists) {
    throw {
      code: 'INVALID_IMAGE' as const,
      message: 'Image file not found',
    } as IdentificationError;
  }

  const isValid = await validateImageForVision(imageUri);
  if (!isValid) {
    throw {
      code: 'INVALID_IMAGE' as const,
      message: 'Image file is invalid or too large for processing',
    } as IdentificationError;
  }

  // STEP 2: Generate image hash
  const imageHash = await generateImageHash(imageUri);
  if (!imageHash) {
    debug.warn('IDENTIFICATION', 'Could not generate image hash, proceeding without cache');
  } else {
    debug.log('IDENTIFICATION', `Image hash: ${imageHash.substring(0, 16)}...`);

    // STEP 3: Check cache
    const cached = await findRecordByImageHash(imageHash);
    if (cached) {
      debug.log('IDENTIFICATION', '✅ Cache hit! Returning cached result');
      
      const album = cachedRecordToResolvedAlbum(cached);
      debug.log('IDENTIFICATION', `Cached album: "${album.artist}" - "${album.albumTitle}"`);
      
      return {
        album,
        fromCache: true,
        sourceCandidates: [],
      };
    }

    debug.log('IDENTIFICATION', 'Cache miss - calling backend');
  }

  // STEP 3.5: Test backend connectivity before processing
  debug.log('IDENTIFICATION', 'Testing backend connectivity...');
  try {
    const healthUrl = `${API_CONFIG.BASE_URL}/health`;
    const healthController = new AbortController();
    const healthTimeout = setTimeout(() => healthController.abort(), 5000); // 5 second timeout for health check
    
    const healthResponse = await fetch(healthUrl, {
      method: 'GET',
      signal: healthController.signal,
    });
    
    clearTimeout(healthTimeout);
    
    if (!healthResponse.ok) {
      throw new Error(`Health check failed: ${healthResponse.status}`);
    }
    
    const healthData = await healthResponse.json();
    debug.log('IDENTIFICATION', '✅ Backend is reachable', healthData);
  } catch (error: any) {
    debug.error('IDENTIFICATION', '❌ Backend connectivity test failed', error);
    const errorMessage = `Cannot reach backend at ${API_CONFIG.BASE_URL}. Open GET ${API_CONFIG.BASE_URL}/health in a browser on the same device. For preview builds, confirm EAS EXPO_PUBLIC_API_BASE_URL.`;
    
    throw {
      code: 'NETWORK_ERROR' as const,
      message: errorMessage,
      originalError: error,
    } as IdentificationError;
  }

  // STEP 4: Preprocess image
  debug.log('IDENTIFICATION', 'Preprocessing image...');
  const preprocessedImageUri = await preprocessImageForVision(imageUri, {
    maxWidth: 1024,
    maxHeight: 1024,
    quality: 0.85,
  });

  // STEP 5: Call backend identification API
  // Backend performs: Vision → Candidates → Discogs → MusicBrainz → CAA
  debug.log('IDENTIFICATION', 'Calling backend /api/identify-record...');
  const startTime = Date.now();
  let album: ResolvedAlbum;
  try {
    album = await callBackendIdentification(preprocessedImageUri, abortSignal);
    debug.log('IDENTIFICATION', `Backend identification completed in ${Date.now() - startTime}ms`);
  } catch (error: any) {
    debug.error('IDENTIFICATION', 'Backend identification failed', error);
    throw error;
  }

  // CRITICAL: DO NOT automatically save records to library
  // Records should only be saved when user explicitly clicks "Looks Good" in the UI
  // The cache lookup (STEP 3) is for finding previously identified albums,
  // but we should NOT create new records until the user confirms the match
  // 
  // If you want to cache for faster re-identification, use a separate cache-only function
  // that only stores image hash -> metadata mapping without creating records

  debug.log('IDENTIFICATION', '✅ Identification complete');

  return {
    album,
    fromCache: false,
    sourceCandidates: [], // Backend doesn't return candidates
  };
}

