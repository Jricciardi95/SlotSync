/**
 * Phase 2 Discogs Loop
 * 
 * This is the code that runs in Phase 2 after candidates are generated.
 * It processes each candidate and calls searchDiscogsEnhanced to find
 * Discogs releases.
 * 
 * This code is located in the resolveBestAlbum function in server-hybrid.js
 * around lines 3269-3305.
 * 
 * @param {Array} candidates - Array of candidate objects from Phase 1
 * @param {string} reqId - Request ID for logging
 * @param {Object} debugInfo - Debug info object
 * @param {Buffer} imageBuffer - Image buffer (optional)
 */

const { searchDiscogsEnhanced } = require('./searchDiscogsEnhanced');
const { withTimeout } = require('./withTimeout');

// Constants
const MAX_DISCOGS_SEARCHES = parseInt(process.env.MAX_DISCOGS_SEARCHES || '5');
const DISCOGS_SEARCH_TIMEOUT_MS = parseInt(process.env.DISCOGS_SEARCH_TIMEOUT_MS || '15000', 10);

/**
 * Process candidates and search Discogs for each one
 * 
 * @param {Array} candidates - Array of candidate objects
 * @param {string} reqId - Request ID for logging
 * @param {Object} debugInfo - Debug info object
 * @param {Buffer} imageBuffer - Image buffer (optional)
 * @returns {Promise<Array>} Array of Discogs releases found
 */
async function processCandidatesForDiscogs(candidates, reqId, debugInfo, imageBuffer = null) {
  const allDiscogsReleases = [];
  let discogsSearchCount = 0;
  
  console.log(`[Phase2] 🔍 Processing ${candidates.length} candidates (max ${MAX_DISCOGS_SEARCHES} Discogs searches)...`);
  
  for (let i = 0; i < candidates.length; i++) {
    const candidate = candidates[i];
    
    // If candidate has discogsId, prefer direct fetch over search
    if (candidate.discogsId && discogsSearchCount < MAX_DISCOGS_SEARCHES) {
      console.log(`[Phase2] 📋 [${i + 1}/${candidates.length}] Direct fetch by ID: ${candidate.discogsId}`);
      // ... direct fetch code would go here ...
      continue;
    }
    
    if (!candidate.artist || !candidate.title) continue;
    
    // Check if we've hit the search limit
    if (discogsSearchCount >= MAX_DISCOGS_SEARCHES) {
      console.log(`[Phase2] ⚠️  Reached max Discogs searches (${MAX_DISCOGS_SEARCHES}), skipping remaining candidates`);
      break;
    }

    console.log(`[Phase2] 📋 [${i + 1}/${candidates.length}] Processing: "${candidate.artist}" - "${candidate.title}" (source: ${candidate.source})`);

    // Search Discogs for this candidate (with timeout protection)
    try {
      debugInfo.discogsSearches++;
      discogsSearchCount++;
      console.log(`[Phase2] 🔍 [${i + 1}/${candidates.length}] Searching Discogs... (${discogsSearchCount}/${MAX_DISCOGS_SEARCHES})`);
      const searchStart = Date.now();
      console.log(`[REQ ${reqId}] discogs_search_start artist="${candidate.artist}" title="${candidate.title}"`);
      
      const discogsResult = await withTimeout(
        searchDiscogsEnhanced(candidate.artist, candidate.title, false, imageBuffer),
        DISCOGS_SEARCH_TIMEOUT_MS,
        'discogs_search',
        reqId
      );
      
      const searchTime = Date.now() - searchStart;
      console.log(`[REQ ${reqId}] discogs_search_complete elapsed=${searchTime}ms`);
      
      if (discogsResult.allResults && discogsResult.allResults.length > 0) {
        // Add all results (not just best match) for scoring
        for (const release of discogsResult.allResults) {
          allDiscogsReleases.push({
            discogsId: release.discogsId,
            artist: release.artist,
            title: release.title,
            year: release.year,
            coverImageRemoteUrl: release.coverImageRemoteUrl,
            similarity: release.similarity,
            artistSimilarity: release.artistSimilarity,
            titleSimilarity: release.titleSimilarity,
            source: candidate.source,
          });
        }
      }
    } catch (discogsError) {
      console.warn(`[Phase2] ⚠️  Discogs search failed: ${discogsError.message}`);
    }
  }
  
  return allDiscogsReleases;
}

module.exports = { processCandidatesForDiscogs };

