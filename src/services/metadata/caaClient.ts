/**
 * Cover Art Archive Client
 * 
 * Client for fetching HD cover art from Cover Art Archive via backend proxy.
 * 
 * Note: Direct CAA API calls happen on the backend.
 * This client structures requests and parses responses.
 */

import { getApiUrl } from '../../config/api';
import { CAAImage } from './types';

/**
 * Fetches HD cover art from Cover Art Archive
 * 
 * Uses MusicBrainz release ID (MBID) to fetch cover art.
 * Prefers larger sizes (1200px, 500px) over smaller thumbnails.
 * 
 * @param mbid - MusicBrainz release ID (MBID)
 * @param preferredSize - Preferred image size ('1200', '500', '250', or 'small')
 * @returns Cover art URL or null
 */
export async function getCoverArtFromCAA(
  mbid: string,
  preferredSize: '1200' | '500' | '250' | 'small' = '500'
): Promise<string | null> {
  if (!mbid) {
    return null;
  }

  try {
    console.log(`[CAAClient] Fetching cover art for MBID: ${mbid}`);
    
    const apiUrl = getApiUrl(`/api/metadata/caa/release/${mbid}`);
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[CAAClient] No cover art found for release ${mbid}`);
      } else {
        console.warn(`[CAAClient] Failed to fetch cover art: ${response.status}`);
      }
      return null;
    }

    const data = await response.json();
    
    if (!data.images || data.images.length === 0) {
      console.log(`[CAAClient] No images found`);
      return null;
    }

    // Find front cover
    let frontImage = data.images.find((img: CAAImage) => img.front === true);
    if (!frontImage) {
      // Fall back to first image
      frontImage = data.images[0];
    }

    // Get URL with preferred size
    // CAA provides thumbnails in different sizes
    let coverUrl: string | null = null;

    // Try to get preferred size, fall back to smaller sizes
    const sizeOrder = [preferredSize, '1200', '500', '250', 'small'];
    for (const size of sizeOrder) {
      if (frontImage.thumbnails && frontImage.thumbnails[size]) {
        coverUrl = frontImage.thumbnails[size];
        break;
      }
    }

    // Fall back to full image URL
    if (!coverUrl && frontImage.image) {
      coverUrl = frontImage.image;
    }

    if (coverUrl) {
      console.log(`[CAAClient] ✅ Found cover art: ${coverUrl.substring(0, 80)}...`);
      return coverUrl;
    }

    console.log(`[CAAClient] No valid image URL found`);
    return null;
  } catch (error) {
    console.error(`[CAAClient] Error fetching cover art:`, error);
    return null;
  }
}

/**
 * Fetches all available cover art images for a release
 * 
 * @param mbid - MusicBrainz release ID (MBID)
 * @returns Array of cover art images
 */
export async function getAllCoverArt(mbid: string): Promise<CAAImage[]> {
  if (!mbid) {
    return [];
  }

  try {
    const apiUrl = getApiUrl(`/api/metadata/caa/release/${mbid}`);
    const response = await fetch(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return [];
    }

    const data = await response.json();
    return data.images || [];
  } catch (error) {
    console.error(`[CAAClient] Error fetching all cover art:`, error);
    return [];
  }
}

