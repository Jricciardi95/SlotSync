/**
 * Unified Metadata Resolver
 * 
 * Resolves complete album metadata using only artist and album title.
 * ALWAYS returns high-quality cover art from APIs - NEVER uses user photos.
 * 
 * Primary source: MusicBrainz (release groups, releases, cover art)
 * Secondary source: Discogs (enrichment, genres, styles)
 */

const axios = require('axios');
const musicbrainzService = require('../musicbrainzService');
const { discogsHttpRequest } = require('../discogsHttpClient');

const MUSICBRAINZ_BASE_URL = 'https://musicbrainz.org/ws/2';
const COVER_ART_ARCHIVE_BASE_URL = 'https://coverartarchive.org';

/**
 * Search MusicBrainz for release group
 */
async function searchReleaseGroup(artist, albumTitle) {
  try {
    const query = `artist:"${artist}" AND releasegroup:"${albumTitle}"`;
    const response = await axios.get(`${MUSICBRAINZ_BASE_URL}/release-group`, {
      params: {
        query: query,
        limit: 5,
        fmt: 'json',
      },
      headers: {
        'User-Agent': 'SlotSync/1.0.0 (contact@slotsync.app)',
      },
      timeout: 5000,
    });

    const releaseGroups = response.data['release-groups'] || [];
    if (releaseGroups.length === 0) {
      return null;
    }

    // Return the best match (first result is usually best)
    const bestMatch = releaseGroups[0];
    console.log(`[UnifiedResolver] ✅ Found release group: ${bestMatch.id} - "${bestMatch.title}"`);
    return bestMatch;
  } catch (error) {
    console.error(`[UnifiedResolver] ❌ Release group search failed:`, error.message);
    return null;
  }
}

/**
 * Fetch releases for a release group
 */
async function fetchReleasesForGroup(releaseGroupId) {
  try {
    const response = await axios.get(`${MUSICBRAINZ_BASE_URL}/release-group/${releaseGroupId}`, {
      params: {
        inc: 'releases',
        fmt: 'json',
      },
      headers: {
        'User-Agent': 'SlotSync/1.0.0 (contact@slotsync.app)',
      },
      timeout: 5000,
    });

    const releases = response.data.releases || [];
    if (releases.length === 0) {
      return null;
    }

    // Sort by date (earliest first) and pick the primary/official release
    const sortedReleases = releases
      .filter(r => r.status === 'Official' || !r.status)
      .sort((a, b) => {
        const dateA = a.date || '';
        const dateB = b.date || '';
        return dateA.localeCompare(dateB);
      });

    const primaryRelease = sortedReleases[0] || releases[0];
    console.log(`[UnifiedResolver] ✅ Selected primary release: ${primaryRelease.id} (${primaryRelease.date || 'no date'})`);
    return primaryRelease;
  } catch (error) {
    console.error(`[UnifiedResolver] ❌ Failed to fetch releases:`, error.message);
    return null;
  }
}

/**
 * Fetch full release details including tracks
 */
async function fetchReleaseDetails(mbid) {
  try {
    const response = await axios.get(`${MUSICBRAINZ_BASE_URL}/release/${mbid}`, {
      params: {
        inc: 'recordings+labels+release-groups',
        fmt: 'json',
      },
      headers: {
        'User-Agent': 'SlotSync/1.0.0 (contact@slotsync.app)',
      },
      timeout: 5000,
    });

    return response.data;
  } catch (error) {
    console.error(`[UnifiedResolver] ❌ Failed to fetch release details:`, error.message);
    return null;
  }
}

/**
 * Fetch high-quality cover art from Cover Art Archive
 * This is MANDATORY - we always use API cover art, never user photos
 */
async function fetchCoverArt(mbid) {
  try {
    // Try release-specific cover art first
    const response = await axios.get(`${COVER_ART_ARCHIVE_BASE_URL}/release/${mbid}/front`, {
      timeout: 5000,
      maxRedirects: 5,
      validateStatus: (status) => status < 400,
    });

    if (response.status === 200 && response.data && response.data.images) {
      // Find the largest available image
      const images = response.data.images.filter(img => img.front === true);
      if (images.length > 0) {
        // Prefer 500px or larger, fallback to largest available
        const largeImage = images.find(img => img.thumbnails && img.thumbnails['500']) 
          || images.find(img => img.thumbnails && img.thumbnails['250'])
          || images[0];
        
        const imageUrl = largeImage.thumbnails?.['500'] 
          || largeImage.thumbnails?.['250']
          || largeImage.image
          || largeImage.thumbnails?.small;
        
        if (imageUrl) {
          console.log(`[UnifiedResolver] ✅ Found CAA cover art: ${imageUrl}`);
          return imageUrl;
        }
      }
    }
  } catch (error) {
    // 404 is expected if no cover art exists
    if (error.response && error.response.status !== 404) {
      console.warn(`[UnifiedResolver] ⚠️  CAA request failed: ${error.message}`);
    }
  }

  // Try release-group cover art as fallback
  try {
    // We'd need the release group ID, but for now return null
    // The caller can try Discogs as fallback
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Search Discogs for additional metadata
 */
async function searchDiscogs(artist, albumTitle) {
  const config = require('../../config');
  const DISCOGS_PERSONAL_ACCESS_TOKEN = config.discogs.personalAccessToken;
  const DISCOGS_API_KEY = config.discogs.apiKey;
  const DISCOGS_API_SECRET = config.discogs.apiSecret;

  if (!DISCOGS_PERSONAL_ACCESS_TOKEN && !DISCOGS_API_KEY) {
    return null;
  }

  try {
    const headers = {
      'User-Agent': 'SlotSync/1.0.0 (contact@slotsync.app)',
    };
    if (DISCOGS_PERSONAL_ACCESS_TOKEN) {
      headers['Authorization'] = `Discogs token=${DISCOGS_PERSONAL_ACCESS_TOKEN}`;
    }

    const params = {
      q: `${artist} ${albumTitle}`,
      type: 'release',
      format: 'Vinyl',
      per_page: 5,
    };

    if (!DISCOGS_PERSONAL_ACCESS_TOKEN) {
      params.key = DISCOGS_API_KEY;
      params.secret = DISCOGS_API_SECRET;
    }

    const responseData = await discogsHttpRequest(
      'https://api.discogs.com/database/search',
      {
        params,
        headers,
      },
      {
        timeoutMs: 5000,
        reqId: 'N/A',
        op: 'search',
        meta: { artist, albumTitle }
      }
    );

    const results = responseData.results || [];
    if (results.length === 0) {
      return null;
    }

    // Return best match
    const bestMatch = results[0];
    console.log(`[UnifiedResolver] ✅ Found Discogs match: ${bestMatch.id}`);
    return bestMatch;
  } catch (error) {
    console.warn(`[UnifiedResolver] ⚠️  Discogs search failed: ${error.message}`);
    return null;
  }
}

/**
 * Fetch full Discogs release details
 */
async function fetchDiscogsRelease(discogsId) {
  const config = require('../../config');
  const DISCOGS_PERSONAL_ACCESS_TOKEN = config.discogs.personalAccessToken;
  const DISCOGS_API_KEY = config.discogs.apiKey;
  const DISCOGS_API_SECRET = config.discogs.apiSecret;

  if (!DISCOGS_PERSONAL_ACCESS_TOKEN && !DISCOGS_API_KEY) {
    return null;
  }

  try {
    const headers = {
      'User-Agent': 'SlotSync/1.0.0 (contact@slotsync.app)',
    };
    if (DISCOGS_PERSONAL_ACCESS_TOKEN) {
      headers['Authorization'] = `Discogs token=${DISCOGS_PERSONAL_ACCESS_TOKEN}`;
    }

    const releaseData = await discogsHttpRequest(
      `https://api.discogs.com/releases/${discogsId}`,
      {
        params: DISCOGS_PERSONAL_ACCESS_TOKEN ? {} : {
          key: DISCOGS_API_KEY,
          secret: DISCOGS_API_SECRET,
        },
        headers,
      },
      {
        timeoutMs: 5000,
        reqId: 'N/A',
        op: 'release_fetch',
        meta: { discogsId }
      }
    );

    return releaseData;
  } catch (error) {
    console.warn(`[UnifiedResolver] ⚠️  Discogs release fetch failed: ${error.message}`);
    return null;
  }
}

/**
 * Parse release date and year
 */
function parseReleaseDate(dateString) {
  if (!dateString) return { year: null, date: null };
  
  // MusicBrainz dates can be: YYYY, YYYY-MM, YYYY-MM-DD
  const parts = dateString.split('-');
  const year = parseInt(parts[0], 10);
  
  return {
    year: isNaN(year) ? null : year,
    date: dateString,
  };
}

/**
 * Parse tracks from MusicBrainz release
 */
function parseTracks(release) {
  const tracks = [];
  
  if (!release.media || !Array.isArray(release.media)) {
    return tracks;
  }

  let trackNumber = 1;
  for (const medium of release.media) {
    const discNumber = medium.position || 1;
    
    if (medium.tracks && Array.isArray(medium.tracks)) {
      for (const track of medium.tracks) {
        if (track.recording && track.recording.title) {
          tracks.push({
            number: trackNumber++,
            title: track.recording.title,
            durationMs: track.recording.length || null,
            discNumber: discNumber > 1 ? discNumber : null,
          });
        }
      }
    }
  }

  return tracks;
}

/**
 * Extract labels and catalog numbers
 */
function extractLabels(release) {
  const labels = [];
  const catalogNumbers = [];

  if (release['label-info'] && Array.isArray(release['label-info'])) {
    for (const labelInfo of release['label-info']) {
      if (labelInfo.label && labelInfo.label.name) {
        labels.push(labelInfo.label.name);
      }
      if (labelInfo['catalog-number']) {
        catalogNumbers.push(labelInfo['catalog-number']);
      }
    }
  }

  return { labels, catalogNumbers };
}

/**
 * Main resolver function
 * Resolves complete metadata using only artist and album title
 * ALWAYS returns HQ cover art from APIs - NEVER uses user photos
 */
async function resolveAlbumMetadata(artist, albumTitle) {
  console.log(`[UnifiedResolver] 🔍 Resolving metadata for "${artist}" - "${albumTitle}"`);

  const result = {
    artist: artist.trim(),
    album: albumTitle.trim(),
    canonicalArtist: artist.trim(),
    canonicalAlbum: albumTitle.trim(),
    mbid: null,
    discogsId: null,
    coverImage: null, // ALWAYS official HQ image, never user photo
    releaseYear: null,
    releaseDate: null,
    tracks: [],
    genres: [],
    styles: [],
    labels: [],
    catalogNumbers: [],
    confidence: 0.0,
  };

  // STEP 1: Search MusicBrainz Release Group
  const releaseGroup = await searchReleaseGroup(artist, albumTitle);
  if (!releaseGroup) {
    console.log(`[UnifiedResolver] ⚠️  No release group found, trying Discogs fallback...`);
    // Fallback to Discogs-only search
    const discogsResult = await searchDiscogs(artist, albumTitle);
    if (discogsResult) {
      result.discogsId = discogsResult.id.toString();
      result.coverImage = discogsResult.cover_image || null;
      result.confidence = 0.6; // Lower confidence without MB data
      
      // Try to fetch full Discogs release
      const discogsRelease = await fetchDiscogsRelease(discogsResult.id);
      if (discogsRelease) {
        result.releaseYear = discogsRelease.year || null;
        result.genres = discogsRelease.genres || [];
        result.styles = discogsRelease.styles || [];
        
        // Extract tracks
        if (discogsRelease.tracklist && Array.isArray(discogsRelease.tracklist)) {
          result.tracks = discogsRelease.tracklist
            .filter(t => t.title && t.title.trim())
            .map((t, idx) => ({
              number: idx + 1,
              title: t.title.trim(),
              durationMs: null,
            }));
        }
      }
    }
    return result;
  }

  // Update canonical names from release group
  if (releaseGroup['artist-credit'] && releaseGroup['artist-credit'].length > 0) {
    result.canonicalArtist = releaseGroup['artist-credit'][0].name || result.artist;
  }
  result.canonicalAlbum = releaseGroup.title || result.album;

  // Extract genres from release group
  if (releaseGroup.tags && Array.isArray(releaseGroup.tags)) {
    result.genres = releaseGroup.tags
      .filter(t => t.count > 0)
      .map(t => t.name);
  }

  // STEP 2: Fetch releases for release group
  const primaryRelease = await fetchReleasesForGroup(releaseGroup.id);
  if (!primaryRelease) {
    console.log(`[UnifiedResolver] ⚠️  No releases found for release group`);
    return result;
  }

  result.mbid = primaryRelease.id;
  const dateInfo = parseReleaseDate(primaryRelease.date);
  result.releaseYear = dateInfo.year;
  result.releaseDate = dateInfo.date;

  // STEP 3: Fetch full release details (tracks, labels)
  const releaseDetails = await fetchReleaseDetails(primaryRelease.id);
  if (releaseDetails) {
    // Extract tracks
    result.tracks = parseTracks(releaseDetails);
    
    // Extract labels and catalog numbers
    const labelInfo = extractLabels(releaseDetails);
    result.labels = labelInfo.labels;
    result.catalogNumbers = labelInfo.catalogNumbers;

    // Look for Discogs relation
    if (releaseDetails.relations && Array.isArray(releaseDetails.relations)) {
      const discogsRelation = releaseDetails.relations.find(
        r => r.type === 'discogs' && r.url && r.url.resource
      );
      if (discogsRelation && discogsRelation.url) {
        // Extract Discogs ID from URL: https://www.discogs.com/release/123456
        const discogsMatch = discogsRelation.url.resource.match(/\/release\/(\d+)/);
        if (discogsMatch) {
          result.discogsId = discogsMatch[1];
        }
      }
    }
  }

  // STEP 4: Fetch HQ Cover Art (MANDATORY - never use user photo)
  const coverArtUrl = await fetchCoverArt(primaryRelease.id);
  if (coverArtUrl) {
    result.coverImage = coverArtUrl;
    console.log(`[UnifiedResolver] ✅ Using CAA cover art: ${coverArtUrl}`);
  } else {
    // Fallback to Discogs cover art if available
    if (result.discogsId) {
      const discogsRelease = await fetchDiscogsRelease(result.discogsId);
      if (discogsRelease && discogsRelease.images && discogsRelease.images.length > 0) {
        result.coverImage = discogsRelease.images[0].uri || discogsRelease.images[0].resource_url;
        console.log(`[UnifiedResolver] ✅ Using Discogs cover art: ${result.coverImage}`);
      }
    }
    
    // If still no cover art, try Discogs search
    if (!result.coverImage) {
      const discogsResult = await searchDiscogs(artist, albumTitle);
      if (discogsResult && discogsResult.cover_image) {
        result.coverImage = discogsResult.cover_image;
        if (!result.discogsId) {
          result.discogsId = discogsResult.id.toString();
        }
        console.log(`[UnifiedResolver] ✅ Using Discogs search cover art: ${result.coverImage}`);
      }
    }
  }

  // STEP 5: Enrich with Discogs metadata if we have a Discogs ID
  if (result.discogsId && !result.genres.length) {
    const discogsRelease = await fetchDiscogsRelease(result.discogsId);
    if (discogsRelease) {
      result.genres = discogsRelease.genres || result.genres;
      result.styles = discogsRelease.styles || result.styles;
      
      // Use Discogs year if MusicBrainz doesn't have one
      if (!result.releaseYear && discogsRelease.year) {
        result.releaseYear = discogsRelease.year;
      }
    }
  }

  result.confidence = 0.9; // High confidence with MusicBrainz data

  console.log(`[UnifiedResolver] ✅ Resolution complete:`, {
    artist: result.canonicalArtist,
    album: result.canonicalAlbum,
    year: result.releaseYear,
    tracks: result.tracks.length,
    coverImage: result.coverImage ? '✅' : '❌',
    mbid: result.mbid,
    discogsId: result.discogsId,
  });

  return result;
}

module.exports = {
  resolveAlbumMetadata,
};

