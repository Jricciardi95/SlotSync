/**
 * MusicBrainz + Cover Art Archive Service
 * 
 * Provides integration with MusicBrainz Web Service API and Cover Art Archive
 * for vinyl record identification and metadata retrieval.
 */

const axios = require('axios');

// MusicBrainz requires a User-Agent header with contact info
const USER_AGENT = process.env.MUSICBRAINZ_USER_AGENT || 'SlotSync/1.0 (contact@slotsync.app)';
const MUSICBRAINZ_BASE_URL = 'https://musicbrainz.org/ws/2';
const COVER_ART_ARCHIVE_BASE_URL = 'https://coverartarchive.org';

/**
 * Search for a release by artist and title
 * 
 * @param {string} artist - Artist name
 * @param {string} title - Release title
 * @returns {Promise<Object|null>} Normalized release object or null
 */
async function searchReleaseByArtistAndTitle(artist, title) {
  if (!artist && !title) {
    return null;
  }

  try {
    // Build query string
    let query = '';
    if (artist && title) {
      query = `artist:"${artist.replace(/"/g, '\\"')}" AND release:"${title.replace(/"/g, '\\"')}"`;
    } else if (artist) {
      query = `artist:"${artist.replace(/"/g, '\\"')}"`;
    } else if (title) {
      query = `release:"${title.replace(/"/g, '\\"')}"`;
    }

    if (!query) {
      return null;
    }

    console.log(`[MusicBrainz] 🔍 Searching: ${query}`);

    const response = await axios.get(`${MUSICBRAINZ_BASE_URL}/release/`, {
      params: {
        query: query,
        fmt: 'json',
        limit: 5, // Get top 5 results
      },
      headers: {
        'User-Agent': USER_AGENT,
      },
      timeout: 5000,
    });

    const releases = response.data?.releases || [];
    if (releases.length === 0) {
      console.log(`[MusicBrainz] ❌ No releases found for: ${query}`);
      return null;
    }

    // Use the first result as the best match
    const release = releases[0];
    
    // Extract artist from artist-credit array
    let displayArtist = null;
    if (release['artist-credit'] && release['artist-credit'].length > 0) {
      displayArtist = release['artist-credit']
        .map(ac => ac.name || ac.artist?.name || '')
        .join('')
        .trim();
    }

    // Extract year from date
    let year = null;
    if (release.date) {
      const yearMatch = release.date.match(/^(\d{4})/);
      if (yearMatch) {
        year = parseInt(yearMatch[1], 10);
      }
    }

    const result = {
      mbid: release.id,
      artist: displayArtist || 'Unknown Artist',
      title: release.title || 'Unknown Release',
      year: year,
      date: release.date || null,
      country: release.country || null,
    };

    console.log(`[MusicBrainz] ✅ Found: "${result.artist}" - "${result.title}" (${result.year || 'no year'})`);
    return result;

  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log(`[MusicBrainz] ❌ Release not found`);
      return null;
    }
    console.error(`[MusicBrainz] ❌ Search error:`, error.message);
    if (error.response) {
      console.error(`[MusicBrainz] Response status: ${error.response.status}`);
    }
    return null;
  }
}

/**
 * Get detailed release information including tracklist
 * 
 * @param {string} mbid - MusicBrainz release ID
 * @returns {Promise<Object|null>} Release details with tracks or null
 */
async function getReleaseDetailsWithTracks(mbid) {
  if (!mbid) {
    return null;
  }

  try {
    console.log(`[MusicBrainz] 📀 Fetching release details: ${mbid}`);

    const response = await axios.get(`${MUSICBRAINZ_BASE_URL}/release/${mbid}`, {
      params: {
        inc: 'recordings',
        fmt: 'json',
      },
      headers: {
        'User-Agent': USER_AGENT,
      },
      timeout: 5000,
    });

    const release = response.data;
    if (!release) {
      console.log(`[MusicBrainz] ❌ No release data returned`);
      return null;
    }

    // Extract artist
    let artist = null;
    if (release['artist-credit'] && release['artist-credit'].length > 0) {
      artist = release['artist-credit']
        .map(ac => ac.name || ac.artist?.name || '')
        .join('')
        .trim();
    }

    // Extract year
    let year = null;
    if (release.date) {
      const yearMatch = release.date.match(/^(\d{4})/);
      if (yearMatch) {
        year = parseInt(yearMatch[1], 10);
      }
    }

    // Build tracks from media
    const tracks = [];
    if (release.media && Array.isArray(release.media)) {
      for (const medium of release.media) {
        const discNumber = medium.position || 1;
        
        if (medium.tracks && Array.isArray(medium.tracks)) {
          for (const track of medium.tracks) {
            const recording = track.recording;
            if (recording && recording.title) {
              tracks.push({
                disc: discNumber,
                trackNumber: track.position || null,
                title: recording.title.trim(),
                lengthMs: recording.length || null,
              });
            }
          }
        }
      }
    }

    console.log(`[MusicBrainz] ✅ Fetched ${tracks.length} tracks for release ${mbid}`);

    return {
      mbid: release.id,
      artist: artist,
      title: release.title || null,
      year: year,
      tracks: tracks,
    };

  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log(`[MusicBrainz] ❌ Release ${mbid} not found`);
      return null;
    }
    console.error(`[MusicBrainz] ❌ Error fetching release details:`, error.message);
    if (error.response) {
      console.error(`[MusicBrainz] Response status: ${error.response.status}`);
    }
    return null;
  }
}

/**
 * Get cover art URL from Cover Art Archive
 * 
 * @param {string} mbid - MusicBrainz release ID
 * @returns {Promise<string|null>} Cover art URL or null
 */
async function getCoverArtUrlForRelease(mbid) {
  if (!mbid) {
    return null;
  }

  try {
    console.log(`[Cover Art Archive] 🖼️  Fetching cover art: ${mbid}`);

    const response = await axios.get(`${COVER_ART_ARCHIVE_BASE_URL}/release/${mbid}`, {
      headers: {
        'User-Agent': USER_AGENT,
      },
      timeout: 5000,
    });

    const data = response.data;
    if (!data || !data.images || !Array.isArray(data.images) || data.images.length === 0) {
      console.log(`[Cover Art Archive] ❌ No images found for release ${mbid}`);
      return null;
    }

    // Find front cover (prefer images with "Front" in types)
    let frontImage = data.images.find(img => 
      img.types && Array.isArray(img.types) && img.types.includes('Front')
    );

    // Fall back to first image if no front cover found
    if (!frontImage) {
      frontImage = data.images[0];
    }

    // Prefer 500px thumbnail, fall back to 250px, 1200px, or full image
    let coverUrl = null;
    if (frontImage.thumbnails) {
      coverUrl = frontImage.thumbnails['500'] || 
                 frontImage.thumbnails['250'] || 
                 frontImage.thumbnails['1200'] ||
                 frontImage.image;
    } else if (frontImage.image) {
      coverUrl = frontImage.image;
    }

    if (coverUrl) {
      console.log(`[Cover Art Archive] ✅ Found cover art: ${coverUrl.substring(0, 80)}...`);
      return coverUrl;
    }

    console.log(`[Cover Art Archive] ❌ No valid image URL found`);
    return null;

  } catch (error) {
    if (error.response && error.response.status === 404) {
      console.log(`[Cover Art Archive] ❌ No cover art found for release ${mbid}`);
      return null;
    }
    console.error(`[Cover Art Archive] ❌ Error fetching cover art:`, error.message);
    if (error.response) {
      console.error(`[Cover Art Archive] Response status: ${error.response.status}`);
    }
    return null;
  }
}

module.exports = {
  searchReleaseByArtistAndTitle,
  getReleaseDetailsWithTracks,
  getCoverArtUrlForRelease,
};

