/**
 * searchDiscogsEnhanced Function
 * 
 * Enhanced Discogs search with fuzzy matching and confidence scoring
 * Returns detailed logging information for debugging
 * 
 * This is the main function called in Phase 2 to search Discogs for album matches.
 * 
 * @param {string} artist - Artist name
 * @param {string} title - Album title
 * @param {boolean} logQueries - Whether to log query details (default: true)
 * @param {Buffer} imageBuffer - Image buffer (optional, not used in this function)
 * @returns {Promise<Object>} Object with bestMatch, alternates, allResults, and searchLog
 */

const axios = require('axios');
const { similarityScore } = require('./services/similarityUtils');
const { generateDiscogsQueries } = require('./generateDiscogsQueries');
const { cleanDiscogsArtistName } = require('./helpers'); // Assuming this helper exists
const { parseDuration } = require('./helpers'); // Assuming this helper exists

const DISCOGS_PERSONAL_ACCESS_TOKEN = process.env.DISCOGS_PERSONAL_ACCESS_TOKEN || process.env.DISCOGS_TOKEN;
const DISCOGS_API_KEY = process.env.DISCOGS_API_KEY || process.env.DISCOGS_CONSUMER_KEY;
const DISCOGS_API_SECRET = process.env.DISCOGS_API_SECRET || process.env.DISCOGS_CONSUMER_SECRET;

async function searchDiscogsEnhanced(artist, title, logQueries = true, imageBuffer = null) {
  if (!DISCOGS_PERSONAL_ACCESS_TOKEN && !DISCOGS_API_KEY) {
    return { 
      bestMatch: null, 
      alternates: [], 
      allResults: [],
      searchLog: []
    };
  }

  const queries = generateDiscogsQueries(artist, title);
  const allResults = [];
  const seenIds = new Set();
  const searchLog = [];

  const headers = {
    'User-Agent': 'SlotSync/1.0.0 (contact@slotsync.app)',
  };

  if (DISCOGS_PERSONAL_ACCESS_TOKEN) {
    headers['Authorization'] = `Discogs token=${DISCOGS_PERSONAL_ACCESS_TOKEN}`;
  }

  console.log(`[Discogs] 🔍 Starting Discogs search...`);
  console.log(`[Discogs] 🔍 Artist: "${artist}"`);
  console.log(`[Discogs] 🔍 Title: "${title}"`);
  console.log(`[Discogs] 🔍 Generated ${queries.length} query variations`);

  // Try all query variations
  for (const { query } of queries) {
    const queryStart = Date.now();
    let queryResult = {
      query,
      success: false,
      resultsCount: 0,
      bestSimilarity: 0,
      error: null,
      duration: 0
    };

    try {
      const params = {
        q: query,
        type: 'release',
        format: 'Vinyl',
        per_page: 10,
      };

      if (!DISCOGS_PERSONAL_ACCESS_TOKEN) {
        params.key = DISCOGS_API_KEY;
        params.secret = DISCOGS_API_SECRET;
      }

      if (logQueries) {
        console.log(`[Discogs]   Query ${searchLog.length + 1}/${queries.length}: "${query}"`);
      }

      const response = await axios.get('https://api.discogs.com/database/search', {
        params,
        headers,
        timeout: 8000,
      });

      const results = response.data.results || [];
      queryResult.resultsCount = results.length;
      queryResult.success = true;
      
      if (logQueries) {
        console.log(`[Discogs]     → Found ${results.length} raw results (will filter by similarity)`);
      }
      
      let filteredCount = 0;
      for (const result of results) {
        if (seenIds.has(result.id)) continue;
        seenIds.add(result.id);

        // Parse Discogs title format: "Artist - Title"
        const parts = result.title.split(' - ');
        let resultArtist = parts[0]?.trim() || '';
        // Clean Discogs disambiguation numbers from artist name (e.g., "Whitney (8)" -> "Whitney")
        resultArtist = cleanDiscogsArtistName(resultArtist);
        const resultTitle = parts.slice(1).join(' - ').trim() || result.title;

        // Calculate similarity scores
        const artistSimilarity = similarityScore(artist, resultArtist);
        const titleSimilarity = similarityScore(title, resultTitle);
        const combinedSimilarity = (artistSimilarity * 0.6) + (titleSimilarity * 0.4);

        if (combinedSimilarity > queryResult.bestSimilarity) {
          queryResult.bestSimilarity = combinedSimilarity;
        }

        // Only include if similarity is reasonable
        // Lowered threshold to 0.25 for better recall (especially for self-titled albums like "Prince" by "Prince")
        if (combinedSimilarity > 0.25) {
          allResults.push({
            discogsId: result.id,
            artist: resultArtist,
            title: resultTitle,
            year: result.year || null,
            coverImageRemoteUrl: result.cover_image || null,
            similarity: combinedSimilarity,
            artistSimilarity,
            titleSimilarity,
            rawTitle: result.title,
            matchedQuery: query
          });
          filteredCount++;

          if (logQueries && combinedSimilarity > 0.7) {
            console.log(`[Discogs]     ✅ Good match: "${resultArtist}" - "${resultTitle}"`);
            console.log(`[Discogs]        Similarity: ${combinedSimilarity.toFixed(3)} (artist: ${artistSimilarity.toFixed(3)}, title: ${titleSimilarity.toFixed(3)})`);
          }
        }
      }
      
      // Log filtering stats
      if (logQueries && results.length > 0) {
        console.log(`[Discogs]     → Filtered: ${filteredCount}/${results.length} results passed similarity threshold (0.25)`);
      }

      // If we got good results, we can stop early
      if (allResults.length >= 5 && allResults[0].similarity > 0.8) {
        if (logQueries) {
          console.log(`[Discogs] Early exit: Found ${allResults.length} good results`);
        }
        break;
      }
    } catch (error) {
      queryResult.error = error.message;
      // Enhanced error logging
      if (error.response) {
        console.error(`[Discogs]   ❌ API Error: ${error.response.status} ${error.response.statusText}`);
        if (error.response.status === 401) {
          console.error(`[Discogs]   ❌ Authentication failed - check DISCOGS_PERSONAL_ACCESS_TOKEN`);
        } else if (error.response.status === 429) {
          console.error(`[Discogs]   ❌ Rate limited - too many requests`);
        } else if (error.response.data) {
          console.error(`[Discogs]   ❌ Response: ${JSON.stringify(error.response.data).substring(0, 200)}`);
        }
      } else if (error.request) {
        console.error(`[Discogs]   ❌ Network error - no response from Discogs API`);
      } else {
        console.error(`[Discogs]   ❌ Error: ${error.message}`);
      }
      if (logQueries) {
        console.log(`[Discogs]   → Query failed: ${error.message}`);
      }
      // Don't throw - continue to next query
    } finally {
      queryResult.duration = Date.now() - queryStart;
      searchLog.push(queryResult);
    }
  }

  console.log(`[Discogs] 📊 Search Summary:`);
  console.log(`[Discogs]   Total results: ${allResults.length}`);
  console.log(`[Discogs]   Queries attempted: ${searchLog.length}`);
  const successfulQueries = searchLog.filter(q => q.success);
  console.log(`[Discogs]   Successful queries: ${successfulQueries.length}`);
  
  // Log detailed error info if all queries failed
  if (successfulQueries.length === 0 && searchLog.length > 0) {
    const firstError = searchLog.find(q => q.error);
    if (firstError) {
      console.error(`[Discogs]   ❌ All queries failed. First error: ${firstError.error}`);
      console.error(`[Discogs]   ❌ This likely indicates: invalid token, network issue, or API problem`);
      console.error(`[Discogs]   ❌ Check DISCOGS_PERSONAL_ACCESS_TOKEN (should NOT be an OpenAI key!)`);
    }
  }
  
  if (allResults.length > 0) {
    console.log(`[Discogs]   🏆 Best similarity: ${allResults[0].similarity.toFixed(3)}`);
    console.log(`[Discogs]   🏆 Best match: "${allResults[0].artist}" - "${allResults[0].title}"`);
  } else {
    console.warn(`[Discogs]   ⚠️  No matches found above similarity threshold (0.25)`);
    // If we had successful queries but no results, log potential issues
    if (successfulQueries.length > 0 && successfulQueries[0].resultsCount === 0) {
      console.warn(`[Discogs]   ⚠️  Discogs API returned 0 results for all queries`);
      console.warn(`[Discogs]   ⚠️  This might indicate: no matching releases, or search query too specific`);
    }
  }

  // Sort by similarity (highest first)
  allResults.sort((a, b) => b.similarity - a.similarity);

  // Get detailed info for best match
  let bestMatch = null;
  if (allResults.length > 0) {
    const topResult = allResults[0];
    try {
      const releaseUrl = `https://api.discogs.com/releases/${topResult.discogsId}`;
      const releaseHeaders = { ...headers };
      
      const releaseResponse = await axios.get(releaseUrl, {
        params: DISCOGS_PERSONAL_ACCESS_TOKEN ? {} : {
          key: DISCOGS_API_KEY,
          secret: DISCOGS_API_SECRET,
        },
        headers: releaseHeaders,
        timeout: 5000,
      });

      const release = releaseResponse.data;
      
      // Extract track listing from Discogs release
      const tracks = [];
      if (release.tracklist && Array.isArray(release.tracklist)) {
        console.log(`[Discogs] 📀 Processing tracklist: ${release.tracklist.length} entries`);
        for (const track of release.tracklist) {
          if (track.title && track.title.trim()) {
            const trackData = {
              title: track.title.trim(),
              trackNumber: track.position ? parseInt(track.position.split(/[-.]/)[0]) || null : null,
              discNumber: track.position && track.position.includes('.') ? parseInt(track.position.split('.')[0]) || null : null,
              side: track.position && track.position.match(/^[A-Z]/) ? track.position.match(/^([A-Z])/)[1] : null,
              durationSeconds: track.duration ? parseDuration(track.duration) : null,
            };
            tracks.push(trackData);
            if (tracks.length <= 5) {
              console.log(`[Discogs]     Track ${tracks.length}: "${trackData.title}" (pos: ${track.position || 'N/A'}, dur: ${track.duration || 'N/A'})`);
            }
          } else {
            console.warn(`[Discogs]     ⚠️  Skipping track entry with no title:`, JSON.stringify(track));
          }
        }
        console.log(`[Discogs] ✅ Extracted ${tracks.length} valid tracks from ${release.tracklist.length} entries`);
      } else {
        console.warn(`[Discogs] ⚠️  No tracklist found in release ${topResult.discogsId}`);
        console.warn(`[Discogs]     release.tracklist type: ${release.tracklist ? typeof release.tracklist : 'undefined'}`);
        if (release.tracklist) {
          console.warn(`[Discogs]     release.tracklist value:`, JSON.stringify(release.tracklist).substring(0, 200));
        }
      }
      
      // Improved confidence scoring:
      // - Base confidence from similarity (0.6-0.9 range)
      // - Boost for high similarity (>0.8)
      // - Boost if artist and title both match well
      let confidence = 0.6 + (topResult.similarity * 0.3); // 0.6-0.9 range
      if (topResult.similarity > 0.8) {
        confidence += 0.05; // Bonus for very high similarity
      }
      if (topResult.artistSimilarity > 0.8 && topResult.titleSimilarity > 0.8) {
        confidence += 0.05; // Bonus for both fields matching well
      }
      confidence = Math.min(0.95, confidence); // Cap at 0.95
      
      // Use artist from release object if available (more accurate), otherwise use parsed title
      // Clean disambiguation numbers from both sources
      const releaseArtist = release.artists?.[0]?.name ? cleanDiscogsArtistName(release.artists[0].name) : null;
      const finalArtist = releaseArtist || topResult.artist; // Prefer release artist, fallback to parsed
      
      bestMatch = {
        artist: finalArtist,
        title: topResult.title,
        year: release.year || topResult.year,
        coverImageRemoteUrl: release.images?.[0]?.uri || topResult.coverImageRemoteUrl,
        discogsId: topResult.discogsId,
        similarity: topResult.similarity,
        confidence: confidence,
        tracks: tracks.length > 0 ? tracks : undefined // Always include tracks if available
      };
      
      console.log(`[Discogs] ✅ Release details fetched:`);
      console.log(`[Discogs]   Year: ${bestMatch.year || 'N/A'}`);
      console.log(`[Discogs]   Tracks: ${tracks.length}`);
      console.log(`[Discogs]   Discogs ID: ${bestMatch.discogsId}`);
      
      if (tracks.length > 0) {
        console.log(`[Discogs] 📀 Track list preview (first 5):`);
        tracks.slice(0, 5).forEach((t, idx) => {
          console.log(`[Discogs]   ${idx + 1}. "${t.title}"${t.trackNumber ? ` (#${t.trackNumber})` : ''}${t.durationSeconds ? ` (${Math.floor(t.durationSeconds / 60)}:${String(t.durationSeconds % 60).padStart(2, '0')})` : ''}`);
        });
        if (tracks.length > 5) {
          console.log(`[Discogs]   ... and ${tracks.length - 5} more tracks`);
        }
      } else {
        console.warn(`[Discogs] ⚠️  No tracks extracted from release ${topResult.discogsId}`);
        if (release.tracklist) {
          console.warn(`[Discogs]   Raw tracklist sample:`, JSON.stringify(release.tracklist.slice(0, 2), null, 2));
        }
      }
    } catch (err) {
      console.warn(`[Discogs] Could not fetch release details for ${topResult.discogsId}:`, err.message);
      // Use basic info if detailed fetch fails
      bestMatch = {
        artist: topResult.artist,
        title: topResult.title,
        year: topResult.year,
        coverImageRemoteUrl: topResult.coverImageRemoteUrl,
        discogsId: topResult.discogsId,
        similarity: topResult.similarity,
        confidence: Math.min(0.9, 0.6 + (topResult.similarity * 0.3))
      };
    }
  }

  // Format alternates (next 4 results)
  // Clean artist names from Discogs disambiguation numbers in alternates
  const alternates = allResults.slice(1, 6).map(r => ({
    artist: cleanDiscogsArtistName(r.artist),
    title: r.title,
    year: r.year,
    coverImageRemoteUrl: r.coverImageRemoteUrl,
    discogsId: r.discogsId,
    similarity: r.similarity
  }));

  return {
    bestMatch,
    alternates,
    allResults: allResults.slice(0, 10), // For debugging
    searchLog // Detailed search attempt log
  };
}

module.exports = { searchDiscogsEnhanced };

