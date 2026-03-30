/**
 * Discogs Scoring Module
 * 
 * Explicit per-release scoring system for Discogs results.
 * 
 * Scores each release using multiple features:
 * - artist_similarity
 * - title_similarity
 * - barcode_match
 * - catalog_number_match
 * - vision_entity_overlap
 * - embedding_similarity
 * 
 * Returns scored and sorted results with dual thresholds:
 * - AUTO_ACCEPT_THRESHOLD (default: 0.8)
 * - SUGGESTIONS_THRESHOLD (default: 0.5)
 */

// Import similarity functions from utility module (avoids circular dependency)
const { similarityScore, normalizeForSearch } = require('./similarityUtils');

// Configuration
const config = require('../config');
const AUTO_ACCEPT_THRESHOLD = config.scoring.autoAcceptThreshold;
const SUGGESTIONS_THRESHOLD = config.scoring.suggestionsThreshold;

/**
 * Normalize artist name for grouping (remove "The", lowercase, trim)
 * 
 * @param {string} artist - Artist name
 * @returns {string} Normalized artist name
 */
function normalizeArtist(artist) {
  if (!artist) return '';
  let normalized = artist.toLowerCase().trim();
  // Remove leading "the"
  if (normalized.startsWith('the ')) {
    normalized = normalized.substring(4);
  }
  return normalized;
}

/**
 * Normalize album title for grouping (remove common suffixes, lowercase, trim)
 * 
 * @param {string} title - Album title
 * @returns {string} Normalized album title
 */
function normalizeAlbumTitle(title) {
  if (!title) return '';
  let normalized = title.toLowerCase().trim();
  
  // Remove common suffixes in parentheses (more aggressive)
  const editionPatterns = [
    /\s*\(remastered?\)/gi,
    /\s*\(deluxe\s+edition\)/gi,
    /\s*\(expanded\s+edition\)/gi,
    /\s*\(reissue\)/gi,
    /\s*\(re-issue\)/gi,
    /\s*\(remaster\)/gi,
    /\s*\(anniversary\s+edition\)/gi,
    /\s*\(mono\)/gi,
    /\s*\(stereo\)/gi,
    /\s*\(mono\/stereo\)/gi,
    /\s*\(digitally\s+remastered\)/gi,
    /\s*\(remastered\s+\d{4}\)/gi,
    /\s*\(special\s+edition\)/gi,
    /\s*\(limited\s+edition\)/gi,
    /\s*\(collector'?s?\s+edition\)/gi,
    /\s*\(bonus\s+track[s]?\)/gi,
    /\s*\(bonus\s+disc\)/gi,
    /\s*\(2\s*cd\)/gi,
    /\s*\(2\s*lp\)/gi,
    /\s*\(vinyl\)/gi,
    /\s*\(cd\)/gi,
  ];
  
  for (const pattern of editionPatterns) {
    normalized = normalized.replace(pattern, '');
  }
  
  // Remove year suffixes like "(1977)" but keep them for matching
  // We'll handle this separately in scoring
  
  return normalized.trim();
}

/**
 * Get canonical album key for grouping variants
 * 
 * @param {string} artist - Artist name
 * @param {string} title - Album title
 * @returns {string} Canonical key
 */
function getCanonicalAlbumKey(artist, title) {
  return `${normalizeArtist(artist)}::${normalizeAlbumTitle(title)}`;
}

/**
 * Group Discogs releases by canonical album key
 * 
 * @param {Array} releases - Array of release objects
 * @returns {Map<string, Array>} Map of canonical key -> releases
 */
function groupReleasesByCanonicalKey(releases) {
  const groups = new Map();
  
  for (const release of releases) {
    const key = getCanonicalAlbumKey(release.artist, release.title);
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(release);
  }
  
  return groups;
}

/**
 * Score a single Discogs release
 * 
 * @param {Object} release - Discogs release object
 * @param {Object} visionSignals - Vision extraction signals {ocrArtist, ocrTitle, webEntities}
 * @param {Object} ocrParsed - Parsed OCR result {artist, album, confidence}
 * @param {Object} embeddingSignals - Embedding similarity signals {recordId, similarity}
 * @param {string} extractedBarcode - Extracted barcode (if any)
 * @returns {number} Score (0-1)
 */
function scoreDiscogsRelease(release, visionSignals = {}, ocrParsed = {}, embeddingSignals = {}, extractedBarcode = null) {
  let score = 0;
  
  // Check if embeddings are available
  const hasEmbeddings = embeddingSignals && (
    (Array.isArray(embeddingSignals) && embeddingSignals.length > 0) ||
    (!Array.isArray(embeddingSignals) && (embeddingSignals.recordId || embeddingSignals.discogsId))
  );
  
  // DYNAMIC WEIGHTS: Adjust based on OCR confidence AND embedding availability
  // If embeddings are missing, reweight to rely on Discogs text similarity + Vision + OCR
  const ocrConfidence = ocrParsed.confidence || 0;
  let weights;
  
  if (hasEmbeddings) {
    // Embeddings available: Use standard weights
    if (ocrConfidence >= 0.8) {
      // Strong OCR: Trust OCR primarily, embeddings as verifier
      weights = {
        artistSimilarity: 0.30,
        titleSimilarity: 0.20,
        discogsSearchSimilarity: 0.25, // NEW: Discogs search similarity (strong signal)
        embeddingSimilarity: 0.15, // Verifier
        barcodeMatch: 0.05,
        catalogNumberMatch: 0.03,
        visionEntityOverlap: 0.02,
      };
    } else if (ocrConfidence >= 0.5) {
      // Moderate OCR: Balanced approach
      weights = {
        artistSimilarity: 0.25,
        titleSimilarity: 0.15,
        discogsSearchSimilarity: 0.30, // NEW: Discogs search similarity (strong signal)
        embeddingSimilarity: 0.20,
        barcodeMatch: 0.05,
        catalogNumberMatch: 0.03,
        visionEntityOverlap: 0.02,
      };
    } else if (ocrConfidence > 0) {
      // Weak OCR: Trust Discogs search and embeddings more
      weights = {
        artistSimilarity: 0.20,
        titleSimilarity: 0.10,
        discogsSearchSimilarity: 0.35, // NEW: Discogs search similarity (dominant when OCR is weak)
        embeddingSimilarity: 0.25,
        barcodeMatch: 0.05,
        catalogNumberMatch: 0.03,
        visionEntityOverlap: 0.02,
      };
    } else {
      // No OCR: Discogs search and embeddings are primary signals
      weights = {
        artistSimilarity: 0.15,
        titleSimilarity: 0.05,
        discogsSearchSimilarity: 0.40, // NEW: Discogs search similarity (very dominant when no OCR)
        embeddingSimilarity: 0.30,
        barcodeMatch: 0.05,
        catalogNumberMatch: 0.03,
        visionEntityOverlap: 0.02,
      };
    }
  } else {
    // NO EMBEDDINGS: Reweight to rely on Discogs text similarity + Vision + OCR
    // This prevents heavy penalization when embeddings are missing
    if (ocrConfidence >= 0.8) {
      // Strong OCR: Trust OCR + Discogs search
      weights = {
        artistSimilarity: 0.35,
        titleSimilarity: 0.25,
        discogsSearchSimilarity: 0.30, // Increased when no embeddings
        embeddingSimilarity: 0.0, // No embeddings available
        barcodeMatch: 0.05,
        catalogNumberMatch: 0.03,
        visionEntityOverlap: 0.02,
      };
    } else if (ocrConfidence >= 0.5) {
      // Moderate OCR: Balanced approach without embeddings
      weights = {
        artistSimilarity: 0.30,
        titleSimilarity: 0.20,
        discogsSearchSimilarity: 0.40, // Increased when no embeddings
        embeddingSimilarity: 0.0, // No embeddings available
        barcodeMatch: 0.05,
        catalogNumberMatch: 0.03,
        visionEntityOverlap: 0.02,
      };
    } else if (ocrConfidence > 0) {
      // Weak OCR: Trust Discogs search more
      weights = {
        artistSimilarity: 0.25,
        titleSimilarity: 0.15,
        discogsSearchSimilarity: 0.50, // Very high when no embeddings
        embeddingSimilarity: 0.0, // No embeddings available
        barcodeMatch: 0.05,
        catalogNumberMatch: 0.03,
        visionEntityOverlap: 0.02,
      };
    } else {
      // No OCR: Discogs search is primary signal
      weights = {
        artistSimilarity: 0.20,
        titleSimilarity: 0.10,
        discogsSearchSimilarity: 0.60, // Dominant when no OCR and no embeddings
        embeddingSimilarity: 0.0, // No embeddings available
        barcodeMatch: 0.05,
        catalogNumberMatch: 0.03,
        visionEntityOverlap: 0.02,
      };
    }
  }

  // 1. Artist similarity
  const ocrArtist = ocrParsed.artist || visionSignals.ocrArtist || '';
  const discogsArtist = release.artist || '';
  const artistSim = similarityScore(ocrArtist, discogsArtist);
  score += artistSim * weights.artistSimilarity;

  // 2. Title similarity
  const ocrTitle = ocrParsed.album || visionSignals.ocrTitle || '';
  const discogsTitle = release.title || '';
  const titleSim = similarityScore(ocrTitle, discogsTitle);
  score += titleSim * weights.titleSimilarity;

  // 2.5. Discogs search similarity (NEW: Strong signal from Discogs API search)
  // This is the similarity score calculated by Discogs search itself
  // When Discogs finds a high similarity match (e.g., 0.829), it's a strong signal
  // even if OCR extraction was imperfect
  const discogsSearchSim = release.similarity || 0;
  if (discogsSearchSim > 0) {
    score += discogsSearchSim * weights.discogsSearchSimilarity;
    // Debug: Log Discogs search similarity contribution if significant
    if (discogsSearchSim > 0.7) {
      console.log(`[Scoring] 🔍 Strong Discogs search match for ${release.artist} - ${release.title}: searchSimilarity=${discogsSearchSim.toFixed(3)}, contribution=${(discogsSearchSim * weights.discogsSearchSimilarity).toFixed(3)}`);
    }
  }

  // 3. Barcode match (strong signal if present)
  if (extractedBarcode && release.barcode) {
    const barcodeStr = String(release.barcode).replace(/\D/g, ''); // Remove non-digits
    const extractedStr = String(extractedBarcode).replace(/\D/g, '');
    if (barcodeStr === extractedStr) {
      score += weights.barcodeMatch;
    }
  }

  // 4. Catalog number match (if available)
  if (release.catalog_number && visionSignals.catalogNumber) {
    const catalogNorm = normalizeForSearch(release.catalog_number);
    const visionNorm = normalizeForSearch(visionSignals.catalogNumber);
    if (catalogNorm === visionNorm) {
      score += weights.catalogNumberMatch;
    }
  }

  // 5. Vision entity overlap
  const webEntities = visionSignals.webEntities || [];
  const entityText = webEntities.join(' ').toLowerCase();
  const artistLower = discogsArtist.toLowerCase();
  const titleLower = discogsTitle.toLowerCase();
  
  let entityOverlap = 0;
  if (entityText.includes(artistLower) || entityText.includes(titleLower)) {
    entityOverlap = 0.5; // Partial match
    // Check for exact word matches
    const artistWords = artistLower.split(/\s+/);
    const titleWords = titleLower.split(/\s+/);
    const entityWords = entityText.split(/\s+/);
    
    const artistMatches = artistWords.filter(w => w.length > 2 && entityWords.includes(w)).length;
    const titleMatches = titleWords.filter(w => w.length > 2 && entityWords.includes(w)).length;
    
    if (artistMatches > 0 || titleMatches > 0) {
      entityOverlap = Math.min(1.0, (artistMatches / artistWords.length) * 0.5 + (titleMatches / titleWords.length) * 0.5);
    }
  }
  score += entityOverlap * weights.visionEntityOverlap;

  // 6. Embedding similarity (FIRST-CLASS FEATURE - 20% weight)
  // Check if this release matches any embedding neighbor
  let embeddingSim = 0;
  if (embeddingSignals) {
    // Handle both single signal object and array of matches
    if (Array.isArray(embeddingSignals)) {
      // Find matching embedding in array
      const match = embeddingSignals.find(m => 
        String(m.discogsId || m.recordId) === String(release.discogsId)
      );
      if (match) {
        embeddingSim = match.similarity || 0;
      }
    } else if (embeddingSignals.recordId === String(release.discogsId) || 
               embeddingSignals.discogsId === String(release.discogsId)) {
      embeddingSim = embeddingSignals.similarity || 0;
    }
  }
  
  // Apply embedding similarity with full weight (20%)
  score += embeddingSim * weights.embeddingSimilarity;
  
  // Debug: Log embedding contribution if significant
  if (embeddingSim > 0.7) {
    console.log(`[Scoring] 🎨 Strong embedding match for ${release.artist} - ${release.title}: similarity=${embeddingSim.toFixed(3)}, contribution=${(embeddingSim * weights.embeddingSimilarity).toFixed(3)}`);
  }

  // Ensure score is between 0 and 1
  return Math.min(1.0, Math.max(0.0, score));
}

/**
 * Score and sort all Discogs releases
 * 
 * @param {Array} releases - Array of Discogs release objects
 * @param {Object} visionSignals - Vision extraction signals
 * @param {Object} ocrParsed - Parsed OCR result
 * @param {Array} embeddingMatches - Array of {recordId, similarity, discogsId} from vector search
 * @param {string} extractedBarcode - Extracted barcode (if any)
 * @returns {Array} Scored and sorted releases with score field
 */
function scoreAndSortReleases(releases, visionSignals, ocrParsed, embeddingMatches = [], extractedBarcode = null) {
  // Create embedding lookup map
  const embeddingMap = new Map();
  for (const match of embeddingMatches) {
    const key = match.discogsId || match.recordId;
    if (key) {
      embeddingMap.set(String(key), match);
    }
  }

  // Score each release
  const scored = releases.map(release => {
    const embeddingSignal = embeddingMap.get(String(release.discogsId)) || {};
    const score = scoreDiscogsRelease(
      release,
      visionSignals,
      ocrParsed,
      embeddingSignal,
      extractedBarcode
    );
    
    return {
      ...release,
      score,
      artistSimilarity: similarityScore(ocrParsed.artist || '', release.artist || ''),
      titleSimilarity: similarityScore(ocrParsed.album || '', release.title || ''),
    };
  });

  // Sort by score (descending)
  scored.sort((a, b) => b.score - a.score);

  return scored;
}

/**
 * Group scored releases and select best from each group
 * Prefers releases with full metadata (tracks, cover image, vinyl format)
 * 
 * @param {Array} scoredReleases - Scored releases
 * @returns {Array} Best release from each canonical group
 */
function selectBestFromGroups(scoredReleases) {
  const groups = groupReleasesByCanonicalKey(scoredReleases);
  const bestReleases = [];

  for (const [key, groupReleases] of groups.entries()) {
    // Sort group by score first
    groupReleases.sort((a, b) => b.score - a.score);
    
    // If top scores are close (within 0.05), prefer releases with:
    // 1. Full tracklist populated
    // 2. Cover image present
    // 3. Vinyl format (if available)
    const topScore = groupReleases[0].score;
    const closeReleases = groupReleases.filter(r => r.score >= topScore - 0.05);
    
    if (closeReleases.length > 1) {
      // Score each release on metadata completeness
      const scoredByMetadata = closeReleases.map(release => {
        let metadataScore = 0;
        
        // Prefer releases with tracklist
        if (release.tracks && release.tracks.length > 0) {
          metadataScore += 0.3;
        }
        
        // Prefer releases with cover image
        if (release.coverImageRemoteUrl && !release.coverImageRemoteUrl.includes('spacer.gif')) {
          metadataScore += 0.2;
        }
        
        // Prefer vinyl format (if format info available)
        if (release.format) {
          const formatLower = release.format.toLowerCase();
          if (formatLower.includes('vinyl') || formatLower.includes('lp') || formatLower.includes('12"')) {
            metadataScore += 0.1;
          }
        }
        
        return { release, metadataScore };
      });
      
      // Sort by metadata score (descending), then by original score
      scoredByMetadata.sort((a, b) => {
        if (Math.abs(a.metadataScore - b.metadataScore) > 0.01) {
          return b.metadataScore - a.metadataScore;
        }
        return b.release.score - a.release.score;
      });
      
      const best = scoredByMetadata[0].release;
      best.variantCount = groupReleases.length;
      best.variants = groupReleases.slice(1, 3).map(v => ({
        discogsId: v.discogsId,
        year: v.year,
        country: v.country,
        score: v.score,
      }));
      bestReleases.push(best);
    } else {
      // Clear winner, use top score
      const best = groupReleases[0];
      best.variantCount = groupReleases.length;
      best.variants = groupReleases.slice(1, 3).map(v => ({
        discogsId: v.discogsId,
        year: v.year,
        country: v.country,
        score: v.score,
      }));
      bestReleases.push(best);
    }
  }

  // Re-sort by score
  bestReleases.sort((a, b) => b.score - a.score);
  
  return bestReleases;
}

/**
 * Determine response type based on scores
 * 
 * @param {Array} scoredReleases - Scored releases (sorted)
 * @returns {Object} {type: 'auto_accept'|'suggestions'|'low_confidence', releases: Array}
 */
function determineResponseType(scoredReleases) {
  if (scoredReleases.length === 0) {
    return {
      type: 'low_confidence',
      releases: [],
    };
  }

  const bestScore = scoredReleases[0].score;

  if (bestScore >= AUTO_ACCEPT_THRESHOLD) {
    return {
      type: 'auto_accept',
      releases: [scoredReleases[0]], // Single best match
    };
  } else if (bestScore >= SUGGESTIONS_THRESHOLD) {
    return {
      type: 'suggestions',
      releases: scoredReleases.slice(0, 3), // Top 3 for user to choose
    };
  } else {
    return {
      type: 'low_confidence',
      releases: scoredReleases.slice(0, 2), // Still return top 2 for reference
    };
  }
}

module.exports = {
  scoreDiscogsRelease,
  scoreAndSortReleases,
  selectBestFromGroups,
  determineResponseType,
  getCanonicalAlbumKey,
  normalizeArtist,
  normalizeAlbumTitle,
  AUTO_ACCEPT_THRESHOLD,
  SUGGESTIONS_THRESHOLD,
};

