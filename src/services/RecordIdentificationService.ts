import * as FileSystem from 'expo-file-system/legacy';
import { getApiUrl, API_CONFIG } from '../config/api';

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
};

export type IdentificationResponse = {
  confidence: number;
  bestMatch: IdentificationMatch;
  alternates: IdentificationMatch[];
};

export type IdentificationError = {
  code: 'NETWORK_ERROR' | 'INVALID_IMAGE' | 'API_ERROR' | 'TIMEOUT' | 'UNKNOWN';
  message: string;
  originalError?: unknown;
};

/**
 * Identifies a vinyl record from an album cover image
 * 
 * @param imageUri - Local file URI of the album cover image
 * @param abortSignal - Optional AbortSignal to cancel the request
 * @returns Promise with identification results including best match and alternates
 * @throws IdentificationError if identification fails
 */
export const identifyRecord = async (
  imageUri: string,
  abortSignal?: AbortSignal
): Promise<IdentificationResponse> => {
  // Validate image file exists
  const fileInfo = await FileSystem.getInfoAsync(imageUri);
  if (!fileInfo.exists) {
    throw {
      code: 'INVALID_IMAGE' as const,
      message: 'Image file not found',
    } as IdentificationError;
  }

  // Create FormData for multipart upload
  // React Native FormData format
  const formData = new FormData();
  formData.append('image', {
    uri: imageUri,
    type: 'image/jpeg',
    name: 'cover.jpg',
  } as any);

  // Create AbortController for timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);

  // Merge abort signals if provided
  if (abortSignal) {
    abortSignal.addEventListener('abort', () => controller.abort());
  }

  try {
    const apiUrl = getApiUrl(API_CONFIG.ENDPOINTS.IDENTIFY_RECORD);
    
    console.log(`[RecordIdentification] Calling API: ${apiUrl}`);

    const response = await fetch(apiUrl, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
      // Don't set Content-Type header - let fetch set it with boundary
      headers: {},
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw {
        code: 'API_ERROR' as const,
        message: `API returned ${response.status}: ${errorText}`,
      } as IdentificationError;
    }

    const data = await response.json();

    // Validate response structure
    if (!data.bestMatch || !data.bestMatch.artist || !data.bestMatch.title) {
      throw {
        code: 'API_ERROR' as const,
        message: 'Invalid response format from API',
      } as IdentificationError;
    }

    return data as IdentificationResponse;
  } catch (error: any) {
    clearTimeout(timeoutId);

    // Handle abort (timeout or user cancellation)
    if (error.name === 'AbortError' || abortSignal?.aborted) {
      // Don't throw error if user cancelled - just let it fail silently
      if (abortSignal?.aborted) {
        throw {
          code: 'UNKNOWN' as const,
          message: 'Request cancelled',
          originalError: error,
        } as IdentificationError;
      }
      throw {
        code: 'TIMEOUT' as const,
        message: 'Request timed out. Please check your connection and try again.',
        originalError: error,
      } as IdentificationError;
    }

    // Handle network errors
    if (error.message?.includes('Network request failed') || error.message?.includes('Failed to fetch')) {
      throw {
        code: 'NETWORK_ERROR' as const,
        message: 'Network error. Please check your internet connection and API configuration.',
        originalError: error,
      } as IdentificationError;
    }

    // If it's already an IdentificationError, re-throw
    if (error.code && error.message) {
      throw error as IdentificationError;
    }

    // Unknown error
    throw {
      code: 'UNKNOWN' as const,
      message: error.message || 'An unexpected error occurred',
      originalError: error,
    } as IdentificationError;
  }
};

