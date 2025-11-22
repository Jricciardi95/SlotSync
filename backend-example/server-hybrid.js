/**
 * SlotSync Backend API - Enhanced Hybrid Implementation
 * 
 * Multi-layered identification system with:
 * 1. Advanced text normalization and cleaning
 * 2. Multiple candidate extraction
 * 3. Comprehensive Google Vision usage (webDetection, similarImages, page titles)
 * 4. Smart Discogs search with fuzzy matching
 * 5. Confidence scoring and structured results
 * 6. Robust error handling with detailed debugging info
 * 
 * Prerequisites:
 * - Google Cloud Project with Vision API enabled
 * - Service account credentials JSON file
 * - Discogs Personal Access Token
 * - npm install @google-cloud/vision axios sqlite3
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const axios = require('axios');
const { ImageAnnotatorClient } = require('@google-cloud/vision');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const DISCOGS_PERSONAL_ACCESS_TOKEN = process.env.DISCOGS_PERSONAL_ACCESS_TOKEN || process.env.DISCOGS_TOKEN;
const DISCOGS_API_KEY = process.env.DISCOGS_API_KEY || process.env.DISCOGS_CONSUMER_KEY;
const DISCOGS_API_SECRET = process.env.DISCOGS_API_SECRET || process.env.DISCOGS_CONSUMER_SECRET;
const DB_PATH = path.join(__dirname, 'identified_records.db');

// Enable CORS and JSON parsing
app.use(cors());
app.use(express.json());

// Initialize Google Vision client
let visionClient = null;
try {
  visionClient = new ImageAnnotatorClient();
  console.log('✅ Google Vision API client initialized');
} catch (error) {
  console.warn('⚠️  Google Vision not configured:', error.message);
}

// Initialize Local Database
let db = null;
const initDatabase = () => {
  return new Promise((resolve, reject) => {
    const database = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        console.error('❌ Database error:', err.message);
        reject(err);
        return;
      }
      console.log('✅ Connected to local database');
    });

    database.run(`
      CREATE TABLE IF NOT EXISTS identified_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        artist TEXT NOT NULL,
        title TEXT NOT NULL,
        year INTEGER,
        cover_image_url TEXT,
        discogs_id INTEGER,
        image_hash TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(artist, title, year)
      )
    `, (err) => {
      if (err) {
        console.error('❌ Table creation error:', err.message);
        reject(err);
      } else {
        console.log('✅ Database table ready');
        resolve(database);
      }
    });
  });
};

initDatabase()
  .then((database) => {
    db = database;
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
  });

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed'));
  },
});

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Parse duration string (e.g., "3:45") to seconds
 */
function parseDuration(durationStr) {
  if (!durationStr) return null;
  const parts = durationStr.split(':');
  if (parts.length === 2) {
    const minutes = parseInt(parts[0]) || 0;
    const seconds = parseInt(parts[1]) || 0;
    return minutes * 60 + seconds;
  }
  return null;
}

/**
 * Generate image hash for duplicate detection
 * Uses multiple samples from different parts of the image to avoid collisions
 */
function generateImageHash(buffer) {
  if (!buffer || buffer.length === 0) return null;
  
  // Sample from multiple locations to create unique hash
  const samples = [];
  const sampleSize = Math.min(500, Math.floor(buffer.length / 10));
  
  // Sample from beginning
  samples.push(buffer.slice(0, sampleSize));
  // Sample from middle
  if (buffer.length > sampleSize * 2) {
    samples.push(buffer.slice(Math.floor(buffer.length / 2), Math.floor(buffer.length / 2) + sampleSize));
  }
  // Sample from end
  if (buffer.length > sampleSize) {
    samples.push(buffer.slice(-sampleSize));
  }
  
  // Combine samples with buffer length and size for uniqueness
  let hash = buffer.length;
  for (const sample of samples) {
    for (let i = 0; i < sample.length; i++) {
      hash = ((hash << 5) - hash) + sample[i];
      hash = hash & hash;
    }
  }
  
  // Add buffer size to hash for additional uniqueness
  hash = hash ^ buffer.length;
  
  return Math.abs(hash).toString(16);
}

/**
 * Calculate Levenshtein distance for fuzzy matching
 */
function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + 1
        );
      }
    }
  }

  return dp[m][n];
}

/**
 * Calculate similarity score (0-1) between two strings
 * Uses normalized versions for better matching (handles punctuation variations)
 */
function similarityScore(str1, str2) {
  if (!str1 || !str2) return 0;
  
  // Try exact match first
  if (str1.toLowerCase() === str2.toLowerCase()) return 1.0;
  
  // Try normalized match (handles punctuation)
  const norm1 = normalizeForSearch(str1);
  const norm2 = normalizeForSearch(str2);
  if (norm1 === norm2) return 0.95;
  
  // Calculate Levenshtein distance on normalized strings
  const maxLen = Math.max(norm1.length, norm2.length);
  if (maxLen === 0) return 1;
  const distance = levenshteinDistance(norm1, norm2);
  const normalizedScore = 1 - (distance / maxLen);
  
  // Also try original strings for comparison
  const origMaxLen = Math.max(str1.length, str2.length);
  const origDistance = levenshteinDistance(str1.toLowerCase(), str2.toLowerCase());
  const origScore = 1 - (origDistance / origMaxLen);
  
  // Return the better score
  return Math.max(normalizedScore, origScore);
}

/**
 * Advanced text normalization and cleaning
 * Removes OCR noise, normalizes whitespace, fixes common mistakes
 * Handles punctuation variations (B-52's vs B-52s, Party Mix! vs Party Mix)
 */
function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';

  return text
    // Remove control characters and special unicode
    .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')
    // Fix common OCR mistakes
    .replace(/[|]/g, 'I')
    .replace(/[0O]/g, (m, offset, str) => {
      // Context-aware: if surrounded by letters, likely 'O', else '0'
      const prev = str[offset - 1];
      const next = str[offset + 1];
      if (/[a-zA-Z]/.test(prev) && /[a-zA-Z]/.test(next)) return 'O';
      return m;
    })
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove leading/trailing punctuation that's likely noise
    .replace(/^[^\w\s]+|[^\w\s]+$/g, '')
    // Collapse multiple spaces
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Normalize text for search (removes punctuation, handles variations)
 * Used for fuzzy matching: "B-52's" -> "b52s", "Party Mix!" -> "party mix"
 */
function normalizeForSearch(text) {
  if (!text || typeof text !== 'string') return '';
  
  return text
    .toLowerCase()
    // Remove apostrophes and handle possessives: "B-52's" -> "b-52s"
    .replace(/'s\b/g, 's')
    .replace(/'/g, '')
    // Remove trailing punctuation: "Party Mix!" -> "party mix"
    .replace(/[!?.]+$/g, '')
    // Normalize hyphens and dashes
    .replace(/[-–—]/g, '-')
    // Remove other punctuation except hyphens
    .replace(/[^\w\s-]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract multiple artist/title candidates from text
 * Returns array of {artist, title, confidence} objects
 */
function extractCandidates(text) {
  if (!text || text.trim().length === 0) return [];

  const normalized = normalizeText(text);
  const candidates = [];
  const seen = new Set();

  // Strategy 1: Newline-separated (most common)
  const lines = normalized.split('\n').filter(line => line.trim().length > 0);
  if (lines.length >= 2) {
    // Try first two lines
    const candidate1 = {
      artist: lines[0].trim(),
      title: lines.slice(1, 3).join(' ').trim(),
      confidence: 0.9,
      source: 'newline_split'
    };
    if (isValidCandidate(candidate1) && !seen.has(key(candidate1))) {
      candidates.push(candidate1);
      seen.add(key(candidate1));
    }

    // Try reversed
    const candidate2 = {
      artist: lines[1].trim(),
      title: lines[0].trim(),
      confidence: 0.7,
      source: 'newline_split_reversed'
    };
    if (isValidCandidate(candidate2) && !seen.has(key(candidate2))) {
      candidates.push(candidate2);
      seen.add(key(candidate2));
    }
  }

  // Strategy 2: Dash/separator patterns
  const patterns = [
    { regex: /^(.+?)\s*[-–—]\s*(.+)$/, confidence: 0.85, name: 'dash' },
    { regex: /^(.+?)\s*:\s*(.+)$/, confidence: 0.8, name: 'colon' },
    { regex: /^(.+?)\s+by\s+(.+)$/i, confidence: 0.75, name: 'by', reverse: true },
    { regex: /^(.+?)\s*\/\s*(.+)$/, confidence: 0.7, name: 'slash' },
  ];

  for (const { regex, confidence, name, reverse } of patterns) {
    const match = normalized.match(regex);
    if (match) {
      const part1 = match[1].trim();
      const part2 = match[2].trim();
      const candidate = {
        artist: reverse ? part2 : part1,
        title: reverse ? part1 : part2,
        confidence,
        source: `pattern_${name}`
      };
      if (isValidCandidate(candidate) && !seen.has(key(candidate))) {
        candidates.push(candidate);
        seen.add(key(candidate));
      }
    }
  }

  // Strategy 3: All caps detection (common on album covers)
  const allCapsMatch = normalized.match(/^([A-Z\s]{3,50})\s+(.+)$/);
  if (allCapsMatch) {
    const candidate = {
      artist: allCapsMatch[1].trim(),
      title: allCapsMatch[2].trim(),
      confidence: 0.8,
      source: 'all_caps'
    };
    if (isValidCandidate(candidate) && !seen.has(key(candidate))) {
      candidates.push(candidate);
      seen.add(key(candidate));
    }
  }

  // Strategy 4: Word boundary splitting
  const words = normalized.split(/\s+/);
  if (words.length >= 4) {
    const midPoint = Math.floor(words.length / 2);
    const candidate = {
      artist: words.slice(0, midPoint).join(' ').trim(),
      title: words.slice(midPoint).join(' ').trim(),
      confidence: 0.6,
      source: 'word_split'
    };
    if (isValidCandidate(candidate) && !seen.has(key(candidate))) {
      candidates.push(candidate);
      seen.add(key(candidate));
    }
  }

  // Sort by confidence (highest first)
  return candidates.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Validate candidate
 */
function isValidCandidate(candidate) {
  if (!candidate.artist || !candidate.title) return false;
  if (candidate.artist.length < 2 || candidate.artist.length > 100) return false;
  if (candidate.title.length < 2 || candidate.title.length > 100) return false;
  // Filter out common false positives
  const falsePositives = ['album', 'vinyl', 'record', 'lp', 'cd', 'the', 'a', 'an'];
  if (falsePositives.includes(candidate.artist.toLowerCase()) ||
      falsePositives.includes(candidate.title.toLowerCase())) {
    return false;
  }
  return true;
}

/**
 * Generate unique key for candidate
 */
function key(candidate) {
  return `${candidate.artist.toLowerCase()}|${candidate.title.toLowerCase()}`;
}

// ============================================================================
// GOOGLE VISION ENHANCED PROCESSING
// ============================================================================

/**
 * Enhanced Google Vision processing with full feature utilization
 * Extracts multiple candidates from webDetection, similarImages, and OCR
 * Returns detailed logging information for debugging
 */
async function processImageWithGoogleVision(imageBuffer) {
  if (!visionClient) {
    throw new Error('Google Vision not configured');
  }

  const result = {
    candidates: [],
    extractedText: null,
    webEntities: [],
    similarImages: [],
    pageTitles: [],
    labels: [],
    rawVisionResponse: null // For debugging (sanitized)
  };

  try {
    console.log('[Google Vision] Performing comprehensive analysis...');

    // Request all features simultaneously
    const [batchResult] = await visionClient.batchAnnotateImages({
      requests: [{
        image: { content: imageBuffer },
        features: [
          { type: 'WEB_DETECTION', maxResults: 20 },
          { type: 'LABEL_DETECTION', maxResults: 15 },
          { type: 'TEXT_DETECTION' },
        ],
      }],
    });

    const response = batchResult.responses?.[0];
    if (!response) {
      console.log('[Google Vision] No response from API');
      return result;
    }

    const webDetection = response.webDetection;
    const labelDetection = response.labelAnnotations;
    const textDetection = response.textAnnotations;

    // Log raw response (sanitized - no secrets)
    result.rawVisionResponse = {
      webDetection: webDetection ? {
        webEntities: (webDetection.webEntities || []).slice(0, 10).map(e => ({
          description: e.description,
          score: e.score
        })),
        pagesWithMatchingImages: (webDetection.pagesWithMatchingImages || []).slice(0, 5).map(p => ({
          url: p.url ? p.url.substring(0, 100) + '...' : null, // Truncate URLs
          pageTitle: p.pageTitle
        })),
        visuallySimilarImages: (webDetection.visuallySimilarImages || []).length
      } : null,
      labelDetection: labelDetection ? labelDetection.slice(0, 10).map(l => ({
        description: l.description,
        score: l.score
      })) : null,
      textDetection: textDetection ? {
        hasText: textDetection.length > 0,
        textLength: textDetection[0]?.description?.length || 0,
        preview: textDetection[0]?.description?.substring(0, 200) || null
      } : null
    };

    console.log('[Google Vision] Raw response summary:', JSON.stringify(result.rawVisionResponse, null, 2));

    // Extract text
    if (textDetection && textDetection.length > 0) {
      result.extractedText = normalizeText(textDetection[0].description || '');
      console.log('[Google Vision] Extracted text:', result.extractedText.substring(0, 200));
    }

    // Process web detection
    if (webDetection) {
      // Web entities
      const entities = webDetection.webEntities || [];
      result.webEntities = entities.map(e => ({
        description: e.description,
        score: e.score || 0
      }));

      // Pages with matching images
      const pages = webDetection.pagesWithMatchingImages || [];
      result.pageTitles = pages.map(p => ({
        url: p.url,
        pageTitle: p.pageTitle || ''
      }));

      // Similar images
      const similar = webDetection.visuallySimilarImages || [];
      result.similarImages = similar.map(img => ({
        url: img.url
      }));

      // Extract candidates from web entities
      for (const entity of entities.slice(0, 20)) {
        if (entity.score < 0.3) continue;
        const description = normalizeText(entity.description || '');
        if (description.length < 5) continue;

        // Try to extract artist/title from entity description
        const entityCandidates = extractCandidates(description);
        for (const candidate of entityCandidates) {
          candidate.confidence *= (entity.score || 0.5); // Weight by entity score
          candidate.source = `web_entity_${candidate.source}`;
          if (!result.candidates.find(c => key(c) === key(candidate))) {
            result.candidates.push(candidate);
          }
        }
      }

      // Extract from page titles (often more accurate)
      for (const page of pages.slice(0, 15)) {
        const pageTitle = normalizeText(page.pageTitle || '');
        if (pageTitle.length < 5) continue;

        const pageCandidates = extractCandidates(pageTitle);
        for (const candidate of pageCandidates) {
          candidate.confidence *= 0.9; // Page titles are usually reliable
          candidate.source = `page_title_${candidate.source}`;
          if (!result.candidates.find(c => key(c) === key(candidate))) {
            result.candidates.push(candidate);
          }
        }
      }
    }

    // Process labels for context
    if (labelDetection) {
      result.labels = labelDetection
        .filter(l => l.score > 0.5)
        .map(l => ({
          description: l.description,
          score: l.score
        }));
    }

    // Extract candidates from OCR text
    if (result.extractedText) {
      const ocrCandidates = extractCandidates(result.extractedText);
      for (const candidate of ocrCandidates) {
        candidate.source = `ocr_${candidate.source}`;
        if (!result.candidates.find(c => key(c) === key(candidate))) {
          result.candidates.push(candidate);
        }
      }
    }

    // Sort all candidates by confidence
    result.candidates.sort((a, b) => b.confidence - a.confidence);

    // Log all extracted candidates with details
    console.log(`[Google Vision] Found ${result.candidates.length} total candidates`);
    if (result.candidates.length > 0) {
      console.log(`[Google Vision] All candidates:`);
      result.candidates.forEach((c, idx) => {
        console.log(`  ${idx + 1}. "${c.artist}" - "${c.title}" (confidence: ${c.confidence.toFixed(2)}, source: ${c.source})`);
      });
    }
    console.log(`[Google Vision] Top 3 candidates:`, result.candidates.slice(0, 3).map(c => 
      `${c.artist} - ${c.title} (${c.confidence.toFixed(2)})`
    ));

    return result;
  } catch (error) {
    console.error('[Google Vision] Error:', error.message);
    throw error;
  }
}

// ============================================================================
// DISCOGS SEARCH ENHANCED
// ============================================================================

/**
 * Generate comprehensive search query variations
 * Handles punctuation variations (B-52's, Party Mix!, etc.)
 */
function generateDiscogsQueries(artist, title) {
  const queries = [];

  // Base variations
  const cleanArtist = artist.replace(/\s+(and|&|feat\.|featuring)\s+.*$/i, '').trim();
  const cleanTitle = title.replace(/\s*\(.*?\)\s*/g, '').trim();
  const firstWord = artist.split(/\s+/)[0];
  const noThe = artist.replace(/^the\s+/i, '').trim();

  // Punctuation-normalized versions (for fuzzy matching)
  // Remove trailing punctuation: "Party Mix!" -> "Party Mix"
  const titleNoPunct = title.replace(/[!?.]+$/g, '').trim();
  // Handle possessives: "B-52's" -> "B-52s" and "B-52s"
  const artistNoApos = artist.replace(/'s\b/g, 's').replace(/'/g, '');
  const artistWithApos = artist.replace(/\b([a-z0-9-]+)s\b/gi, "$1's"); // Try adding apostrophe

  // Query format variations
  const formats = [
    // Original with punctuation
    `${artist} ${title}`,
    `"${artist}" "${title}"`,
    `${artist} - ${title}`,
    
    // Without trailing punctuation
    `${artist} ${titleNoPunct}`,
    `"${artist}" "${titleNoPunct}"`,
    
    // Without apostrophes
    `${artistNoApos} ${title}`,
    `${artistNoApos} ${titleNoPunct}`,
    
    // Cleaned versions
    `${cleanArtist} ${cleanTitle}`,
    `"${cleanArtist}" "${cleanTitle}"`,
    
    // Field-specific searches
    `artist:"${artist}" title:"${title}"`,
    `artist:"${artist}" title:"${titleNoPunct}"`,
    `artist:"${artistNoApos}" title:"${title}"`,
    `artist:"${cleanArtist}" title:"${cleanTitle}"`,
    
    // Partial searches
    `${firstWord} ${title}`,
    `${firstWord} ${titleNoPunct}`,
    `${noThe} ${title}`,
    `${artist} ${cleanTitle}`,
    
    // Flexible searches
    `${artist} ${title} vinyl`,
    `${artistNoApos} ${titleNoPunct} lp`,
  ];

  for (const query of formats) {
    const trimmed = query.trim();
    if (trimmed && !queries.find(q => q.query === trimmed)) {
      queries.push({
        query: trimmed,
        confidence: 1.0
      });
    }
  }

  return queries;
}

/**
 * Enhanced Discogs search with fuzzy matching and confidence scoring
 * Returns detailed logging information for debugging
 */
async function searchDiscogsEnhanced(artist, title, logQueries = true) {
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

  console.log(`[Discogs] Searching for: "${artist}" - "${title}"`);
  console.log(`[Discogs] Generated ${queries.length} query variations`);

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
        console.log(`[Discogs] Query: "${query}"`);
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
        console.log(`[Discogs]   → Found ${results.length} results`);
      }
      
      for (const result of results) {
        if (seenIds.has(result.id)) continue;
        seenIds.add(result.id);

        // Parse Discogs title format: "Artist - Title"
        const parts = result.title.split(' - ');
        const resultArtist = parts[0]?.trim() || '';
        const resultTitle = parts.slice(1).join(' - ').trim() || result.title;

        // Calculate similarity scores
        const artistSimilarity = similarityScore(artist, resultArtist);
        const titleSimilarity = similarityScore(title, resultTitle);
        const combinedSimilarity = (artistSimilarity * 0.6) + (titleSimilarity * 0.4);

        if (combinedSimilarity > queryResult.bestSimilarity) {
          queryResult.bestSimilarity = combinedSimilarity;
        }

        // Only include if similarity is reasonable (lowered threshold to 0.3)
        if (combinedSimilarity > 0.3) {
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

          if (logQueries && combinedSimilarity > 0.7) {
            console.log(`[Discogs]   → Good match: "${resultArtist}" - "${resultTitle}" (similarity: ${combinedSimilarity.toFixed(2)})`);
          }
        }
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
      if (logQueries) {
        console.log(`[Discogs]   → Query failed: ${error.message}`);
      }
      // Don't throw - continue to next query
    } finally {
      queryResult.duration = Date.now() - queryStart;
      searchLog.push(queryResult);
    }
  }

  console.log(`[Discogs] Total results found: ${allResults.length}`);
  if (allResults.length > 0) {
    console.log(`[Discogs] Best similarity: ${allResults[0].similarity.toFixed(2)}`);
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
        for (const track of release.tracklist) {
          if (track.title && track.title.trim()) {
            tracks.push({
              title: track.title.trim(),
              trackNumber: track.position ? parseInt(track.position.split(/[-.]/)[0]) || null : null,
              discNumber: track.position && track.position.includes('.') ? parseInt(track.position.split('.')[0]) || null : null,
              side: track.position && track.position.match(/^[A-Z]/) ? track.position.match(/^([A-Z])/)[1] : null,
              durationSeconds: track.duration ? parseDuration(track.duration) : null,
            });
          }
        }
      }
      
      bestMatch = {
        artist: topResult.artist,
        title: topResult.title,
        year: release.year || topResult.year,
        coverImageRemoteUrl: release.images?.[0]?.uri || topResult.coverImageRemoteUrl,
        discogsId: topResult.discogsId,
        similarity: topResult.similarity,
        confidence: Math.min(0.95, 0.7 + (topResult.similarity * 0.25)),
        tracks: tracks.length > 0 ? tracks : undefined
      };
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
  const alternates = allResults.slice(1, 6).map(r => ({
    artist: r.artist,
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

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

function searchLocalDatabase(artist, title, imageHash) {
  return new Promise((resolve) => {
    if (!db) {
      resolve(null);
      return;
    }

    // Only search by artist/title if both are provided
    // Don't search by image hash alone - it can cause false matches
    if (artist && title) {
      db.get(
        `SELECT * FROM identified_records 
         WHERE LOWER(artist) = LOWER(?) AND LOWER(title) = LOWER(?)
         ORDER BY created_at DESC LIMIT 1`,
        [artist, title],
        (err, row) => {
          if (err || !row) {
            resolve(null);
          } else {
            console.log(`[Local DB] Found match by artist/title: ${row.artist} - ${row.title}`);
            resolve(formatDbRecord(row));
          }
        }
      );
    } else {
      // Don't search by image hash alone - too unreliable
      // Image hash collisions can cause wrong matches
      resolve(null);
    }
  });
}

function formatDbRecord(row) {
  return {
    artist: row.artist,
    title: row.title,
    year: row.year,
    coverImageRemoteUrl: row.cover_image_url,
    discogsId: row.discogs_id,
    source: 'local_db',
    confidence: 0.95
  };
}

function storeInLocalDatabase(record, imageHash) {
  return new Promise((resolve) => {
    if (!db) {
      resolve();
      return;
    }

    // Don't store image hash - it can cause false matches
    // Only cache by artist/title for reliable lookups
    db.run(
      `INSERT OR REPLACE INTO identified_records 
       (artist, title, year, cover_image_url, discogs_id, image_hash)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        record.artist,
        record.title,
        record.year || null,
        record.coverImageRemoteUrl || null,
        record.discogsId || null,
        null, // Don't store image hash - causes collisions
      ],
      (err) => {
        if (err) {
          console.error('[Local DB] Error storing:', err);
        } else {
          console.log(`[Local DB] Cached: ${record.artist} - ${record.title}`);
        }
        resolve();
      }
    );
  });
}

// ============================================================================
// MAIN API ENDPOINT
// ============================================================================

app.post('/api/identify-record', upload.single('image'), async (req, res) => {
  const startTime = Date.now();
  const debugInfo = {
    inputType: null,
    imageSize: null,
    visionProcessing: null,
    candidatesExtracted: 0,
    discogsSearches: 0,
    localDbChecks: 0,
    errors: []
  };

  try {
    // Determine input type
    const inputType = req.file ? 'image' : (req.body.barcode ? 'barcode' : 'text');
    debugInfo.inputType = inputType;

    let imageBuffer = null;
    let imageHash = null;
    let barcode = null;
    let candidates = [];

    // Handle input
    if (inputType === 'image') {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: 'No image file provided',
          debug: debugInfo
        });
      }
      imageBuffer = req.file.buffer;
      imageHash = generateImageHash(imageBuffer);
      debugInfo.imageSize = req.file.size;
      console.log(`[API] Processing image: ${req.file.originalname}, ${req.file.size} bytes`);
    } else if (inputType === 'barcode') {
      barcode = req.body.barcode?.trim();
      if (!barcode) {
        return res.status(400).json({
          success: false,
          error: 'No barcode provided',
          debug: debugInfo
        });
      }
      console.log(`[API] Processing barcode: ${barcode}`);
    } else if (inputType === 'text') {
      const artist = req.body.artist?.trim() || '';
      const title = req.body.title?.trim() || '';
      if (!artist && !title) {
        return res.status(400).json({
          success: false,
          error: 'No text input provided (artist or title required)',
          debug: debugInfo
        });
      }
      // Create candidate from text input
      candidates = [{
        artist,
        title,
        confidence: 0.9,
        source: 'user_input'
      }];
      console.log(`[API] Processing text: ${artist} - ${title}`);
    }

    // STEP 1: Skip image hash cache check
    // Image hash collisions can cause wrong matches (e.g., all albums returning same result)
    // We'll only use artist/title matching after we extract candidates
    // This ensures we don't return cached results for different albums

    // STEP 2: Process image with Google Vision
    if (inputType === 'image' && imageBuffer) {
      const ENABLE_GOOGLE_VISION = process.env.ENABLE_GOOGLE_VISION !== 'false';
      
      if (ENABLE_GOOGLE_VISION && visionClient) {
        try {
          const visionStart = Date.now();
          const visionResult = await processImageWithGoogleVision(imageBuffer);
          debugInfo.visionProcessing = Date.now() - visionStart;
          debugInfo.candidatesExtracted = visionResult.candidates.length;

          // Add vision candidates
          candidates.push(...visionResult.candidates);

          // If we have extracted text but no candidates, try extracting from text
          if (visionResult.extractedText && candidates.length === 0) {
            const textCandidates = extractCandidates(visionResult.extractedText);
            candidates.push(...textCandidates);
            debugInfo.candidatesExtracted = candidates.length;
          }

          console.log(`[API] Extracted ${candidates.length} candidates from Google Vision`);
        } catch (error) {
          debugInfo.errors.push(`Google Vision: ${error.message}`);
          console.error('[API] Google Vision error:', error.message);
        }
      }
    }

    // STEP 3: Try each candidate with Discogs
    let bestResult = null;
    let bestConfidence = 0;
    const candidateResults = []; // Track all candidate attempts for debugging

    console.log(`[API] Processing ${candidates.length} candidates...`);
    
    for (const candidate of candidates) {
      if (!candidate.artist || !candidate.title) continue;

      const candidateResult = {
        candidate: {
          artist: candidate.artist,
          title: candidate.title,
          confidence: candidate.confidence,
          source: candidate.source
        },
        localDbMatch: false,
        discogsMatch: null,
        rejectionReason: null
      };

      // Check local DB for this candidate
      debugInfo.localDbChecks++;
      const localMatch = await searchLocalDatabase(candidate.artist, candidate.title, imageHash);
      if (localMatch) {
        candidateResult.localDbMatch = true;
        const candidateConfidence = candidate.confidence * localMatch.confidence;
        if (candidateConfidence > bestConfidence) {
          bestResult = {
            bestMatch: {
              artist: localMatch.artist,
              title: localMatch.title,
              year: localMatch.year,
              coverImageRemoteUrl: localMatch.coverImageRemoteUrl
            },
            alternates: [],
            source: 'local_db',
            confidence: candidateConfidence
          };
          bestConfidence = candidateConfidence;
        }
        candidateResults.push(candidateResult);
        continue; // Found in cache, skip Discogs
      }

      // Search Discogs
      debugInfo.discogsSearches++;
      try {
        const discogsResult = await searchDiscogsEnhanced(candidate.artist, candidate.title, false); // Don't log every query in loop
        
        if (discogsResult.bestMatch) {
          const combinedConfidence = candidate.confidence * discogsResult.bestMatch.confidence;
          candidateResult.discogsMatch = {
            artist: discogsResult.bestMatch.artist,
            title: discogsResult.bestMatch.title,
            similarity: discogsResult.bestMatch.similarity,
            combinedConfidence: combinedConfidence
          };
          
          if (combinedConfidence > bestConfidence) {
            bestResult = {
              bestMatch: {
                artist: discogsResult.bestMatch.artist,
                title: discogsResult.bestMatch.title,
                year: discogsResult.bestMatch.year,
                coverImageRemoteUrl: discogsResult.bestMatch.coverImageRemoteUrl,
                discogsId: discogsResult.bestMatch.discogsId,
                tracks: discogsResult.bestMatch.tracks
              },
              alternates: discogsResult.alternates.map(alt => ({
                artist: alt.artist,
                title: alt.title,
                year: alt.year,
                coverImageRemoteUrl: alt.coverImageRemoteUrl
              })),
              source: 'discogs',
              confidence: combinedConfidence,
              discogsId: discogsResult.bestMatch.discogsId
            };
            bestConfidence = combinedConfidence;

            // Store in local DB (don't use imageHash - can cause collisions)
            // Only cache by artist/title for reliable lookups
            await storeInLocalDatabase({
              artist: discogsResult.bestMatch.artist,
              title: discogsResult.bestMatch.title,
              year: discogsResult.bestMatch.year,
              coverImageRemoteUrl: discogsResult.bestMatch.coverImageRemoteUrl,
              discogsId: discogsResult.bestMatch.discogsId
            }, null); // Don't store image hash - causes false matches
          } else {
            candidateResult.rejectionReason = `Confidence too low: ${combinedConfidence.toFixed(2)} < ${bestConfidence.toFixed(2)}`;
          }
        } else {
          candidateResult.rejectionReason = 'No Discogs matches found';
        }
      } catch (error) {
        const errorMsg = `Discogs search error: ${error.message}`;
        debugInfo.errors.push(`Discogs search for "${candidate.artist} - ${candidate.title}": ${error.message}`);
        candidateResult.rejectionReason = errorMsg;
        console.error(`[API] ${errorMsg}`);
        // Don't throw - continue to next candidate
      }
      
      candidateResults.push(candidateResult);
    }

    // STEP 4: Return best result or structured error
    // Lower threshold to 0.5 for better matching (was 0.5, keeping it)
    if (bestResult && bestConfidence >= 0.5) {
      debugInfo.processingTime = Date.now() - startTime;
      console.log(`[API] ✅ Success! Confidence: ${bestConfidence.toFixed(2)}, Source: ${bestResult.source}`);
      return res.json({
        success: true,
        confidence: bestResult.confidence,
        bestMatch: bestResult.bestMatch,
        alternates: bestResult.alternates || [],
        source: bestResult.source
        // Note: Removed debug from success response to keep it clean
      });
    }

    // No good match found - return structured error with all extracted data
    debugInfo.processingTime = Date.now() - startTime;
    
    // Get extracted text from vision result if available
    let extractedText = null;
    let visionRawResponse = null;
    if (inputType === 'image' && imageBuffer) {
      const ENABLE_GOOGLE_VISION = process.env.ENABLE_GOOGLE_VISION !== 'false';
      if (ENABLE_GOOGLE_VISION && visionClient) {
        try {
          const visionResult = await processImageWithGoogleVision(imageBuffer);
          extractedText = visionResult.extractedText;
          visionRawResponse = visionResult.rawVisionResponse;
        } catch (err) {
          // Already logged above
        }
      }
    }

    console.log(`[API] ❌ No match found. Best confidence: ${bestConfidence.toFixed(2)}`);
    console.log(`[API] Candidates attempted: ${candidates.length}`);
    console.log(`[API] Candidate results:`, JSON.stringify(candidateResults, null, 2));

    // Format error response - maintain backward compatibility with frontend
    const errorResponse = {
      // Backward compatible fields (for existing frontend)
      error: 'Could not identify record with sufficient confidence',
      message: 'Please try manual entry or ensure the album cover is clear and well-lit',
      
      // Enhanced debug information
      extractedText: extractedText ? extractedText.substring(0, 500) : null, // Trim to 500 chars
      candidates: candidates.slice(0, 10).map(c => ({
        artist: c.artist,
        title: c.title,
        confidence: c.confidence,
        source: c.source
      })),
      suggestions: candidates.slice(0, 5).map(c => `${c.artist} - ${c.title}`),
      
      // Detailed candidate results with rejection reasons
      candidateResults: candidateResults.map(cr => ({
        candidate: {
          artist: cr.candidate.artist,
          title: cr.candidate.title,
          confidence: cr.candidate.confidence,
          source: cr.candidate.source
        },
        localDbMatch: cr.localDbMatch,
        discogsMatch: cr.discogsMatch ? {
          artist: cr.discogsMatch.artist,
          title: cr.discogsMatch.title,
          similarity: cr.discogsMatch.similarity,
          confidence: cr.discogsMatch.combinedConfidence
        } : null,
        rejectionReason: cr.rejectionReason || (cr.discogsMatch ? null : 'No match found')
      })),
      
      // Debug information (safe, no secrets)
      debug: {
        inputType: debugInfo.inputType,
        imageSize: debugInfo.imageSize,
        visionProcessing: debugInfo.visionProcessing,
        candidatesExtracted: debugInfo.candidatesExtracted,
        discogsSearches: debugInfo.discogsSearches,
        localDbChecks: debugInfo.localDbChecks,
        processingTime: debugInfo.processingTime,
        bestConfidenceAttempted: bestConfidence,
        visionRawResponse: visionRawResponse, // Sanitized Vision response (no secrets)
        errors: debugInfo.errors
      }
    };

    return res.status(400).json(errorResponse);

  } catch (error) {
    debugInfo.processingTime = Date.now() - startTime;
    debugInfo.errors.push(`Unexpected error: ${error.message}`);
    console.error('[API] ❌ Unexpected error:', error);
    console.error('[API] Error stack:', error.stack);
    
    // Distinguish between technical failures (5xx) and identification failures (4xx)
    const isTechnicalError = 
      error.message?.includes('network') ||
      error.message?.includes('timeout') ||
      error.message?.includes('ECONNREFUSED') ||
      error.message?.includes('ENOTFOUND') ||
      error.code === 'ECONNREFUSED' ||
      error.code === 'ETIMEDOUT';
    
    if (isTechnicalError) {
      // Technical failure - return 500
      return res.status(500).json({
        success: false,
        error: 'Technical error during identification',
        message: 'A network or service error occurred. Please try again.',
        technicalError: error.message,
        debug: debugInfo
      });
    } else {
      // Identification failure - return 400 with details
      return res.status(400).json({
        success: false,
        error: 'Could not identify record',
        message: error.message || 'Identification failed',
        debug: debugInfo
      });
    }
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      googleVision: visionClient ? 'configured' : 'not configured',
      discogs: (DISCOGS_PERSONAL_ACCESS_TOKEN || DISCOGS_API_KEY) ? 'configured' : 'not configured',
      localDatabase: db ? 'connected' : 'not connected',
    },
  });
});

// API info
app.get('/api', (req, res) => {
  res.json({
    name: 'SlotSync API (Enhanced Hybrid)',
    version: '3.0.0',
    features: [
      'Advanced text normalization',
      'Multiple candidate extraction',
      'Enhanced Google Vision (webDetection, similarImages, page titles)',
      'Smart Discogs search with fuzzy matching',
      'Confidence scoring',
      'Structured error responses',
    ],
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`\n🚀 SlotSync API Server (Enhanced) running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📍 API info: http://localhost:${PORT}/api`);
  console.log(`📍 Identify endpoint: http://localhost:${PORT}/api/identify-record\n`);
  
  if (!visionClient) {
    console.log('⚠️  Google Vision not configured');
    console.log('   Set GOOGLE_APPLICATION_CREDENTIALS to enable\n');
  }
  
  if (!DISCOGS_PERSONAL_ACCESS_TOKEN && !DISCOGS_API_KEY) {
    console.log('⚠️  Discogs API not configured');
    console.log('   Set DISCOGS_PERSONAL_ACCESS_TOKEN to enable\n');
  }
  
  console.log('✅ Ready to identify records!\n');
});
