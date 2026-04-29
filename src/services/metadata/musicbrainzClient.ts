/**
 * MusicBrainz Client
 * 
 * Client for searching MusicBrainz API via backend proxy.
 * 
 * Note: Direct MusicBrainz API calls happen on the backend.
 * This client structures requests and parses responses.
 */

import { getApiUrl } from '../../config/api';
import { logger } from '../../utils/logger';
import { apiFetch } from '../../config/apiFetch';
import { MusicBrainzRelease } from './types';

/**
 * Searches MusicBrainz for a release by artist and title
 * 
 * @param artist - Artist name
 * @param title - Release title
 * @returns MusicBrainz release or null
 */
export async function searchMusicBrainzRelease(
  artist: string,
  title: string
): Promise<MusicBrainzRelease | null> {
  if (!artist || !title) {
    return null;
  }

  try {
    logger.debug(`[MusicBrainzClient] Searching for "${artist}" - "${title}"`);
    
    const apiUrl = getApiUrl('/api/metadata/musicbrainz/search');
    const response = await apiFetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        artist: artist.trim(),
        title: title.trim(),
      }),
    });

    if (!response.ok) {
      logger.warn(`[MusicBrainzClient] Search failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    if (!data.release) {
      logger.debug(`[MusicBrainzClient] No release found`);
      return null;
    }

    const release = data.release;
    logger.debug(`[MusicBrainzClient] ✅ Found release: ${release.mbid} - "${release.title}"`);

    return {
      mbid: release.mbid,
      artist: release.artist,
      title: release.title,
      date: release.date,
      year: release.year,
      country: release.country,
    };
  } catch (error) {
    logger.error(`[MusicBrainzClient] Error searching MusicBrainz:`, error);
    return null;
  }
}

/**
 * Fetches full MusicBrainz release details including tracks
 * 
 * @param mbid - MusicBrainz release ID (MBID)
 * @returns Release details with tracks or null
 */
export async function getMusicBrainzReleaseDetails(mbid: string): Promise<{
  mbid: string;
  artist: string;
  title: string;
  year?: number;
  tracks: Array<{
    title: string;
    position: number;
    discNumber?: number;
    durationMs?: number;
  }>;
} | null> {
  if (!mbid) {
    return null;
  }

  try {
    logger.debug(`[MusicBrainzClient] Fetching release details: ${mbid}`);
    
    const apiUrl = getApiUrl(`/api/metadata/musicbrainz/release/${mbid}`);
    const response = await apiFetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      logger.warn(`[MusicBrainzClient] Failed to fetch release ${mbid}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    logger.error(`[MusicBrainzClient] Error fetching release details:`, error);
    return null;
  }
}

/**
 * Finds MusicBrainz release ID from Discogs ID
 * 
 * Uses MusicBrainz relations to find the MBID for a Discogs release.
 * 
 * @param discogsId - Discogs release ID
 * @returns MusicBrainz release ID (MBID) or null
 */
export async function findMusicBrainzIdFromDiscogs(discogsId: number): Promise<string | null> {
  try {
    const apiUrl = getApiUrl(`/api/metadata/musicbrainz/from-discogs/${discogsId}`);
    const response = await apiFetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return data.mbid || null;
  } catch (error) {
    logger.error(`[MusicBrainzClient] Error finding MBID from Discogs:`, error);
    return null;
  }
}

