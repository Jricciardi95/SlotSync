/**
 * Discogs Client
 * 
 * Client for searching Discogs API via backend proxy.
 * 
 * Note: Direct Discogs API calls happen on the backend.
 * This client structures requests and parses responses.
 */

import { getApiUrl } from '../../config/api';
import { DiscogsSearchResult } from './types';
import { IdentificationCandidate } from '../vision/types';

/**
 * Generates multiple Discogs search query variants for a candidate
 * 
 * Variants include:
 * - "Artist Album"
 * - artist:"Artist" title:"Album"
 * - Cleaned versions (remove parentheses, remaster markers, etc.)
 * - Catalog number search if available
 * 
 * @param candidate - Identification candidate
 * @returns Array of search query strings
 */
export function generateDiscogsQueries(candidate: IdentificationCandidate): string[] {
  const queries: string[] = [];
  
  if (!candidate.artist || !candidate.album) {
    return queries;
  }

  const artist = candidate.artist.trim();
  const album = candidate.album.trim();

  // Base query: "Artist Album"
  queries.push(`${artist} ${album}`);

  // Quoted query: artist:"Artist" title:"Album"
  queries.push(`artist:"${artist}" title:"${album}"`);

  // Cleaned versions
  // Remove parenthetical suffixes like "(Remastered)", "(Deluxe Edition)", etc.
  const cleanAlbum = album
    .replace(/\s*\([^)]*remaster[^)]*\)/gi, '')
    .replace(/\s*\([^)]*deluxe[^)]*\)/gi, '')
    .replace(/\s*\([^)]*edition[^)]*\)/gi, '')
    .replace(/\s*\([^)]*version[^)]*\)/gi, '')
    .trim();

  if (cleanAlbum !== album) {
    queries.push(`${artist} ${cleanAlbum}`);
    queries.push(`artist:"${artist}" title:"${cleanAlbum}"`);
  }

  // Remove "The" prefix from artist
  const artistNoThe = artist.replace(/^the\s+/i, '').trim();
  if (artistNoThe !== artist) {
    queries.push(`${artistNoThe} ${album}`);
    if (cleanAlbum !== album) {
      queries.push(`${artistNoThe} ${cleanAlbum}`);
    }
  }

  // Remove trailing punctuation from album
  const albumNoPunct = album.replace(/[!?.]+$/g, '').trim();
  if (albumNoPunct !== album) {
    queries.push(`${artist} ${albumNoPunct}`);
  }

  // Handle possessives: "B-52's" -> "B-52s"
  const artistNoApos = artist.replace(/'s\b/g, 's').replace(/'/g, '');
  if (artistNoApos !== artist) {
    queries.push(`${artistNoApos} ${album}`);
  }

  // Remove "feat.", "&", "and" from artist
  const cleanArtist = artist
    .replace(/\s+(feat\.|featuring|&|and)\s+.*$/i, '')
    .trim();
  if (cleanArtist !== artist) {
    queries.push(`${cleanArtist} ${album}`);
  }

  // Remove duplicates
  return [...new Set(queries)];
}

/**
 * Checks if a Discogs result looks like an actual album release
 * 
 * Filters out:
 * - Lists
 * - Generic pages
 * - Articles
 * - Non-vinyl releases (if preferVinyl is true)
 * 
 * @param result - Discogs search result
 * @param preferVinyl - Whether to prefer vinyl releases
 * @returns True if result looks like a valid album release
 */
export function isValidDiscogsRelease(
  result: any,
  preferVinyl: boolean = true
): boolean {
  if (!result || !result.title || !result.artist) {
    return false;
  }

  const title = (result.title || '').toLowerCase();
  const artist = (result.artist || '').toLowerCase();
  const combined = `${artist} ${title}`;

  // Reject non-album patterns
  const badPatterns = [
    'best album',
    'top ',
    'the 10 best',
    'the 20 best',
    'album covers',
    'list of',
    'review',
    'reviews',
    'wikipedia',
    'wiki/',
  ];

  if (badPatterns.some(pattern => combined.includes(pattern))) {
    return false;
  }

  // Prefer vinyl releases
  if (preferVinyl) {
    const formats = result.format || [];
    const hasVinyl = formats.some((f: string) => 
      f.toLowerCase().includes('vinyl') || 
      f.toLowerCase().includes('lp') ||
      f.toLowerCase().includes('12"')
    );
    
    // If we have format info and no vinyl, lower priority (but don't reject completely)
    if (formats.length > 0 && !hasVinyl) {
      return false; // Reject non-vinyl if we have format info
    }
  }

  return true;
}

/**
 * Searches Discogs for a candidate
 * 
 * Makes multiple queries per candidate and stops early if a
 * high-confidence match is found.
 * 
 * @param candidate - Identification candidate
 * @param options - Search options
 * @returns Best Discogs match or null
 */
export async function searchDiscogs(
  candidate: IdentificationCandidate,
  options: {
    preferVinyl?: boolean;
    maxQueries?: number;
    minSimilarity?: number;
  } = {}
): Promise<DiscogsSearchResult | null> {
  const {
    preferVinyl = true,
    maxQueries = 5,
    minSimilarity = 0.6,
  } = options;

  if (!candidate.artist || !candidate.album) {
    return null;
  }

  const queries = generateDiscogsQueries(candidate);
  const queriesToTry = queries.slice(0, maxQueries);

  console.log(`[DiscogsClient] Searching for "${candidate.artist}" - "${candidate.album}"`);
  console.log(`[DiscogsClient] Trying ${queriesToTry.length} query variants`);

  // Call backend endpoint that proxies to Discogs
  // The backend handles the actual Discogs API calls
  try {
    const apiUrl = getApiUrl('/api/metadata/discogs/search');
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        artist: candidate.artist,
        album: candidate.album,
        queries: queriesToTry,
        preferVinyl,
      }),
    });

    if (!response.ok) {
      console.warn(`[DiscogsClient] Search failed: ${response.status}`);
      return null;
    }

    const data = await response.json();
    
    if (!data.results || data.results.length === 0) {
      console.log(`[DiscogsClient] No results found`);
      return null;
    }

    // Filter and find best match
    const validResults = data.results
      .filter((r: any) => isValidDiscogsRelease(r, preferVinyl))
      .filter((r: any) => (r.similarity || 0) >= minSimilarity)
      .sort((a: any, b: any) => (b.similarity || 0) - (a.similarity || 0));

    if (validResults.length === 0) {
      console.log(`[DiscogsClient] No valid results after filtering`);
      return null;
    }

    const bestMatch = validResults[0];
    console.log(`[DiscogsClient] ✅ Found match: "${bestMatch.artist}" - "${bestMatch.title}" (similarity: ${bestMatch.similarity?.toFixed(3)})`);

    return {
      id: bestMatch.id,
      artist: bestMatch.artist,
      title: bestMatch.title,
      year: bestMatch.year,
      coverImage: bestMatch.cover_image || bestMatch.coverImage,
      format: bestMatch.format,
      similarity: bestMatch.similarity || 0.5,
    };
  } catch (error) {
    console.error(`[DiscogsClient] Error searching Discogs:`, error);
    return null;
  }
}

/**
 * Fetches full Discogs release details including tracklist
 * 
 * @param discogsId - Discogs release ID
 * @returns Release details with tracks or null
 */
export async function getDiscogsRelease(discogsId: number): Promise<{
  artist: string;
  title: string;
  year?: number;
  coverImage?: string;
  tracks: Array<{
    title: string;
    position: string;
    duration?: string;
  }>;
  format?: string[];
  genre?: string[];
  style?: string[];
  label?: string;
  catalogNumber?: string;
} | null> {
  try {
    const apiUrl = getApiUrl(`/api/discogs/release/${discogsId}`);
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.warn(`[DiscogsClient] Failed to fetch release ${discogsId}: ${response.status}`);
      return null;
    }

    const data = await response.json();
    return data;
  } catch (error) {
    console.error(`[DiscogsClient] Error fetching release:`, error);
    return null;
  }
}

