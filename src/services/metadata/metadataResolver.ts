/**
 * Metadata Resolver
 * 
 * DEV-ONLY: This module is for development and testing purposes only.
 * 
 * ⚠️  PRODUCTION NOTE: The backend is the single source of truth for identification.
 * All metadata resolution (Discogs → MusicBrainz → CAA) happens server-side
 * in /api/identify-record.
 * 
 * This frontend resolver is available for:
 * - DevTestScreen testing and debugging
 * - Development/testing scenarios
 * - Future offline mode (if implemented)
 * 
 * DO NOT use this in production user-facing flows.
 * Always use the backend /api/identify-record endpoint.
 * 
 * Resolves identification candidates to real vinyl albums using:
 * Discogs → MusicBrainz → Cover Art Archive
 */

import { IdentificationCandidate } from '../vision/types';
import {
  ResolvedAlbum,
  TrackInfo,
  MetadataResolutionOptions,
} from './types';
import { searchDiscogs, getDiscogsRelease, isValidDiscogsRelease, generateDiscogsQueries } from './discogsClient';
import { searchMusicBrainzRelease, getMusicBrainzReleaseDetails, findMusicBrainzIdFromDiscogs } from './musicbrainzClient';
import { getCoverArtFromCAA } from './caaClient';
import { debugIdentification } from '../../utils/debug';
import { logger } from '../../utils/logger';

/**
 * Parses Discogs track position to extract side and track number
 * 
 * Discogs positions can be:
 * - "A1", "A2", "B1", "B2" (side + track)
 * - "1", "2", "3" (track number only)
 * - "1-1", "1-2" (disc-track)
 * 
 * @param position - Discogs track position string
 * @returns Object with side and track number
 */
function parseDiscogsPosition(position: string): { side?: string; trackNumber: number } {
  if (!position) {
    return { trackNumber: 0 };
  }

  // Match side + track: "A1", "B2", etc.
  const sideMatch = position.match(/^([A-Z])(\d+)$/i);
  if (sideMatch) {
    return {
      side: sideMatch[1].toUpperCase(),
      trackNumber: parseInt(sideMatch[2], 10),
    };
  }

  // Match disc-track: "1-1", "1-2"
  const discTrackMatch = position.match(/^(\d+)-(\d+)$/);
  if (discTrackMatch) {
    return {
      trackNumber: parseInt(discTrackMatch[2], 10),
      // Could extract disc number here if needed
    };
  }

  // Match track number only: "1", "2", "3"
  const trackMatch = position.match(/^(\d+)$/);
  if (trackMatch) {
    return {
      trackNumber: parseInt(trackMatch[1], 10),
    };
  }

  return { trackNumber: 0 };
}

/**
 * Parses duration string to seconds
 * 
 * @param duration - Duration string (e.g., "3:45", "3:45:12")
 * @returns Duration in seconds or null
 */
function parseDuration(duration: string | undefined): number | null {
  if (!duration) {
    return null;
  }

  const parts = duration.split(':').map(p => parseInt(p, 10));
  if (parts.length === 2) {
    // MM:SS
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    // HH:MM:SS
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }

  return null;
}

/**
 * Converts Discogs tracks to TrackInfo format
 * 
 * @param discogsTracks - Discogs track list
 * @returns Array of TrackInfo
 */
function convertDiscogsTracks(discogsTracks: Array<{
  title: string;
  position: string;
  duration?: string;
}>): TrackInfo[] {
  return discogsTracks
    .filter(t => t.title && t.title.trim())
    .map((t, index) => {
      const position = parseDiscogsPosition(t.position);
      const duration = parseDuration(t.duration);
      return {
        title: t.title.trim(),
        position: position.trackNumber || index + 1,
        side: position.side,
        durationSeconds: duration !== null ? duration : undefined,
      };
    });
}

/**
 * Converts MusicBrainz tracks to TrackInfo format
 * 
 * @param mbTracks - MusicBrainz track list
 * @returns Array of TrackInfo
 */
function convertMusicBrainzTracks(mbTracks: Array<{
  title: string;
  position: number;
  discNumber?: number;
  durationMs?: number;
}>): TrackInfo[] {
  return mbTracks.map(t => ({
    title: t.title.trim(),
    position: t.position,
    discNumber: t.discNumber,
    durationSeconds: t.durationMs ? Math.floor(t.durationMs / 1000) : undefined,
  }));
}

/**
 * Resolves album metadata from identification candidates
 * 
 * Pipeline:
 * 1. For each candidate, search Discogs with multiple query variants
 * 2. Stop early if high-confidence match found
 * 3. If Discogs match found, look up MusicBrainz release
 * 4. Fetch HD cover art from Cover Art Archive using MBID
 * 5. Return ResolvedAlbum with complete metadata
 * 
 * @param candidates - Identification candidates from Vision stage
 * @param options - Resolution options
 * @returns Resolved album or null if no match found
 */
export async function resolveAlbumFromCandidates(
  candidates: IdentificationCandidate[],
  options: MetadataResolutionOptions = {}
): Promise<ResolvedAlbum | null> {
  // Debug: Log query generation for top candidates
  if (candidates.length > 0) {
    const topCandidate = candidates[0];
    const queries = generateDiscogsQueries(topCandidate);
    debugIdentification.discogsQueries(queries);
  }
  const {
    minConfidence = 0.6,
    preferVinyl = true,
    maxDiscogsQueries = 5,
    fetchTracks = true,
    fetchCoverArt = true,
  } = options;

  if (!candidates || candidates.length === 0) {
    logger.debug('[MetadataResolver] No candidates provided');
    return null;
  }

  logger.debug(`[MetadataResolver] Resolving ${candidates.length} candidates...`);

  // Try each candidate in order (sorted by confidence)
  const sortedCandidates = [...candidates].sort((a, b) => b.confidence - a.confidence);

  for (const candidate of sortedCandidates) {
    if (!candidate.artist || !candidate.album) {
      continue;
    }

    logger.debug(`[MetadataResolver] Trying candidate: "${candidate.artist}" - "${candidate.album}" (confidence: ${candidate.confidence.toFixed(3)})`);

    // STEP 1: Search Discogs
    const discogsResult = await searchDiscogs(candidate, {
      preferVinyl,
      maxQueries: maxDiscogsQueries,
      minSimilarity: minConfidence,
    });

    if (!discogsResult) {
      logger.debug(`[MetadataResolver] No Discogs match for candidate`);
      continue;
    }

    // Debug: Log Discogs match
    debugIdentification.discogsMatches([discogsResult]);

    // Validate Discogs result
    if (!isValidDiscogsRelease(discogsResult, preferVinyl)) {
      logger.debug(`[MetadataResolver] Discogs result failed validation`);
      continue;
    }

    logger.debug(`[MetadataResolver] ✅ Discogs match found: "${discogsResult.artist}" - "${discogsResult.title}"`);

    // STEP 2: Fetch full Discogs release details (for tracks, genre, etc.)
    let discogsRelease = null;
    if (fetchTracks || !discogsResult.coverImage) {
      discogsRelease = await getDiscogsRelease(discogsResult.id);
    }

    // STEP 3: Look up MusicBrainz release
    let mbRelease = null;
    let mbDetails = null;
    
    // Try to find MBID from Discogs relation first
    let mbid: string | null = null;
    if (discogsResult.id) {
      mbid = await findMusicBrainzIdFromDiscogs(discogsResult.id);
    }

    // If no relation found, search MusicBrainz directly
    if (!mbid) {
      mbRelease = await searchMusicBrainzRelease(
        discogsResult.artist,
        discogsResult.title
      );
      if (mbRelease) {
        mbid = mbRelease.mbid;
      }
    } else {
      // We have MBID, fetch release details
      mbDetails = await getMusicBrainzReleaseDetails(mbid);
      if (mbDetails) {
        mbRelease = {
          mbid: mbDetails.mbid,
          artist: mbDetails.artist,
          title: mbDetails.title,
          year: mbDetails.year,
        };
      }
    }

    // If we have MBID but no details yet, fetch them
    if (mbid && !mbDetails && fetchTracks) {
      mbDetails = await getMusicBrainzReleaseDetails(mbid);
    }

    // STEP 4: Fetch HD cover art from Cover Art Archive
    let coverHdUrl: string | undefined = undefined;
    if (fetchCoverArt) {
      if (mbid) {
        // Prefer CAA cover art (highest quality)
        coverHdUrl = await getCoverArtFromCAA(mbid, '500') || undefined;
      }

      // Fallback to Discogs cover art
      if (!coverHdUrl) {
        if (discogsRelease?.coverImage) {
          coverHdUrl = discogsRelease.coverImage;
        } else if (discogsResult.coverImage) {
          coverHdUrl = discogsResult.coverImage;
        }
      }
    }

    // STEP 5: Build tracks list
    let tracks: TrackInfo[] = [];
    if (fetchTracks) {
      // Prefer MusicBrainz tracks (more structured)
      if (mbDetails?.tracks && mbDetails.tracks.length > 0) {
        tracks = convertMusicBrainzTracks(mbDetails.tracks);
        logger.debug(`[MetadataResolver] Using ${tracks.length} tracks from MusicBrainz`);
      } else if (discogsRelease?.tracks && discogsRelease.tracks.length > 0) {
        tracks = convertDiscogsTracks(discogsRelease.tracks);
        logger.debug(`[MetadataResolver] Using ${tracks.length} tracks from Discogs`);
      }
    }

    // STEP 6: Determine final year
    const year = mbRelease?.year || 
                 mbDetails?.year || 
                 discogsRelease?.year || 
                 discogsResult.year;

    // STEP 7: Determine genre
    const genre = discogsRelease?.genre?.[0] || 
                  discogsRelease?.style?.[0] || 
                  undefined;

    // STEP 8: Build resolved album
    const resolved: ResolvedAlbum = {
      artist: mbRelease?.artist || discogsResult.artist,
      albumTitle: mbRelease?.title || discogsResult.title,
      releaseYear: year,
      genre,
      discogsId: discogsResult.id.toString(),
      musicbrainzId: mbid || undefined,
      coverHdUrl,
      tracks,
      confidence: discogsResult.similarity * candidate.confidence, // Combined confidence
      sourceCandidates: [candidate],
      metadata: {
        format: discogsResult.format?.[0],
        label: discogsRelease?.label,
        catalogNumber: discogsRelease?.catalogNumber,
        country: mbRelease?.country,
      },
    };

    logger.debug(`[MetadataResolver] ✅ Resolution complete:`, {
      artist: resolved.artist,
      album: resolved.albumTitle,
      year: resolved.releaseYear,
      tracks: resolved.tracks.length,
      coverArt: resolved.coverHdUrl ? '✅' : '❌',
      confidence: resolved.confidence.toFixed(3),
    });

    return resolved;
  }

  logger.debug(`[MetadataResolver] ❌ No valid resolution found for any candidate`);
  return null;
}

