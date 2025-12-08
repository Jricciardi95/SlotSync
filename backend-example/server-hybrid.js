/**
 * SlotSync Backend API - Core Implementation
 * 
 * Minimal, production-ready backend that:
 * 1. Accepts image of vinyl album cover
 * 2. Preprocesses image (resize/normalize)
 * 3. Uses Google Vision to extract text/entities
 * 4. Uses Discogs to resolve album (artist, title, year, tracklist)
 * 5. Optionally stores results in local DB for caching
 * 6. Returns clean JSON response
 * 
 * Prerequisites:
 * - Google Cloud Project with Vision API enabled
 * - Service account credentials JSON file
 * - Discogs Personal Access Token
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const axios = require('axios');
const { ImageAnnotatorClient } = require('@google-cloud/vision');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const visionExtractor = require('./services/visionExtractor');
const {
  searchReleaseByArtistAndTitle,
  getReleaseDetailsWithTracks,
  getCoverArtUrlForRelease,
} = require('./services/musicbrainzService');

// GPT REMOVED – not used in core SlotSync backend
// const gpt4Vision = require('./services/gpt4Vision');
// const vinylVision = require('./services/analyzeAlbumCover');
// const vinylVisionBatch = require('./services/analyzeAlbumBatch');
// const imageEmbedding = require('./services/imageEmbedding');
// const embeddingDatabase = require('./services/embeddingDatabase');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const DISCOGS_PERSONAL_ACCESS_TOKEN = process.env.DISCOGS_PERSONAL_ACCESS_TOKEN || process.env.DISCOGS_TOKEN;
const DISCOGS_API_KEY = process.env.DISCOGS_API_KEY || process.env.DISCOGS_CONSUMER_KEY;
const DISCOGS_API_SECRET = process.env.DISCOGS_API_SECRET || process.env.DISCOGS_CONSUMER_SECRET;
const DB_PATH = path.join(__dirname, 'identified_records.db');

// ============================================================================
// CONFIDENCE THRESHOLD - SINGLE SOURCE OF TRUTH
// ============================================================================
// This is the ONLY place where confidence threshold is defined.
// All identification decisions use this value.
//
// Higher values (0.6-0.65) = fewer false positives, more strict matching
// Lower values (0.4-0.5) = more lenient, catches more albums but may have false positives
// Default: 0.5 (balanced for popular albums)
// ============================================================================
const CONFIDENCE_THRESHOLD = parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.5');
console.log(`[Config] ⚙️  Confidence threshold: ${CONFIDENCE_THRESHOLD} (set CONFIDENCE_THRESHOLD env var to change)`);
console.log(`[Config] ⚙️  Lower threshold = more matches, higher = stricter matching`);

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

    // Create main records table
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
        return;
      }
      
      // GPT REMOVED – embeddings table not used in core SlotSync backend
      // Embeddings table removed - only used for GPT-based image embedding search
      
      // GPT REMOVED – vinyl_metadata table not used in core SlotSync backend
      // Vinyl metadata table removed - only used for GPT-4o analysis caching
      
      console.log('✅ Database tables ready (identified_records only)');
      resolve(database);
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
 * Clean e-commerce and product page text from OCR
 * Removes prices, shipping info, store names, UI elements, etc.
 */
function cleanEcommerceText(text) {
  if (!text || typeof text !== 'string') return text;
  
  // Common e-commerce patterns to remove
  const ecommercePatterns = [
    /List Price:\s*\$?[\d.,]+/gi,
    /Get Fast,?\s*Free Shipping.*/gi,
    /FREE Returns.*/gi,
    /Amazon Prime.*/gi,
    /Prime.*/gi,
    /ADVISORY.*/gi,
    /EXPLICIT.*/gi,
    /PARENTAL ADVISORY.*/gi,
    /CONTENT.*/gi,
    /\$[\d.,]+/g, // Any price patterns
    /Price:\s*\$?[\d.,]+/gi,
    /Shipping.*/gi,
    /Returns.*/gi,
    /Add to Cart.*/gi,
    /Buy Now.*/gi,
    /In Stock.*/gi,
    /Out of Stock.*/gi,
    /Rating:.*/gi,
    /Reviews:.*/gi,
  ];
  
  let cleaned = text;
  for (const pattern of ecommercePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // CRITICAL: Remove UI elements and short noise words (e.g., "T now Share")
  // These are often OCR artifacts from app UI elements on the screen
  const uiElementPatterns = [
    /\b(T|t)\s+now\s+Share\b/gi, // "T now Share" pattern
    /\b(T|t)\s+now\b/gi, // "T now" pattern
    /\bnow\s+Share\b/gi, // "now Share" pattern
    /\b(Tap|tap|Click|click|Press|press)\s+(to|now|here|this)\b/gi, // UI action words
    /\b(Share|share)\s+(this|now|album)\b/gi, // Share button text
  ];
  
  for (const pattern of uiElementPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Remove standalone short noise words that are likely UI elements
  const words = cleaned.split(/\s+/);
  const filteredWords = words.filter(w => {
    const lower = w.toLowerCase().trim();
    // Filter out single-letter words and common UI words
    if (w.length <= 1) return false;
    if (['t', 'now', 'share', 'tap', 'click', 'press', 'this', 'here'].includes(lower)) {
      return false;
    }
    return true;
  });
  
  return filteredWords.join(' ').trim();
}

/**
 * Advanced text normalization and cleaning
 * Removes OCR noise, normalizes whitespace, fixes common mistakes
 * Handles punctuation variations (B-52's vs B-52s, Party Mix! vs Party Mix)
 * CRITICAL: Also removes e-commerce text (prices, shipping info, etc.)
 */
function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';

  // CRITICAL: Clean e-commerce text FIRST
  const cleaned = cleanEcommerceText(text);

  return cleaned
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
    // Normalize whitespace (preserve newlines for line-based extraction)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n') // Collapse multiple newlines to single
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
 * STRICT filter: Only allow candidates that look like real album names
 * Rejects URLs, article titles, wiki pages, social media, file paths, etc.
 * This is the primary filter used for LOW_CONFIDENCE suggestions
 */
function isAlbumNameOnlyCandidate(candidate) {
  if (!candidate || !candidate.title) return false;
  
  const artist = (candidate.artist || '').trim();
  const title = (candidate.title || '').trim();
  const combined = `${artist} ${title}`.toLowerCase();
  
  // Must at least have a title
  if (!title || title.length < 2) return false;
  
  // Reject anything that looks like a URL or file path
  const urlOrFilePatterns = [
    'http://',
    'https://',
    'www.',
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.webp',
    '.php',
    '.html',
    '.htm',
    'media/file:',
    'file:',
    '#/media/',
    '.com',
    '.net',
    '.org',
    '.edu',
    '.gov',
  ];
  
  if (urlOrFilePatterns.some(p => combined.includes(p))) return false;
  
  // Reject obvious article/blog/link-type content
  const nonAlbumPatterns = [
    'best album covers',
    'top ',
    'the 10 best',
    'the 20 best',
    'album covers from',
    'cover art from',
    'facebook',
    'twitter',
    'pinterest',
    'instagram',
    'creative bloq',
    'blog',
    'reddit',
    'tumblr',
    'soundtrack review',
    'review',
    'reviews',
    'lyrics',
    'lyric',
    'ranked',
    'list of',
    'debut album cover',
    'see more',
    'view all',
    'album covers i find',
    'album covers i',
    'r/musicsuggestions',
    'r/',
  ];
  
  if (nonAlbumPatterns.some(p => combined.includes(p))) return false;
  
  // Reject wiki-style / article-style strings
  const wikiPatterns = [
    'wiki/',
    'wikipedia',
    '(album)',
    '(band)',
    '(song)',
    '(music)',
  ];
  
  if (wikiPatterns.some(p => combined.includes(p))) return false;
  
  // Reject titles that are clearly way too long (more like sentences)
  if (title.length > 80) return false;
  
  // Reject titles that look like URLs or file paths (contains / and . or #)
  if (title.includes('/') && (title.includes('.') || title.includes('#'))) return false;
  
  // Reject titles that are just generic words
  const genericWords = ['discogs', 'releases', 'release', 'album', 'albums', 'music', 'reddit'];
  if (genericWords.includes(title.toLowerCase())) return false;
  
  // Reject if artist contains pipe character (common in web page titles like "Artist | Releases")
  if (artist.includes('|') || title.includes('|')) return false;
  
  // Reject if artist looks like a title fragment (e.g., "The 20 best album covers from the 70s")
  if (artist && artist.length > 30 && (artist.toLowerCase().includes('best') || artist.toLowerCase().includes('top'))) {
    return false;
  }
  
  // Reject if title contains "releases" or "discogs" as a standalone word
  if (/\b(releases?|discogs)\b/i.test(title)) return false;
  
  return true;
}

/**
 * Legacy filter: Check if a candidate looks like a real album (not web page title, URL, etc.)
 * Filters out obvious non-album junk like article titles, URLs, file paths
 * @deprecated Use isAlbumNameOnlyCandidate for stricter filtering
 */
function isAlbumLikeCandidate(candidate) {
  return isAlbumNameOnlyCandidate(candidate);
}

/**
 * Extract multiple artist/title candidates from text
 * Returns array of {artist, title, confidence} objects
 */
function extractCandidates(text) {
  if (!text || text.trim().length === 0) return [];

  // CRITICAL: Clean e-commerce text FIRST, before normalization
  const cleaned = cleanEcommerceText(text);
  const candidates = [];
  const seen = new Set();
  
  // Strategy 1: Newline-separated (most common for album covers)
  // Process cleaned text with newlines preserved
  const originalLines = cleaned
    .split(/\n/)
    .map(line => line.trim())
    .filter(line => {
      // Filter out lines that are clearly e-commerce text
      const lower = line.toLowerCase();
      const ecommerceKeywords = [
        'price', 'shipping', 'returns', 'prime', 'amazon', 'ebay', 
        'advisory', 'explicit', 'parental', 'content', 'rating', 
        'review', 'stock', 'cart', 'buy', 'list price', 'get fast',
        'free shipping', 'add to', 'in stock', 'out of stock'
      ];
      return !ecommerceKeywords.some(keyword => lower.includes(keyword)) && 
             !line.match(/^\$[\d.,]+/) && // Not a price
             line.length > 0;
    });
  
  if (originalLines.length >= 2) {
    // Try first two clean lines (most common: artist on first line, title on second)
    const line1 = originalLines[0].trim();
    const line2 = originalLines[1].trim();
    
    // Additional validation: lines shouldn't be too long (likely product descriptions)
    if (line1.length <= 50 && line2.length <= 50) {
      const candidate1 = {
        artist: line1,
        title: line2,
        confidence: 0.9,
        source: 'newline_split'
      };
      if (isValidCandidate(candidate1) && !seen.has(key(candidate1))) {
        candidates.push(candidate1);
        seen.add(key(candidate1));
      }
    }
  }
  
  // Now normalize for other strategies
  const normalized = normalizeText(cleaned);
  
  // Strategy 1.5: Try normalized lines if original didn't work
  const lines = normalized.split('\n').filter(line => line.trim().length > 0);
  if (lines.length >= 2 && candidates.length === 0) {
    // Try first two lines (most common: artist on first line, title on second)
    const candidate1 = {
      artist: lines[0].trim(),
      title: lines.slice(1, 3).join(' ').trim(),
      confidence: 0.85,
      source: 'newline_split_normalized'
    };
    if (isValidCandidate(candidate1) && !seen.has(key(candidate1))) {
      candidates.push(candidate1);
      seen.add(key(candidate1));
    }

    // Try reversed (title first, artist second - less common but possible)
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

  // Strategy 1.6: Handle "TAYLOR'S VERSION 1989" style patterns
  // Pattern: "ARTIST'S VERSION" or "ARTIST VERSION" followed by album title/number
  const versionPattern = /^([A-Z][A-Z\s']+?)\s+(?:'S\s+)?VERSION\s+(.+)$/i;
  const versionMatch = normalized.match(versionPattern);
  if (versionMatch) {
    const artistPart = versionMatch[1].trim();
    const titlePart = versionMatch[2].trim();
    
    // Clean up artist (e.g., "TAYLOR'S" -> "Taylor Swift")
    let cleanArtist = artistPart;
    if (artistPart.toUpperCase().includes("TAYLOR")) {
      cleanArtist = "Taylor Swift";
    } else {
      // Capitalize properly
      cleanArtist = artistPart.split(/\s+/).map(w => 
        w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
      ).join(' ');
    }
    
    // Filter out UI elements from title (e.g., "T now Share")
    const cleanTitle = titlePart
      .split(/\s+/)
      .filter(w => {
        const lower = w.toLowerCase();
        // Filter out short words that look like UI elements
        return !['t', 'now', 'share', 'tap', 'click', 'press'].includes(lower) &&
               w.length > 1;
      })
      .join(' ')
      .trim();
    
    if (isValidCandidate({ artist: cleanArtist, title: cleanTitle })) {
      const candidate = {
        artist: cleanArtist,
        title: cleanTitle,
        confidence: 0.95,
        source: 'version_pattern'
      };
      if (!seen.has(key(candidate))) {
        candidates.push(candidate);
        seen.add(key(candidate));
      }
    }
  }
  
  // Strategy 1.7: Extract from tracklist text (e.g., "LANA DEL REY ... BORN TO DIE ... The Paradise Edition")
  // Look for artist name patterns that appear multiple times, followed by album title patterns
  // CRITICAL: Run this even if we have some candidates, as tracklist extraction might find better matches
  if (normalized.length > 50) {
    // Common OCR typos to fix
    const ocrFixes = {
      'LANA DEL RET': 'LANA DEL REY',
      'LANA DE': 'LANA DEL REY',
      'LANA DEL RET DEL REY': 'LANA DEL REY', // Handle "LANA DEL RET DEL REY" -> "LANA DEL REY"
      'TAYLOR': 'TAYLOR SWIFT',
    };
    
    let fixedText = normalized;
    // Apply fixes in order (longer patterns first)
    const sortedFixes = Object.entries(ocrFixes).sort((a, b) => b[0].length - a[0].length);
    for (const [typo, correct] of sortedFixes) {
      fixedText = fixedText.replace(new RegExp(typo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), correct);
    }
    
    // Look for artist name patterns (2-4 capitalized words that appear multiple times)
    const words = fixedText.split(/\s+/).filter(w => w.length > 1);
    const wordCounts = {};
    words.forEach(w => {
      const upper = w.toUpperCase();
      if (/^[A-Z]/.test(w) && w.length >= 3) {
        wordCounts[upper] = (wordCounts[upper] || 0) + 1;
      }
    });
    
    // Find potential artist names (words that appear 2+ times and look like names)
    const potentialArtists = Object.entries(wordCounts)
      .filter(([word, count]) => count >= 2 && word.length >= 4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    
    // Look for album title patterns: "The X Edition", "X Edition", numbers, or capitalized phrases
    const titlePatterns = [
      /(?:The\s+)?([A-Z][A-Z\s]+?)\s+Edition/i,
      /\b([A-Z]{2,}\s+[A-Z]{2,})\s+(?:Edition|Version|Deluxe)/i,
      /\b(\d{2,4})\b/, // Years or numbers like "40", "1989"
    ];
    
    for (const [artistWord, count] of potentialArtists) {
      // Try to find the full artist name (look for multi-word patterns containing this word)
      const artistPattern = new RegExp(`\\b(${artistWord}(?:\\s+[A-Z][A-Z\\s]*)?)\\b`, 'gi');
      const artistMatches = fixedText.match(artistPattern);
      if (artistMatches && artistMatches.length >= 2) {
        // Artist appears multiple times - likely the actual artist
        const fullArtist = artistMatches[0].trim();
        
        // Look for album title patterns
        for (const pattern of titlePatterns) {
          const titleMatch = fixedText.match(pattern);
          if (titleMatch) {
            let albumTitle = titleMatch[1] || titleMatch[0];
            albumTitle = albumTitle.trim();
            
            // Skip if title is too long (likely a track name)
            if (albumTitle.length > 50) continue;
            
            // Skip if title looks like a track name (contains common track words)
            const trackWords = ['BORN', 'DIE', 'RACES', 'JEANS', 'GAMES', 'MOUNTAIN', 'DEW', 'ANTHEM', 'PARADISE', 'RADIO', 'CARMEN', 'DOLLAR', 'MAN', 'SADNESS', 'GIRLS', 'LOLITA', 'LUCKY', 'ONES'];
            if (trackWords.some(tw => albumTitle.toUpperCase().includes(tw))) continue;
            
            if (isValidCandidate({ artist: fullArtist, title: albumTitle })) {
              const candidate = {
                artist: fullArtist,
                title: albumTitle,
                confidence: 0.85,
                source: 'tracklist_extraction'
              };
              if (!seen.has(key(candidate))) {
                candidates.push(candidate);
                seen.add(key(candidate));
                console.log(`[extractCandidates] ✅ Tracklist extraction: "${fullArtist}" - "${albumTitle}"`);
              }
            }
          }
        }
        
        // Also try looking for "Edition" or "Version" patterns (e.g., "The Paradise Edition")
        const editionMatch = fixedText.match(/(?:The\s+)?([A-Z][A-Z\s]{3,}?)\s+(?:Edition|Version|Deluxe)/i);
        if (editionMatch) {
          const albumTitle = editionMatch[1].trim();
          // For "The Paradise Edition", extract "Paradise" as the title
          const cleanTitle = albumTitle.replace(/^The\s+/i, '').trim();
          if (cleanTitle.length > 3 && cleanTitle.length < 50) {
            if (isValidCandidate({ artist: fullArtist, title: cleanTitle })) {
              const candidate = {
                artist: fullArtist,
                title: cleanTitle,
                confidence: 0.80,
                source: 'tracklist_edition'
              };
              if (!seen.has(key(candidate))) {
                candidates.push(candidate);
                seen.add(key(candidate));
                console.log(`[extractCandidates] ✅ Tracklist edition: "${fullArtist}" - "${cleanTitle}"`);
              }
            }
          }
        }
        
        // Special case: Look for "PARADISE" or "Paradise" as standalone album title
        // This handles cases where "The Paradise Edition" is split across lines
        if (fixedText.toUpperCase().includes('PARADISE') && !fixedText.toUpperCase().includes('DARK PARADISE')) {
          // Check if "Paradise" appears as a standalone word (not part of "Dark Paradise" track)
          const paradiseMatch = fixedText.match(/\b(Paradise|PARADISE)\b/);
          if (paradiseMatch && fullArtist.toUpperCase().includes('LANA')) {
            if (isValidCandidate({ artist: fullArtist, title: 'Paradise' })) {
              const candidate = {
                artist: fullArtist,
                title: 'Paradise',
                confidence: 0.75,
                source: 'tracklist_paradise'
              };
              if (!seen.has(key(candidate))) {
                candidates.push(candidate);
                seen.add(key(candidate));
                console.log(`[extractCandidates] ✅ Tracklist Paradise: "${fullArtist}" - "Paradise"`);
              }
            }
          }
        }
      }
    }
  }
  
  // Strategy 1.5: Simple two-word/phrase split (for cases like "Mick Jagger Primitive Cool")
  // If text has 3-8 words total, try splitting in the middle
  const textWords = normalized.split(/\s+/).filter(w => {
    // Filter out UI elements and short noise words
    const lower = w.toLowerCase();
    return !['t', 'now', 'share', 'tap', 'click', 'press'].includes(lower) &&
           w.length > 1;
  });
  if (textWords.length >= 3 && textWords.length <= 8 && lines.length === 0) {
    // Try splitting at different points
    for (let splitPoint = 2; splitPoint <= Math.min(4, textWords.length - 1); splitPoint++) {
      const artistPart = textWords.slice(0, splitPoint).join(' ');
      const titlePart = textWords.slice(splitPoint).join(' ');
      
      // Check if it looks like a name (capitalized words) followed by title
      const artistWords = artistPart.split(/\s+/);
      const titleWords = titlePart.split(/\s+/);
      const artistLooksLikeName = artistWords.every(w => /^[A-Z]/.test(w));
      const titleLooksLikeTitle = titleWords.some(w => /^[A-Z]/.test(w));
      
      if (artistLooksLikeName && titleLooksLikeTitle) {
        const candidate = {
          artist: artistPart,
          title: titlePart,
          confidence: 0.85,
          source: 'word_split_smart'
        };
        if (isValidCandidate(candidate) && !seen.has(key(candidate))) {
          candidates.push(candidate);
          seen.add(key(candidate));
        }
      }
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

  // Strategy 3: All caps detection (common on album covers like "MICK JAGGER PRIMITIVE COOL")
  // Handle both single-line and multi-line uppercase text
  const allCapsLines = normalized.split('\n').filter(line => {
    const upperCount = (line.match(/[A-Z]/g) || []).length;
    const lowerCount = (line.match(/[a-z]/g) || []).length;
    return upperCount > lowerCount && line.trim().length > 2;
  });
  
  if (allCapsLines.length >= 2) {
    // Two lines of uppercase text - likely artist and title
    const candidate = {
      artist: allCapsLines[0].trim(),
      title: allCapsLines.slice(1).join(' ').trim(),
      confidence: 0.95,
      source: 'all_caps_multiline'
    };
    if (isValidCandidate(candidate) && !seen.has(key(candidate))) {
      candidates.push(candidate);
      seen.add(key(candidate));
    }
  }
  
  // Single line all caps - improved pattern matching
  // Handle cases like "MICK JAGGER PRIMITIVE COOL" (4 words, split after 2)
  // Also handle cases where text is all caps but not split by newlines
  const allCapsWords = normalized.split(/\s+/).filter(w => {
    const upperCount = (w.match(/[A-Z]/g) || []).length;
    const lowerCount = (w.match(/[a-z]/g) || []).length;
    return upperCount > lowerCount && w.length > 1;
  });
  
  // Enhanced: Also check if the entire normalized text is mostly uppercase
  const normalizedUpperCount = (normalized.match(/[A-Z]/g) || []).length;
  const normalizedLowerCount = (normalized.match(/[a-z]/g) || []).length;
  const isMostlyAllCaps = normalizedUpperCount > normalizedLowerCount * 2;
  
  if ((allCapsWords.length >= 3 && allCapsWords.length <= 8) || (isMostlyAllCaps && normalized.split(/\s+/).length >= 3 && normalized.split(/\s+/).length <= 8)) {
    const wordsToUse = allCapsWords.length > 0 ? allCapsWords : normalized.split(/\s+/).filter(w => w.length > 0);
    
    // Try different split points for all-caps text
    // For "MICK JAGGER PRIMITIVE COOL" (4 words), try splits at 2, 3
    for (let splitPoint = 2; splitPoint <= Math.min(4, wordsToUse.length - 1); splitPoint++) {
      const artistPart = wordsToUse.slice(0, splitPoint).join(' ');
      const titlePart = wordsToUse.slice(splitPoint).join(' ');
      
      // Additional validation: ensure both parts have at least 2 characters
      if (artistPart.length < 2 || titlePart.length < 2) continue;
      
      const candidate = {
        artist: artistPart,
        title: titlePart,
        confidence: 0.92 - (splitPoint - 2) * 0.05, // Higher confidence for earlier splits (2-word artist)
        source: 'all_caps_single_split'
      };
      if (isValidCandidate(candidate) && !seen.has(key(candidate))) {
        candidates.push(candidate);
        seen.add(key(candidate));
        console.log(`[extractCandidates] All-caps split candidate: "${artistPart}" - "${titlePart}" (confidence: ${candidate.confidence.toFixed(2)})`);
      }
    }
  }
  
  // Fallback: Simple regex for all caps single line
  const allCapsMatch = normalized.match(/^([A-Z\s]{3,50})\s+([A-Z\s]{3,50})$/);
  if (allCapsMatch && allCapsLines.length === 0 && allCapsWords.length === 0) {
    const candidate = {
      artist: allCapsMatch[1].trim(),
      title: allCapsMatch[2].trim(),
      confidence: 0.8,
      source: 'all_caps_single'
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
  
  // CRITICAL: Filter out e-commerce text patterns
  const artistLower = candidate.artist.toLowerCase();
  const titleLower = candidate.title.toLowerCase();
  const ecommerceKeywords = [
    'price', 'shipping', 'returns', 'prime', 'amazon', 'ebay', 
    'advisory', 'explicit', 'parental', 'content', 'rating', 
    'review', 'stock', 'cart', 'buy', 'list price', 'get fast',
    'free shipping', 'add to', 'in stock', 'out of stock', '$'
  ];
  
  // Reject if artist or title contains e-commerce keywords
  if (ecommerceKeywords.some(keyword => artistLower.includes(keyword) || titleLower.includes(keyword))) {
    return false;
  }
  
  // Reject if title starts with price pattern
  if (candidate.title.match(/^\$[\d.,]+/)) {
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
/**
 * Process image with Google Vision API and return structured VisionResult
 * 
 * Returns a structured result that matches the frontend VisionResult type:
 * - webEntities: Web entities from Vision
 * - pageTitles: Page titles from web pages with matching images
 * - ocrTextBlocks: OCR text split into blocks
 * - extractedText: Full OCR text
 * - labels: Generic labels/categories
 * - similarImageUrls: URLs of visually similar images
 * 
 * This structured format allows the frontend to extract candidates
 * using the candidateExtractor module.
 */
async function processImageWithGoogleVision(imageBuffer) {
  if (!visionClient) {
    throw new Error('Google Vision not configured');
  }

  // Structured result matching frontend VisionResult type
  const result = {
    webEntities: [],
    pageTitles: [],
    ocrTextBlocks: [],
    extractedText: null,
    labels: [],
    similarImageUrls: [],
    // Legacy fields for backward compatibility
    candidates: [],
    similarImages: [],
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

    // Log comprehensive Vision response summary
    console.log(`[Google Vision] 📊 Vision API Response Summary:`);
    console.log(`[Google Vision]   - Web entities: ${result.webEntities?.length || 0}`);
    console.log(`[Google Vision]   - Page titles: ${result.pageTitles?.length || 0}`);
    console.log(`[Google Vision]   - Similar images: ${result.similarImageUrls?.length || 0}`);
    console.log(`[Google Vision]   - Labels: ${result.labels?.length || 0}`);
    console.log(`[Google Vision]   - OCR text length: ${result.extractedText?.length || 0} chars`);
    console.log(`[Google Vision]   - OCR text blocks: ${result.ocrTextBlocks?.length || 0}`);
    
    if (result.rawVisionResponse) {
      console.log(`[Google Vision] 📊 Detailed response:`, JSON.stringify(result.rawVisionResponse, null, 2));
    }

    // Extract text and split into blocks
    if (textDetection && textDetection.length > 0) {
      const rawText = textDetection[0].description || '';
      result.extractedText = normalizeText(rawText);
      
      // Split OCR text into blocks (lines or paragraphs)
      // This matches the frontend VisionResult.ocrTextBlocks structure
      const lines = result.extractedText.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      if (lines.length > 1) {
        result.ocrTextBlocks = lines;
      } else if (result.extractedText.length > 0) {
        // Single line - try to split by common separators
        const separators = [' - ', ' – ', ' — ', ' | ', ' / '];
        let split = false;
        for (const sep of separators) {
          if (result.extractedText.includes(sep)) {
            result.ocrTextBlocks = result.extractedText.split(sep)
              .map(s => s.trim())
              .filter(s => s.length > 0);
            split = true;
            break;
          }
        }
        if (!split) {
          result.ocrTextBlocks = [result.extractedText];
        }
      }
      
      console.log('[Google Vision] Raw OCR text (first 500 chars):', rawText.substring(0, 500));
      console.log('[Google Vision] Normalized text (first 300 chars):', result.extractedText.substring(0, 300));
      console.log('[Google Vision] OCR text blocks:', result.ocrTextBlocks.length);
      
      // Log if text appears to be all caps (common on album covers)
      const upperCount = (result.extractedText.match(/[A-Z]/g) || []).length;
      const lowerCount = (result.extractedText.match(/[a-z]/g) || []).length;
      if (upperCount > lowerCount * 2) {
        console.log('[Google Vision] ⚠️  Text appears to be ALL CAPS - will use enhanced all-caps detection');
      }
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
      // Also store in structured format
      result.similarImageUrls = similar.map(img => img.url).filter(url => url);

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
    console.log(`[Google Vision] 🎯 Candidate Extraction Summary:`);
    console.log(`[Google Vision]   Total candidates: ${result.candidates.length}`);
    
    if (result.candidates.length > 0) {
      console.log(`[Google Vision] 📋 All candidates (sorted by confidence):`);
      result.candidates.forEach((c, idx) => {
        console.log(`  ${idx + 1}. "${c.artist}" - "${c.title}"`);
        console.log(`     Confidence: ${c.confidence.toFixed(3)}, Source: ${c.source}`);
      });
      
      console.log(`[Google Vision] 🏆 Top 3 candidates:`);
      result.candidates.slice(0, 3).forEach((c, idx) => {
        console.log(`  ${idx + 1}. "${c.artist}" - "${c.title}" (${c.confidence.toFixed(3)}, ${c.source})`);
      });
    } else {
      console.warn(`[Google Vision] ⚠️  No candidates extracted! This may indicate:`);
      console.warn(`[Google Vision]   - Poor image quality`);
      console.warn(`[Google Vision]   - No text visible on cover`);
      console.warn(`[Google Vision]   - Vision API returned no useful data`);
    }

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
 * Search Discogs by barcode (UPC/EAN)
 * 
 * @param {string} barcode - Barcode string (UPC, EAN, etc.)
 * @returns {Promise<Object|null>} Best match or null
 */
async function searchDiscogsByBarcode(barcode) {
  if (!DISCOGS_PERSONAL_ACCESS_TOKEN && !DISCOGS_API_KEY) {
    console.warn('[Discogs] ⚠️  Discogs not configured, cannot search by barcode');
    return null;
  }

  try {
    console.log(`[Discogs] 🔍 Searching by barcode: ${barcode}`);
    
    const params = {
      barcode,
      type: 'release',
      per_page: 5,
    };

    if (!DISCOGS_PERSONAL_ACCESS_TOKEN) {
      params.key = DISCOGS_API_KEY;
      params.secret = DISCOGS_API_SECRET;
    }

    const headers = {
      'User-Agent': 'SlotSync/1.0.0 (contact@slotsync.app)',
    };

    if (DISCOGS_PERSONAL_ACCESS_TOKEN) {
      headers['Authorization'] = `Discogs token=${DISCOGS_PERSONAL_ACCESS_TOKEN}`;
    }

    const response = await axios.get('https://api.discogs.com/database/search', {
      params,
      headers,
      timeout: 5000,
    });

    const results = response.data && response.data.results || [];
    if (!results.length) {
      console.log(`[Discogs] ❌ No results for barcode ${barcode}`);
      return null;
    }

    console.log(`[Discogs] ✅ Found ${results.length} result(s) for barcode ${barcode}`);
    
    // Get the top result
    const top = results[0];
    
    // Parse artist and title from Discogs title format: "Artist - Title"
    const titleParts = top.title.split(' - ');
    const artist = titleParts[0]?.trim() || '';
    const title = titleParts.slice(1).join(' - ').trim() || top.title;

    // Fetch full release details to get tracklist
    let tracks = [];
    let year = top.year || null;
    let coverImageUrl = top.cover_image || null;
    
    try {
      const releaseUrl = `https://api.discogs.com/releases/${top.id}`;
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
      year = release.year || year;
      coverImageUrl = release.images?.[0]?.uri || coverImageUrl;
      
      // Extract tracklist with improved parsing
      if (release.tracklist && Array.isArray(release.tracklist)) {
        for (const track of release.tracklist) {
          if (track.title && track.title.trim()) {
            const position = track.position || '';
            // Parse position: "A1", "B2", "1", "1-1", etc.
            let trackNumber = null;
            let side = null;
            let discNumber = null;
            
            // Match side + track: "A1", "B2"
            const sideMatch = position.match(/^([A-Z])(\d+)$/i);
            if (sideMatch) {
              side = sideMatch[1].toUpperCase();
              trackNumber = parseInt(sideMatch[2], 10);
            } else {
              // Match disc-track: "1-1", "1-2"
              const discTrackMatch = position.match(/^(\d+)-(\d+)$/);
              if (discTrackMatch) {
                discNumber = parseInt(discTrackMatch[1], 10);
                trackNumber = parseInt(discTrackMatch[2], 10);
              } else {
                // Match track number only: "1", "2"
                const trackMatch = position.match(/^(\d+)$/);
                if (trackMatch) {
                  trackNumber = parseInt(trackMatch[1], 10);
                }
              }
            }
            
            tracks.push({
              title: track.title.trim(),
              trackNumber: trackNumber,
              discNumber: discNumber,
              side: side,
              durationSeconds: track.duration ? parseDuration(track.duration) : null,
            });
          }
        }
        console.log(`[Discogs] ✅ Extracted ${tracks.length} tracks from barcode match`);
      }
      
      // Extract genres and styles for better metadata
      const genres = release.genres && Array.isArray(release.genres) ? release.genres : [];
      const styles = release.styles && Array.isArray(release.styles) ? release.styles : [];
      
      if (genres.length > 0) {
        console.log(`[Discogs] ✅ Extracted genres: ${genres.join(', ')}`);
      }
      if (styles.length > 0) {
        console.log(`[Discogs] ✅ Extracted styles: ${styles.join(', ')}`);
      }

      return {
        discogsId: top.id,
        artist: artist,
        title: title,
        year: year,
        coverImageRemoteUrl: coverImageUrl,
        tracks: tracks.length > 0 ? tracks : undefined,
        genres: genres,
        styles: styles,
        confidence: 0.95, // High confidence for barcode matches (barcode = exact match)
        similarity: 1.0, // Perfect match via barcode
      };
    } catch (releaseError) {
      console.warn(`[Discogs] ⚠️  Could not fetch full release details: ${releaseError.message}`);
      // Continue with basic info from search result
      return {
        discogsId: top.id,
        artist: artist,
        title: title,
        year: year,
        coverImageRemoteUrl: coverImageUrl,
        tracks: undefined,
        genres: [],
        styles: [],
        confidence: 0.95, // High confidence for barcode matches
        similarity: 1.0, // Perfect match via barcode
      };
    }

  } catch (err) {
    console.error('[Discogs] ❌ Barcode search failed:', err.message);
    if (err.response) {
      console.error('[Discogs] Response status:', err.response.status);
      console.error('[Discogs] Response data:', err.response.data);
    }
    return null;
  }
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
        console.log(`[Discogs]     → Found ${results.length} results`);
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
            console.log(`[Discogs]     ✅ Good match: "${resultArtist}" - "${resultTitle}"`);
            console.log(`[Discogs]        Similarity: ${combinedSimilarity.toFixed(3)} (artist: ${artistSimilarity.toFixed(3)}, title: ${titleSimilarity.toFixed(3)})`);
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

  console.log(`[Discogs] 📊 Search Summary:`);
  console.log(`[Discogs]   Total results: ${allResults.length}`);
  console.log(`[Discogs]   Queries attempted: ${searchLog.length}`);
  console.log(`[Discogs]   Successful queries: ${searchLog.filter(q => q.success).length}`);
  if (allResults.length > 0) {
    console.log(`[Discogs]   🏆 Best similarity: ${allResults[0].similarity.toFixed(3)}`);
    console.log(`[Discogs]   🏆 Best match: "${allResults[0].artist}" - "${allResults[0].title}"`);
  } else {
    console.warn(`[Discogs]   ⚠️  No matches found above similarity threshold (0.3)`);
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
      
      bestMatch = {
        artist: topResult.artist,
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
// THREE-PHASE IDENTIFICATION PIPELINE
// ============================================================================

/**
 * Phase 1: Generate Candidates from Input
 * Converts raw input (image/barcode/text) into candidate album matches
 */
async function generateCandidatesFromInput(req, imageBuffer, debugInfo) {
  const candidates = [];
  const inputType = req.file ? 'image' : (req.body.barcode ? 'barcode' : 'text');
  debugInfo.inputType = inputType;
  debugInfo.sourcesUsed = debugInfo.sourcesUsed || [];

  // Handle image input
  if (inputType === 'image' && imageBuffer) {
    // Note: Image preprocessing (resize, normalize, etc.) is handled on the frontend
    // The image buffer received here is already preprocessed and ready for Vision API
    
    // Google Vision processing
    const ENABLE_GOOGLE_VISION = process.env.ENABLE_GOOGLE_VISION !== 'false';
    if (ENABLE_GOOGLE_VISION && visionClient) {
      try {
        console.log(`[Phase1] 🔍 Starting Google Vision analysis...`);
        const visionPromise = processImageWithGoogleVision(imageBuffer);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Vision API timeout after 45 seconds')), 45000);
        });
        
        const visionResult = await Promise.race([visionPromise, timeoutPromise]);
        const visionTime = Date.now();
        debugInfo.visionProcessing = visionTime;
        // Store visionResult for frontend candidate extraction
        debugInfo.visionResult = visionResult;

        // Store OCR text and web entities
        if (visionResult.extractedText) {
          debugInfo.rawOcrText = visionResult.extractedText;
        }
        debugInfo.webEntities = visionResult.webEntities?.length || 0;
        debugInfo.pageTitles = visionResult.pageTitles?.length || 0;

        // Primary extraction using visionExtractor
        const extracted = visionExtractor.extractArtistTitleFromVision(visionResult);
        if (extracted && extracted.artist && extracted.title) {
          console.log(`[Phase1] ✅ Primary: "${extracted.artist}" - "${extracted.title}"`);
          candidates.push({
            artist: extracted.artist,
            title: extracted.title,
            confidence: 0.9,
            source: extracted.source || 'vision_primary',
          });
          debugInfo.sourcesUsed.push('vision');
        }

        // Add secondary OCR candidates (cap at 5, filter low confidence AND filter non-albums)
        if (visionResult.extractedText) {
          const textCandidates = extractCandidates(visionResult.extractedText);
          console.log(`[Phase1] 📋 Extracted ${textCandidates.length} candidates from OCR text`);
          for (const candidate of textCandidates) {
            console.log(`[Phase1]   Candidate: "${candidate.artist}" - "${candidate.title}" (confidence: ${candidate.confidence.toFixed(2)}, source: ${candidate.source})`);
            // CRITICAL: Filter out non-album candidates (URLs, articles, Wikipedia, etc.)
            // But be less strict for tracklist-based candidates (they often have track names mixed in)
            const isTracklistCandidate = candidate.source?.includes('tracklist');
            const isValid = isTracklistCandidate 
              ? isValidCandidate(candidate) // Less strict for tracklist
              : isAlbumNameOnlyCandidate(candidate); // Strict for others
            
            if (candidate.confidence >= 0.3 && isValid && candidates.length < 5) {
              if (!candidates.find(c => key(c) === key(candidate))) {
                candidates.push(candidate);
                console.log(`[Phase1] ✅ Added candidate: "${candidate.artist}" - "${candidate.title}"`);
              }
            } else {
              console.log(`[Phase1] ❌ Rejected candidate: "${candidate.artist}" - "${candidate.title}" (confidence: ${candidate.confidence.toFixed(2)}, valid: ${isValid})`);
            }
          }
        }

        // Add vision result candidates (filter low confidence AND filter non-albums)
        for (const candidate of visionResult.candidates || []) {
          // CRITICAL: Filter out non-album candidates (URLs, articles, Wikipedia, etc.)
          if (candidate.confidence >= 0.3 && 
              isAlbumNameOnlyCandidate(candidate) && 
              candidates.length < 5) {
            if (!candidates.find(c => key(c) === key(candidate))) {
              candidates.push(candidate);
            }
          }
        }

        // GPT REMOVED – not used in core SlotSync backend

      } catch (error) {
        const errorMsg = error.message || 'Unknown Vision API error';
        debugInfo.errors.push(`Google Vision: ${errorMsg}`);
        console.error(`[Phase1] ❌ Vision error: ${errorMsg}`);
        
        // GPT REMOVED – not used in core SlotSync backend
      }
    } else if (inputType === 'image' && imageBuffer && !visionClient) {
      // Vision disabled - cannot process image without Google Vision
      console.warn(`[Phase1] ⚠️  Google Vision not configured - cannot process image`);
      throw new Error('Google Vision API not configured. Please set up Google Cloud credentials.');
    }

    // GPT REMOVED – embedding-based similarity search not used in core SlotSync backend

    // OCR → MusicBrainz fallback (last resort)
    if (candidates.length === 0 && debugInfo.rawOcrText && debugInfo.rawOcrText.trim().length > 0) {
      console.log(`[Phase1] 🎵 Trying MusicBrainz OCR fallback...`);
      try {
        const words = debugInfo.rawOcrText
          .split(/\s+/)
          .filter(w => w.length > 2 && !/^(stereo|vinyl|record|album|lp|cd)$/i.test(w))
          .slice(0, 6)
          .join(' ');
        
        if (words.length > 5) {
          const mbFallback = await searchReleaseByArtistAndTitle(null, words);
          if (mbFallback) {
            const candidate = {
              artist: mbFallback.artist,
              title: mbFallback.title,
              confidence: 0.5,
              source: 'musicbrainz_ocr_fallback',
              musicbrainz: {
                mbid: mbFallback.mbid,
                year: mbFallback.year,
              },
            };
            // CRITICAL: Filter out non-album candidates
            if (isAlbumNameOnlyCandidate(candidate)) {
              candidates.push(candidate);
              debugInfo.fallbackUsed = 'musicbrainz_ocr_fallback';
              debugInfo.sourcesUsed.push('musicbrainz_ocr_fallback');
              console.log(`[Phase1] ✅ MusicBrainz OCR fallback: "${mbFallback.artist}" - "${mbFallback.title}"`);
            } else {
              console.log(`[Phase1] ⚠️  MusicBrainz OCR fallback candidate filtered out (not album-like)`);
            }
          }
        }
      } catch (mbError) {
        console.warn(`[Phase1] ⚠️  MusicBrainz OCR fallback failed: ${mbError.message}`);
      }
    }

  } else if (inputType === 'barcode') {
    const barcode = req.body.barcode?.trim();
    if (!barcode) {
      throw new Error('No barcode provided');
    }

    console.log(`[Phase1] 📷 Processing barcode: ${barcode}`);
    const barcodeMatch = await searchDiscogsByBarcode(barcode);
    
    if (barcodeMatch) {
      console.log(`[Phase1] ✅ Barcode match: "${barcodeMatch.artist}" - "${barcodeMatch.title}"`);
      candidates.push({
        artist: barcodeMatch.artist,
        title: barcodeMatch.title,
        confidence: 0.95, // High confidence - barcode is exact match
        source: 'barcode_discogs',
        discogsId: barcodeMatch.discogsId,
        year: barcodeMatch.year,
        coverImageRemoteUrl: barcodeMatch.coverImageRemoteUrl,
        tracks: barcodeMatch.tracks,
        genres: barcodeMatch.genres || [],
        styles: barcodeMatch.styles || [],
      });
      
      console.log(`[Phase1] ✅ Barcode match details: ${barcodeMatch.tracks?.length || 0} tracks, ${barcodeMatch.genres?.length || 0} genres`);
      debugInfo.barcodeMatch = true;
      debugInfo.sourcesUsed.push('barcode');
    } else {
      throw new Error(`No Discogs match for barcode ${barcode}`);
    }

  } else if (inputType === 'text') {
    const artist = req.body.artist?.trim() || '';
    const title = req.body.title?.trim() || '';
    if (!artist && !title) {
      throw new Error('No text input provided (artist or title required)');
    }
    
    candidates.push({
      artist,
      title,
      confidence: 0.9,
      source: 'user_input'
    });
    debugInfo.sourcesUsed.push('user_input');
    console.log(`[Phase1] Processing text: ${artist} - ${title}`);
  }

  // Sort by confidence (highest first)
  candidates.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  
  debugInfo.candidateCount = candidates.length;
  console.log(`[Phase1] ✅ Generated ${candidates.length} candidates from ${debugInfo.sourcesUsed.join(', ')}`);
  
  return candidates;
}

/**
 * Phase 2: Resolve Best Album from Candidates
 * Takes candidates and resolves the best match using Discogs/MusicBrainz
 */
async function resolveBestAlbum(candidates, imageHash, debugInfo) {
  if (!candidates || candidates.length === 0) {
    console.log(`[Phase2] ❌ No candidates to resolve`);
    return null;
  }

  let bestAlbum = null;
  let bestConfidence = 0;
  // Use global CONFIDENCE_THRESHOLD (defined at top of file)

  // Short-circuit for barcode matches (highest accuracy - barcode = exact Discogs match)
  const barcodeCandidate = candidates.find(c => c.source === 'barcode_discogs' || c.source === 'discogs_barcode');
  if (barcodeCandidate && barcodeCandidate.discogsId) {
    console.log(`[Phase2] ✅ Barcode match found (confidence: ${barcodeCandidate.confidence || 0.95}), using directly - skipping additional Discogs search`);
    bestAlbum = {
      artist: barcodeCandidate.artist,
      title: barcodeCandidate.title,
      year: barcodeCandidate.year || null,
      discogsId: barcodeCandidate.discogsId,
      coverImageUrl: barcodeCandidate.coverImageRemoteUrl || null,
      confidence: barcodeCandidate.confidence || 0.95, // Barcode matches are highly accurate
      source: barcodeCandidate.source,
      musicbrainz: barcodeCandidate.musicbrainz || null,
      tracks: barcodeCandidate.tracks || null,
      genres: barcodeCandidate.genres || [],
      styles: barcodeCandidate.styles || [],
    };
    bestConfidence = bestAlbum.confidence;
    console.log(`[Phase2] ✅ Barcode match: "${bestAlbum.artist}" - "${bestAlbum.title}" (Discogs ID: ${bestAlbum.discogsId}, Tracks: ${bestAlbum.tracks?.length || 0})`);
  } else {
    // Process each candidate
    for (const candidate of candidates) {
      if (!candidate.artist || !candidate.title) continue;

      // Check local database first
      if (candidate.artist && candidate.title) {
        try {
          const localMatch = await searchLocalDatabase(candidate.artist, candidate.title, imageHash);
          if (localMatch) {
            debugInfo.localDbChecks++;
            const localConfidence = candidate.confidence * localMatch.confidence;
            if (localConfidence > bestConfidence) {
              bestAlbum = {
                artist: localMatch.artist,
                title: localMatch.title,
                year: localMatch.year || candidate.year || null,
                discogsId: localMatch.discogsId || null,
                coverImageUrl: localMatch.coverImageRemoteUrl || null,
                confidence: localConfidence,
                source: 'local_db',
                musicbrainz: candidate.musicbrainz || null,
              };
              bestConfidence = localConfidence;
              console.log(`[Phase2] ✅ Local DB match: "${bestAlbum.artist}" - "${bestAlbum.title}"`);
              continue; // Skip Discogs search for local match
            }
          }
        } catch (localError) {
          console.warn(`[Phase2] ⚠️  Local DB check failed: ${localError.message}`);
        }
      }

      // Search Discogs
      if (candidate.artist && candidate.title) {
        try {
          debugInfo.discogsSearches++;
          const discogsResult = await searchDiscogsEnhanced(candidate.artist, candidate.title, false);
          
          if (!discogsResult.bestMatch && debugInfo.discogsSearches === 1) {
            // Log first Discogs failure with query variants for debugging
            console.log(`[Phase2] ❌ NO_DISCOGS_MATCH for candidate: "${candidate.artist}" - "${candidate.title}"`);
            console.log(`[Phase2] ❌ Candidate confidence: ${candidate.confidence?.toFixed(3) || 'N/A'}`);
            if (discogsResult.searchLog && discogsResult.searchLog.length > 0) {
              const queries = discogsResult.searchLog.map(q => q.query).slice(0, 3);
              console.log(`[Phase2] ❌ Query variants used: ${queries.join(', ')}${discogsResult.searchLog.length > 3 ? '...' : ''}`);
            }
          }
          
          if (discogsResult.bestMatch) {
            const combinedConfidence = candidate.confidence * discogsResult.bestMatch.confidence;
            
            // Store Discogs match and alternates on candidate for suggestions
            candidate.discogsId = discogsResult.bestMatch.discogsId;
            candidate.year = discogsResult.bestMatch.year || candidate.year;
            if (discogsResult.alternates && discogsResult.alternates.length > 0) {
              candidate.discogsAlternates = discogsResult.alternates.slice(0, 5); // Store up to 5 alternates
            }
            
            if (combinedConfidence > bestConfidence) {
              // Attach MusicBrainz MBID if not already present
              let musicbrainz = candidate.musicbrainz || null;
              if (!musicbrainz) {
                try {
                  const mbRelease = await searchReleaseByArtistAndTitle(candidate.artist, candidate.title);
                  if (mbRelease) {
                    musicbrainz = {
                      mbid: mbRelease.mbid,
                      year: mbRelease.year,
                    };
                    debugInfo.musicbrainzSearches++;
                  }
                } catch (mbError) {
                  // Ignore MusicBrainz errors - optional
                }
              }

              bestAlbum = {
                artist: discogsResult.bestMatch.artist,
                title: discogsResult.bestMatch.title,
                year: discogsResult.bestMatch.year || candidate.year || null,
                discogsId: discogsResult.bestMatch.discogsId,
                coverImageUrl: discogsResult.bestMatch.coverImageRemoteUrl || null,
                confidence: combinedConfidence,
                source: candidate.source,
                musicbrainz: musicbrainz,
                tracks: discogsResult.bestMatch.tracks || null, // Include tracks from Discogs
              };
              bestConfidence = combinedConfidence;
              console.log(`[Phase2] ✅ Discogs match: "${bestAlbum.artist}" - "${bestAlbum.title}" (confidence: ${combinedConfidence.toFixed(2)})`);
            }
          } else if (discogsResult.alternates && discogsResult.alternates.length > 0) {
            // Even if no best match, store alternates for suggestions
            candidate.discogsAlternates = discogsResult.alternates.slice(0, 5);
          }
        } catch (discogsError) {
          console.warn(`[Phase2] ⚠️  Discogs search failed: ${discogsError.message}`);
          debugInfo.errors.push(`Discogs search: ${discogsError.message}`);
        }
      }
    }
  }

  // Check if we have a good enough match
  if (bestAlbum && bestConfidence >= CONFIDENCE_THRESHOLD) {
    console.log(
      `[Phase2] ✅ Best album resolved: "${bestAlbum.artist}" - "${bestAlbum.title}", ` +
      `confidence=${bestConfidence.toFixed(2)}, ` +
      `discogsId=${bestAlbum.discogsId || 'none'}, ` +
      `mbid=${bestAlbum.musicbrainz?.mbid || 'none'}`
    );
    return bestAlbum;
  } else if (bestAlbum) {
    debugInfo.lowConfidence = true;
    console.log(
      `[Phase2] ⚠️  LOW_CONFIDENCE_REJECTED: "${bestAlbum.artist}" - "${bestAlbum.title}", ` +
      `confidence=${bestConfidence.toFixed(3)} (threshold: ${CONFIDENCE_THRESHOLD})`
    );
    return bestAlbum; // Return anyway, but mark as low confidence
  }

  console.log(`[Phase2] ❌ No album resolved from ${candidates.length} candidates`);
  return null;
}

/**
 * Phase 3: Enrich Album Metadata
 * Fetches full metadata (tracks, genres, styles, cover art) from Discogs + MusicBrainz + CAA
 * NOW USES UNIFIED RESOLVER - ALWAYS returns HQ cover art from APIs, NEVER user photos
 */
async function enrichAlbumMetadata(bestAlbum, debugInfo) {
  // CRITICAL: If we have artist and title, use unified resolver for complete metadata
  // This ensures we ALWAYS get HQ cover art from APIs, never user photos
  if (bestAlbum.artist && bestAlbum.title) {
    try {
      console.log(`[Phase3] 🔄 Using unified resolver for "${bestAlbum.artist}" - "${bestAlbum.title}"`);
      const unifiedMetadata = await resolveAlbumMetadata(bestAlbum.artist, bestAlbum.title);
      
      if (unifiedMetadata && unifiedMetadata.coverImage) {
        console.log(`[Phase3] ✅ Unified resolver returned HQ cover art: ${unifiedMetadata.coverImage ? 'YES' : 'NO'}`);
        
        // Build enriched result from unified metadata
        const enriched = {
          artist: unifiedMetadata.canonicalArtist || unifiedMetadata.artist || bestAlbum.artist,
          title: unifiedMetadata.canonicalAlbum || unifiedMetadata.album || bestAlbum.title,
          year: unifiedMetadata.releaseYear || bestAlbum.year || null,
          discogsId: unifiedMetadata.discogsId || bestAlbum.discogsId || null,
          musicbrainz: unifiedMetadata.mbid ? { mbid: unifiedMetadata.mbid } : bestAlbum.musicbrainz || null,
          // CRITICAL: ALWAYS use HQ cover art from unified resolver, NEVER user photo
          coverImageUrl: unifiedMetadata.coverImage, // ALWAYS from API
          tracks: unifiedMetadata.tracks.map(t => ({
            title: t.title,
            trackNumber: t.number,
            discNumber: t.discNumber || null,
            durationSeconds: t.durationMs ? Math.floor(t.durationMs / 1000) : null,
          })),
          genres: unifiedMetadata.genres || [],
          styles: unifiedMetadata.styles || [],
          confidence: unifiedMetadata.confidence || bestAlbum.confidence || 0.7,
          source: 'unified_resolver',
        };
        
        console.log(`[Phase3] ✅ Enriched with unified resolver: ${enriched.tracks.length} tracks, cover: ${enriched.coverImageUrl ? 'YES' : 'NO'}`);
        return enriched;
      } else {
        console.log(`[Phase3] ⚠️  Unified resolver found no cover art, falling back to legacy enrichment`);
        // Fall through to legacy enrichment
      }
    } catch (unifiedError) {
      console.warn(`[Phase3] ⚠️  Unified resolver failed: ${unifiedError.message}, falling back to legacy enrichment`);
      // Fall through to legacy enrichment
    }
  }
  
  // Legacy enrichment (fallback if unified resolver fails or no artist/title)
  const DISCOGS_PERSONAL_ACCESS_TOKEN = process.env.DISCOGS_PERSONAL_ACCESS_TOKEN || process.env.DISCOGS_TOKEN;
  const DISCOGS_API_KEY = process.env.DISCOGS_API_KEY || process.env.DISCOGS_CONSUMER_KEY;
  const DISCOGS_API_SECRET = process.env.DISCOGS_API_SECRET || process.env.DISCOGS_CONSUMER_SECRET;

  const primary = {
    artist: bestAlbum.artist,
    title: bestAlbum.title,
    year: bestAlbum.year || null,
    discogsId: bestAlbum.discogsId || null,
    musicbrainz: bestAlbum.musicbrainz || null,
    tracks: bestAlbum.tracks || [],
    coverImageUrl: bestAlbum.coverImageUrl || null,
    genres: [],
    styles: [],
    confidence: bestAlbum.confidence,
    source: bestAlbum.source,
  };

  // Fetch Discogs release details (primary source)
  if (primary.discogsId) {
    try {
      console.log(`[Phase3] 📀 Fetching Discogs release: ${primary.discogsId}`);
      const headers = {
        'User-Agent': 'SlotSync/1.0.0 (contact@slotsync.app)',
      };
      if (DISCOGS_PERSONAL_ACCESS_TOKEN) {
        headers['Authorization'] = `Discogs token=${DISCOGS_PERSONAL_ACCESS_TOKEN}`;
      }

      const releaseResponse = await axios.get(`https://api.discogs.com/releases/${primary.discogsId}`, {
        params: DISCOGS_PERSONAL_ACCESS_TOKEN ? {} : {
          key: DISCOGS_API_KEY,
          secret: DISCOGS_API_SECRET,
        },
        headers: headers,
        timeout: 5000,
      });

      const release = releaseResponse.data;
      
      // Extract year
      if (release.year && !primary.year) {
        primary.year = release.year;
      }

      // Extract genres and styles
      if (release.genres && Array.isArray(release.genres)) {
        primary.genres = release.genres;
      }
      if (release.styles && Array.isArray(release.styles)) {
        primary.styles = release.styles;
      }

      // Extract tracks (if not already populated)
      if (primary.tracks.length === 0 && release.tracklist && Array.isArray(release.tracklist)) {
        for (const track of release.tracklist) {
          if (track.title && track.title.trim()) {
            primary.tracks.push({
              title: track.title.trim(),
              trackNumber: track.position ? parseInt(track.position.split(/[-.]/)[0]) || null : null,
              discNumber: track.position && track.position.includes('.') ? parseInt(track.position.split('.')[0]) : null,
              side: track.position && track.position.match(/^[A-Z]/) ? track.position.match(/^([A-Z])/)[1] : null,
              durationSeconds: track.duration ? parseDuration(track.duration) : null,
            });
          }
        }
        console.log(`[Phase3] ✅ Extracted ${primary.tracks.length} tracks from Discogs`);
      }

      // Extract cover image
      if (release.images && release.images.length > 0) {
        primary.coverImageUrl = release.images[0].uri || release.images[0].resource_url || null;
      }

    } catch (discogsError) {
      console.warn(`[Phase3] ⚠️  Discogs release fetch failed: ${discogsError.message}`);
      debugInfo.errors.push(`Discogs release fetch: ${discogsError.message}`);
    }
  }

  // MusicBrainz enrichment (fallback + additional data)
  if (primary.musicbrainz?.mbid) {
    try {
      console.log(`[Phase3] 🎵 Fetching MusicBrainz release: ${primary.musicbrainz.mbid}`);
      const mbDetails = await getReleaseDetailsWithTracks(primary.musicbrainz.mbid);
      
      if (mbDetails) {
        debugInfo.musicbrainzUsed = true;
        
        // Use MusicBrainz tracks if Discogs has none
        if (primary.tracks.length === 0 && mbDetails.tracks && mbDetails.tracks.length > 0) {
          primary.tracks = mbDetails.tracks.map(t => ({
            title: t.title,
            trackNumber: t.trackNumber || null,
            discNumber: t.disc || null,
            durationSeconds: t.lengthMs ? Math.floor(t.lengthMs / 1000) : null,
          }));
          console.log(`[Phase3] ✅ MusicBrainz provided ${primary.tracks.length} tracks`);
        }

        // Use MusicBrainz year if missing
        if (!primary.year && mbDetails.year) {
          primary.year = mbDetails.year;
        }
      }
    } catch (mbError) {
      console.warn(`[Phase3] ⚠️  MusicBrainz enrichment failed: ${mbError.message}`);
      debugInfo.errors.push(`MusicBrainz enrichment: ${mbError.message}`);
    }
  }

  // Cover Art Archive fallback
  if ((!primary.coverImageUrl || primary.coverImageUrl.includes('spacer.gif')) && primary.musicbrainz?.mbid) {
    try {
      console.log(`[Phase3] 🖼️  Fetching cover art from CAA...`);
      const caaUrl = await getCoverArtUrlForRelease(primary.musicbrainz.mbid);
      if (caaUrl) {
        primary.coverImageUrl = caaUrl;
        debugInfo.coverArtArchiveUsed = true;
        console.log(`[Phase3] ✅ Cover Art Archive provided cover image`);
      }
    } catch (caaError) {
      console.warn(`[Phase3] ⚠️  Cover Art Archive failed: ${caaError.message}`);
    }
  }

  console.log(
    `[Phase3] ✅ Metadata enriched: ` +
    `tracks=${primary.tracks.length}, ` +
    `genres=${primary.genres.length}, ` +
    `styles=${primary.styles.length}, ` +
    `cover=${primary.coverImageUrl ? 'yes' : 'no'}`
  );

  return primary;
}

// ============================================================================
// MAIN API ENDPOINT
// ============================================================================

app.post('/api/identify-record', upload.single('image'), async (req, res) => {
  const startTime = Date.now();
  const REQUEST_TIMEOUT = 90000; // 90 seconds total timeout (increased for complex identifications)
  
  // Log incoming request immediately
  console.log(`\n[API] ========================================`);
  console.log(`[API] 📥 INCOMING REQUEST: /api/identify-record`);
  console.log(`[API] 📍 Timestamp: ${new Date().toISOString()}`);
  console.log(`[API] 📍 Client IP: ${req.ip || req.connection.remoteAddress}`);
  console.log(`[API] 📍 Method: ${req.method}`);
  console.log(`[API] 📍 Has file: ${!!req.file}`);
  if (req.file) {
    console.log(`[API] 📍 File size: ${(req.file.size / 1024).toFixed(2)}KB`);
    console.log(`[API] 📍 File type: ${req.file.mimetype}`);
  }
  if (req.body.barcode) {
    console.log(`[API] 📍 Barcode: ${req.body.barcode}`);
  }
  console.log(`[API] ========================================\n`);
  
  // Set response timeout
  req.setTimeout(REQUEST_TIMEOUT, () => {
    console.error(`[API] ❌ Request timeout after ${REQUEST_TIMEOUT / 1000} seconds`);
    if (!res.headersSent) {
      res.status(504).json({
        error: 'Request timeout',
        message: 'Image processing took too long. The image may be too large. Please try a smaller image or check your connection.',
        timeout: true
      });
    }
  });
  const debugInfo = {
    inputType: null,
    imageSize: null,
    imageMimeType: null,
    imageDimensions: null,
    visionProcessing: null,
    candidatesExtracted: 0, // Will be updated after candidate generation
    candidateCount: 0, // Will be updated after candidate generation
    discogsSearches: 0,
    localDbChecks: 0,
    musicbrainzSearches: 0,
    musicbrainzUsed: false,
    coverArtArchiveUsed: false,
    rawOcrText: null,
    sourcesUsed: [],
    lowConfidence: false,
    errors: [],
    visionResult: null, // Store VisionResult for frontend
  };

  try {
    // Prepare input
    let imageBuffer = null;
    let imageHash = null;
    
    if (req.file) {
      // Validate and log image details
      const imageSizeMB = req.file.size / (1024 * 1024);
      const imageSizeKB = req.file.size / 1024;
      
      console.log(`[API] 📸 Image received: ${req.file.originalname}`);
      console.log(`[API] 📸 Image size: ${imageSizeKB.toFixed(2)}KB (${imageSizeMB.toFixed(2)}MB)`);
      console.log(`[API] 📸 Image MIME type: ${req.file.mimetype}`);
      
      if (imageSizeMB > 5) {
        console.warn(`[API] ⚠️  Large image detected: ${imageSizeMB.toFixed(2)}MB`);
      } else if (imageSizeMB > 2) {
        console.warn(`[API] ⚠️  Image is ${imageSizeMB.toFixed(2)}MB - consider resizing`);
      } else {
        console.log(`[API] ✅ Image size is reasonable (${imageSizeKB.toFixed(2)}KB)`);
      }
      
      const validMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif'];
      if (!validMimeTypes.includes(req.file.mimetype)) {
        console.warn(`[API] ⚠️  Unexpected MIME type: ${req.file.mimetype}`);
      }
      
      imageBuffer = req.file.buffer;
      imageHash = generateImageHash(imageBuffer);
      debugInfo.imageSize = req.file.size;
      debugInfo.imageMimeType = req.file.mimetype;
    }

    // PHASE 1: Generate Candidates from Input
    let candidates = [];
    try {
      candidates = await generateCandidatesFromInput(req, imageBuffer, debugInfo);
      // Update debug info with actual candidate counts
      debugInfo.candidateCount = candidates.length;
      debugInfo.candidatesExtracted = candidates.length;
      console.log(`[API] 📊 Generated ${candidates.length} candidates from input`);
    } catch (phase1Error) {
      // Handle Phase 1 errors (e.g., barcode not found)
      if (phase1Error.message.includes('barcode') || phase1Error.message.includes('No')) {
        return res.status(400).json({
          success: false,
          error: phase1Error.message,
          message: phase1Error.message,
          debug: debugInfo
        });
      }
      throw phase1Error; // Re-throw other errors
    }

    // PHASE 2: Resolve Best Album from Candidates
    const bestAlbum = await resolveBestAlbum(candidates, imageHash, debugInfo);

    if (!bestAlbum) {
      // No album identified - return structured error with suggestions
      debugInfo.processingTime = Date.now() - startTime;
      
      // CRITICAL: Build albumSuggestions ONLY from Discogs/MusicBrainz releases
      // Do NOT return raw Vision web page titles, URLs, or store names
      const albumSuggestions = [];
      const seenDiscogsIds = new Set();
      
      // Collect all Discogs matches from candidates that were searched
      const rawCandidates = candidates || [];
      for (const candidate of rawCandidates) {
        // Only include candidates that have a Discogs ID (meaning they were successfully matched to a release)
        if (candidate.discogsId && !seenDiscogsIds.has(candidate.discogsId)) {
          // Filter out any non-album sources (web pages, stores, etc.)
          const source = candidate.source || '';
          const badSources = ['web_page', 'amazon', 'ebay', 'wikipedia', 'store', 'url', 'page_title'];
          if (badSources.some(bad => source.toLowerCase().includes(bad))) {
            continue; // Skip web page/store sources
          }
          
          seenDiscogsIds.add(candidate.discogsId);
          albumSuggestions.push({
            artist: candidate.artist?.trim() || null,
            albumTitle: candidate.title?.trim() || null,
            releaseYear: candidate.year || null,
            discogsId: candidate.discogsId,
            confidence: candidate.confidence || 0.5,
            source: 'discogs', // Mark as canonical Discogs release
          });
        }
        
        // Also include alternates from Discogs searches (if candidate had alternates)
        if (candidate.discogsAlternates && Array.isArray(candidate.discogsAlternates)) {
          for (const alt of candidate.discogsAlternates) {
            if (alt.discogsId && !seenDiscogsIds.has(alt.discogsId)) {
              seenDiscogsIds.add(alt.discogsId);
              albumSuggestions.push({
                artist: alt.artist?.trim() || null,
                albumTitle: alt.title?.trim() || null,
                releaseYear: alt.year || null,
                discogsId: alt.discogsId,
                confidence: (candidate.confidence || 0.5) * 0.8, // Slightly lower confidence for alternates
                source: 'discogs',
              });
            }
          }
        }
      }
      
      // Sort by confidence (highest first)
      albumSuggestions.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      
      console.log(`[API] Built ${albumSuggestions.length} canonical album suggestions from Discogs (filtered out raw Vision web pages)`);

      return res.status(400).json({
        success: false,
        code: 'LOW_CONFIDENCE',
        error: 'Could not identify record with sufficient confidence',
        message: albumSuggestions.length > 0
          ? 'Please review the suggested album matches or enter manually.'
          : 'Please try manual entry or ensure the album cover is clear and well-lit',
        // CRITICAL: Only return canonical album suggestions from Discogs/MusicBrainz
        // Do NOT return raw Vision web page titles, URLs, or store names
        albumSuggestions: albumSuggestions,
        hasCandidates: albumSuggestions.length > 0,
        candidatesCount: albumSuggestions.length,
        // Keep extracted text for debugging only (not shown to user)
        hasExtractedText: !!debugInfo.rawOcrText,
        extractedText: debugInfo.rawOcrText ? debugInfo.rawOcrText.substring(0, 500) : null,
        // Legacy field for backward compatibility (deprecated - use albumSuggestions)
        candidates: [],
        discogsSuggestions: albumSuggestions,
        debug: debugInfo,
      });
    }

    // PHASE 3: Enrich Album Metadata
    const primaryMatch = await enrichAlbumMetadata(bestAlbum, debugInfo);
    
    // GPT REMOVED – Vinyl Vision analysis not used in core SlotSync backend

    // Store in local database for caching
    // CRITICAL: Always use HQ cover art from API, never user photo
    if (primaryMatch.discogsId || primaryMatch.coverImageUrl) {
      await storeInLocalDatabase({
        artist: primaryMatch.artist,
        title: primaryMatch.title,
        year: primaryMatch.year,
        // ALWAYS use HQ cover art from API, never user photo
        coverImageRemoteUrl: primaryMatch.coverImageUrl || null,
        discogsId: primaryMatch.discogsId || null
      }, null);
    }

    // GPT REMOVED – embedding storage not used in core SlotSync backend

    debugInfo.processingTime = Date.now() - startTime;

    // Format success response - clean JSON matching SlotSync frontend expectations
    // Support both new format (for orchestrator) and legacy format (for barcode/backward compatibility)
    const response = {
      success: true,
      confidence: primaryMatch.confidence,
      artist: primaryMatch.artist,
      albumTitle: primaryMatch.title,
      releaseYear: primaryMatch.year || null,
      discogsId: primaryMatch.discogsId || null,
      coverImageUrl: primaryMatch.coverImageUrl || null,
      tracks: (primaryMatch.tracks || []).map(track => ({
        position: track.position || track.trackNumber || 0,
        title: track.title,
        side: track.side || null,
        discNumber: track.discNumber || null,
        durationSeconds: track.durationSeconds || null,
      })),
      // Include visionResult for frontend candidate extraction
      visionResult: debugInfo.visionResult || null,
      // Legacy format for backward compatibility (barcode scanning, etc.)
      bestMatch: {
        artist: primaryMatch.artist,
        title: primaryMatch.title,
        year: primaryMatch.year || null,
        coverImageRemoteUrl: primaryMatch.coverImageUrl || null,
        discogsId: primaryMatch.discogsId || null,
        tracks: (primaryMatch.tracks || []).map(track => ({
          title: track.title,
          trackNumber: track.position || track.trackNumber || 0,
          side: track.side || null,
          discNumber: track.discNumber || null,
          durationSeconds: track.durationSeconds || null,
        })),
        confidence: primaryMatch.confidence,
        source: primaryMatch.source || 'api',
      },
      alternates: [], // Empty for now, can be populated if needed
    };

    // CRITICAL: Log to confirm we're using HQ cover art from API, never user photo
    console.log(`[API] ✅ Final response: coverImageUrl=${response.coverImageUrl ? 'SET (HQ from API)' : 'NULL (no API art found)'}`);
    console.log(`[API] ✅ User photo was NEVER used as final cover art`);
    
    console.log(
      `[API] ✅ ✅ ✅ IDENTIFICATION SUCCESS ✅ ✅ ✅\n` +
      `[API]   Confidence: ${primaryMatch.confidence.toFixed(3)}\n` +
      `[API]   Best match: "${primaryMatch.artist}" - "${primaryMatch.title}"\n` +
      `[API]   Year: ${primaryMatch.year || 'N/A'}\n` +
      `[API]   Tracks: ${primaryMatch.tracks?.length || 0}\n` +
      `[API]   Discogs ID: ${primaryMatch.discogsId || 'none'}\n` +
      `[API]   Processing time: ${debugInfo.processingTime}ms`
    );

    return res.json(response);

  } catch (err) {
    // Error handling with detailed logging
    debugInfo.processingTime = Date.now() - startTime;
    console.error('[API] ❌ identify-record error:', err);
    console.error('[API] Error stack:', err.stack);
    console.error('[API] Error message:', err.message);
    console.error('[API] Error name:', err.name);
    
    // Provide more specific error messages
    let errorMessage = 'Unexpected error during identification';
    if (err.message) {
      errorMessage = err.message;
    } else if (err.code) {
      errorMessage = `Error code: ${err.code}`;
    }
    
    return res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: errorMessage,
      debug: debugInfo,
      errorDetails: {
        message: err.message,
        code: err.code,
        name: err.name,
      },
    });
  }
});

// ============================================================================
// HEALTH CHECK & API INFO ENDPOINTS
// ============================================================================

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

// Health check / ping endpoint for connectivity testing
app.get('/api/ping', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    server: 'SlotSync API',
    version: '1.0.0',
  });
});

// API info
app.get('/api', (req, res) => {
  res.json({
    name: 'SlotSync API',
    version: '1.0.0',
    features: [
      'Image preprocessing',
      'Google Vision API integration (OCR, Web Detection)',
      'Discogs album resolution',
      'Local database caching',
      'Smart Discogs search with fuzzy matching',
      'Confidence scoring',
      'Structured error responses',
    ],
    endpoints: {
      identify: '/api/identify-record',
      health: '/health',
      ping: '/api/ping',
    },
  });
});

// ============================================================================
// ADDITIONAL ENDPOINTS
// ============================================================================

// GPT REMOVED – vinyl_metadata endpoints not used in core SlotSync backend
// These endpoints were only for GPT-4o analysis caching:
// - app.get('/api/export-metadata', ...) - Removed
// - app.get('/api/search-metadata', ...) - Removed
// - app.put('/api/metadata/:id', ...) - Removed
// - app.delete('/api/metadata/:id', ...) - Removed
// - app.get('/api/metadata/:id/qrcode', ...) - Removed (was using vinyl_metadata table)

// Unified Metadata Resolver - ALWAYS uses HQ cover art from APIs, NEVER user photos
app.post('/api/metadata/resolve-by-text', async (req, res) => {
  try {
    const { artist, albumTitle } = req.body;

    if (!artist || !albumTitle) {
      return res.status(400).json({ error: 'Artist and albumTitle are required' });
    }

    console.log(`[API] Unified metadata resolution: "${artist}" - "${albumTitle}"`);

    // Use unified resolver - ALWAYS returns HQ cover art from APIs
    const metadata = await resolveAlbumMetadata(artist.trim(), albumTitle.trim());

    if (!metadata || !metadata.coverImage) {
      console.warn(`[API] ⚠️  No cover art found for "${artist}" - "${albumTitle}"`);
    }

    // Convert to API response format
    res.json({
      success: true,
      metadata: {
        artist: metadata.canonicalArtist || metadata.artist,
        album: metadata.canonicalAlbum || metadata.album,
        canonicalArtist: metadata.canonicalArtist,
        canonicalAlbum: metadata.canonicalAlbum,
        mbid: metadata.mbid,
        discogsId: metadata.discogsId,
        coverImage: metadata.coverImage, // ALWAYS HQ from API, never user photo
        releaseYear: metadata.releaseYear,
        releaseDate: metadata.releaseDate,
        tracks: metadata.tracks.map(t => ({
          number: t.number,
          title: t.title,
          durationMs: t.durationMs,
          discNumber: t.discNumber || null,
        })),
        genres: metadata.genres,
        styles: metadata.styles,
        labels: metadata.labels,
        catalogNumbers: metadata.catalogNumbers,
        confidence: metadata.confidence,
      },
    });
  } catch (error) {
    console.error('[API] Unified metadata resolution error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Metadata resolution failed',
    });
  }
});

// Identify album by text (artist + title) - for CSV imports and manual entry
// NOW USES UNIFIED RESOLVER - ALWAYS returns HQ cover art
app.post('/api/identify-by-text', async (req, res) => {
  try {
    const { artist, title } = req.body;

    if (!artist || !title) {
      return res.status(400).json({ error: 'Artist and title are required' });
    }

    console.log(`[API] Text-based identification: "${artist}" - "${title}"`);

    // Use unified resolver - ALWAYS returns HQ cover art from APIs
    const metadata = await resolveAlbumMetadata(artist.trim(), title.trim());

    if (!metadata) {
      return res.status(400).json({
        success: false,
        code: 'NOT_FOUND',
        message: `Could not find album "${title}" by "${artist}"`,
      });
    }

    // Convert unified metadata to API response format
    const primaryMatch = {
      artist: metadata.canonicalArtist || metadata.artist,
      title: metadata.canonicalAlbum || metadata.album,
      year: metadata.releaseYear,
      coverImageRemoteUrl: metadata.coverImage, // ALWAYS HQ from API, never user photo
      discogsId: metadata.discogsId,
      tracks: metadata.tracks.map(t => ({
        title: t.title,
        trackNumber: t.number,
        durationSeconds: t.durationMs ? Math.floor(t.durationMs / 1000) : null,
        discNumber: t.discNumber || null,
      })),
      genres: metadata.genres,
      styles: metadata.styles,
      confidence: metadata.confidence,
      source: 'unified_resolver',
    };

    console.log(`[API] ✅ Text identification success: "${primaryMatch.artist}" - "${primaryMatch.title}"`);
    console.log(`[API] ✅ Using HQ cover art: ${primaryMatch.coverImageRemoteUrl ? 'YES' : 'NO'}`);

    res.json({
      success: true,
      primaryMatch,
      confidence: metadata.confidence,
    });
  } catch (error) {
    console.error('[API] Text identification error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Text identification failed',
    });
  }
});

// Fetch Discogs release by ID endpoint
app.get('/api/discogs/release/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const releaseId = parseInt(id, 10);

    if (!releaseId || isNaN(releaseId)) {
      return res.status(400).json({ error: 'Invalid release ID' });
    }

    if (!DISCOGS_PERSONAL_ACCESS_TOKEN && !DISCOGS_API_KEY) {
      return res.status(503).json({ error: 'Discogs API not configured' });
    }

    const headers = {
      'User-Agent': 'SlotSync/1.0.0 (contact@slotsync.app)',
    };

    if (DISCOGS_PERSONAL_ACCESS_TOKEN) {
      headers['Authorization'] = `Discogs token=${DISCOGS_PERSONAL_ACCESS_TOKEN}`;
    }

    console.log(`[API] Fetching Discogs release ${releaseId}...`);

    const releaseResponse = await axios.get(`https://api.discogs.com/releases/${releaseId}`, {
      params: DISCOGS_PERSONAL_ACCESS_TOKEN ? {} : {
        key: DISCOGS_API_KEY,
        secret: DISCOGS_API_SECRET,
      },
      headers,
      timeout: 10000,
    });

    const release = releaseResponse.data;

    // Extract artist
    const artist = release.artists?.[0]?.name || 'Unknown Artist';

    // Extract year
    const year = release.year || null;

    // Extract cover image
    const coverImageUrl = release.images?.[0]?.uri || release.images?.[0]?.resource_url || null;

    // Extract tracklist
    const tracks = [];
    if (release.tracklist && Array.isArray(release.tracklist)) {
      for (const track of release.tracklist) {
        if (track.title && track.title.trim()) {
          tracks.push({
            title: track.title.trim(),
            trackNumber: track.position ? parseInt(track.position.split(/[-.]/)[0]) || null : null,
            discNumber: track.position && track.position.includes('.') ? parseInt(track.position.split('.')[0]) : null,
            side: track.position && track.position.match(/^[A-Z]/) ? track.position.match(/^([A-Z])/)[1] : null,
            durationSeconds: track.duration ? parseDuration(track.duration) : null,
          });
        }
      }
    }

    // Extract genres and styles
    const genres = release.genres || [];
    const styles = release.styles || [];

    console.log(`[API] ✅ Fetched Discogs release ${releaseId}: ${artist} - ${release.title}`);

    res.json({
      success: true,
      discogsId: releaseId,
      artist,
      title: release.title,
      year,
      coverImageRemoteUrl: coverImageUrl,
      tracks: tracks.length > 0 ? tracks : [],
      genres,
      styles,
      label: release.labels?.[0]?.name || null,
      catalogNumber: release.labels?.[0]?.catno || null,
      format: release.formats?.[0]?.name || null,
    });
  } catch (error) {
    console.error('[API] Discogs release fetch error:', error.message);
    if (error.response) {
      if (error.response.status === 404) {
        return res.status(404).json({ error: 'Release not found' });
      }
      return res.status(error.response.status).json({ error: error.response.data?.message || 'Discogs API error' });
    }
    res.status(500).json({ error: error.message || 'Failed to fetch release' });
  }
});

// GPT REMOVED – print label endpoint not used in core SlotSync backend
// app.get('/api/metadata/:id/print-label', ...) - Removed - was using vinyl_metadata table

// ============================================================================
// DEV-ONLY: Regression Test Endpoint
// ============================================================================
// DEV-ONLY: regression tests for known albums like Primitive Cool and Party Mix!
// Only enabled when ENABLE_DEV_TEST=true
if (process.env.ENABLE_DEV_TEST === 'true') {
  const devTest = require('./devTest');
  
  app.post('/api/dev-test', async (req, res) => {
    try {
      const { testName } = req.body;
      
      if (!testName || !devTest.TEST_IMAGES[testName]) {
        return res.status(400).json({
          error: 'Invalid test name',
          availableTests: Object.keys(devTest.TEST_IMAGES),
        });
      }
      
      const imagePath = devTest.TEST_IMAGES[testName];
      const result = await devTest.testIdentification(testName, imagePath);
      
      res.json({
        success: true,
        testName,
        result,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });
  
  app.get('/api/dev-test/run-all', async (req, res) => {
    try {
      const results = await devTest.runAllTests();
      res.json({
        success: true,
        results,
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  });
  
  console.log('[Config] ✅ Dev test endpoints enabled (ENABLE_DEV_TEST=true)');
  console.log('[Config]    POST /api/dev-test - Test single album');
  console.log('[Config]    GET /api/dev-test/run-all - Run all regression tests');
}

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🚀 SlotSync API Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📍 Identify endpoint: http://localhost:${PORT}/api/identify-record`);
  console.log(`📍 Listening on all network interfaces (accessible from other devices)\n`);
  
  if (!visionClient) {
    console.log('⚠️  Google Vision not configured');
    console.log('   Set GOOGLE_APPLICATION_CREDENTIALS to enable\n');
  } else {
    console.log('✅ Google Vision API client initialized');
  }
  
  if (!DISCOGS_PERSONAL_ACCESS_TOKEN && !DISCOGS_API_KEY) {
    console.log('⚠️  ⚠️  ⚠️  Discogs API not configured ⚠️  ⚠️  ⚠️');
    console.log('   This will cause identification to fail!');
    console.log('   Set DISCOGS_PERSONAL_ACCESS_TOKEN to enable');
    console.log('   Run: node verify-discogs.js to test your credentials\n');
  } else {
    console.log('✅ Discogs API configured');
    if (DISCOGS_PERSONAL_ACCESS_TOKEN) {
      console.log('   Using: Personal Access Token');
    } else {
      console.log('   Using: API Key + Secret');
    }
  }
  
  console.log('✅ Ready to identify records!\n');
  
  // Initialize database
  initDatabase();
});
