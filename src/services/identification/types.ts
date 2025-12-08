/**
 * Identification Service Types
 * 
 * Shared types for the identification service layer.
 */

import { ResolvedAlbum } from '../metadata/types';
import { IdentificationCandidate } from '../vision/types';

/**
 * Options for album identification
 */
export interface IdentificationOptions {
  /** Minimum confidence threshold (0-1) */
  minConfidence?: number;
  
  /** Prefer vinyl releases */
  preferVinyl?: boolean;
  
  /** Fetch tracklist */
  fetchTracks?: boolean;
  
  /** Fetch HD cover art */
  fetchCoverArt?: boolean;
  
  /** Maximum number of Discogs queries per candidate */
  maxDiscogsQueries?: number;
  
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

/**
 * Identification result
 */
export interface IdentificationResult {
  /** Resolved album metadata */
  album: ResolvedAlbum;
  
  /** Whether this was a cache hit */
  fromCache: boolean;
  
  /** Source candidates that led to this resolution */
  sourceCandidates: IdentificationCandidate[];
}

/**
 * Identification error
 */
export interface IdentificationError {
  code: 'NETWORK_ERROR' | 'INVALID_IMAGE' | 'API_ERROR' | 'TIMEOUT' | 'UNKNOWN' | 'LOW_CONFIDENCE' | 'NO_CANDIDATES';
  message: string;
  originalError?: unknown;
  candidates?: IdentificationCandidate[];
  extractedText?: string;
}

