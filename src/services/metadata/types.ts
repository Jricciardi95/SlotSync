/**
 * Metadata Resolver Type Definitions
 * 
 * Types for the Discogs → MusicBrainz → Cover Art Archive resolver pipeline.
 */

import { IdentificationCandidate } from '../vision/types';

/**
 * Track information from metadata APIs
 */
export interface TrackInfo {
  /** Track title */
  title: string;
  
  /** Track position/number */
  position: number;
  
  /** Side (A, B, etc.) for vinyl releases */
  side?: string;
  
  /** Disc number (for multi-disc releases) */
  discNumber?: number;
  
  /** Duration in seconds */
  durationSeconds?: number;
}

/**
 * Resolved album metadata
 * 
 * This is the final result after resolving candidates through
 * Discogs → MusicBrainz → Cover Art Archive.
 * 
 * IMPORTANT: Final results shown to the user must come from actual
 * album releases, not Wikipedia or "best albums ever" style pages.
 */
export interface ResolvedAlbum {
  /** Canonical artist name */
  artist: string;
  
  /** Canonical album title */
  albumTitle: string;
  
  /** Release year */
  releaseYear?: number;
  
  /** Genre(s) */
  genre?: string;
  
  /** Discogs release ID */
  discogsId?: string;
  
  /** MusicBrainz release ID (MBID) */
  musicbrainzId?: string;
  
  /** HD cover image URL (from Cover Art Archive or Discogs) */
  coverHdUrl?: string;
  
  /** Track list with side/position information */
  tracks: TrackInfo[];
  
  /** Confidence score (0-1) */
  confidence: number;
  
  /** Source candidates that led to this resolution */
  sourceCandidates: IdentificationCandidate[];
  
  /** Additional metadata */
  metadata?: {
    /** Format (Vinyl, CD, etc.) */
    format?: string;
    
    /** Label name */
    label?: string;
    
    /** Catalog number */
    catalogNumber?: string;
    
    /** Country of release */
    country?: string;
  };
}

/**
 * Discogs search result
 */
export interface DiscogsSearchResult {
  /** Discogs release ID */
  id: number;
  
  /** Artist name */
  artist: string;
  
  /** Album title */
  title: string;
  
  /** Release year */
  year?: number;
  
  /** Cover image URL */
  coverImage?: string;
  
  /** Format (Vinyl, CD, etc.) */
  format?: string[];
  
  /** Similarity score (0-1) */
  similarity: number;
}

/**
 * MusicBrainz release result
 */
export interface MusicBrainzRelease {
  /** MusicBrainz release ID (MBID) */
  mbid: string;
  
  /** Artist name */
  artist: string;
  
  /** Release title */
  title: string;
  
  /** Release date */
  date?: string;
  
  /** Release year (extracted from date) */
  year?: number;
  
  /** Country of release */
  country?: string;
}

/**
 * Cover Art Archive image result
 */
export interface CAAImage {
  /** Image URL */
  url: string;
  
  /** Image size (250, 500, 1200, etc.) */
  size?: string;
  
  /** Whether this is the front cover */
  front?: boolean;
}

/**
 * Options for metadata resolution
 */
export interface MetadataResolutionOptions {
  /** Minimum confidence threshold (0-1) */
  minConfidence?: number;
  
  /** Whether to prefer vinyl releases */
  preferVinyl?: boolean;
  
  /** Maximum number of Discogs queries per candidate */
  maxDiscogsQueries?: number;
  
  /** Whether to fetch full tracklist */
  fetchTracks?: boolean;
  
  /** Whether to fetch cover art */
  fetchCoverArt?: boolean;
}

