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

// ============================================================================
// CRITICAL: Load environment variables FIRST, before any other imports
// ============================================================================
const path = require('path');
const fs = require('fs');

// ============================================================================
// Logger Utility (import early for use throughout)
// ============================================================================
const logger = require('./services/logger');

// ============================================================================
// Load .env file FIRST (before config module) to ensure .env values override shell env vars
// ============================================================================
// IMPORTANT: Load dotenv BEFORE requiring config so .env file values take precedence
const dotenv = require('dotenv');
const backendEnvPath = path.resolve(__dirname, '.env');
const rootEnvPath = path.resolve(__dirname, '..', '.env');

if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath, override: true }); // override: true ensures .env file wins over shell env vars
  console.log('[Config] ✅ Loaded .env from backend-example/.env (override: true)');
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath, override: true }); // override: true ensures .env file wins over shell env vars
  console.log('[Config] ✅ Loaded .env from repo root (override: true)');
} else {
  console.log('[Config] ℹ️  No .env file found (using environment variables only)');
}

// ============================================================================
// Configuration (import AFTER dotenv is loaded - centralizes all env vars)
// ============================================================================
const config = require('./config');

// ============================================================================
// Utility Functions
// ============================================================================
/**
 * Safely format a number to fixed decimal places, returning 'n/a' if invalid
 * Used for logging/display strings only - does NOT change JSON numeric values
 * @param {number|undefined|null} value - Number to format
 * @param {number} digits - Number of decimal places (default: 3)
 * @returns {string} Formatted string or 'n/a' if invalid
 */
function safeToFixed(value, digits = 3) {
  return (typeof value === 'number' && Number.isFinite(value)) ? value.toFixed(digits) : 'n/a';
}

// ============================================================================
// Google Vision Credentials Validation
// ============================================================================
/**
 * Validate Google Cloud service account credentials JSON file
 * @param {string} credPath - Absolute path to credentials JSON file
 * @returns {{ok: boolean, reason?: string, details?: {projectId?: string, clientEmailDomain?: string, path: string}}}
 */
function validateGoogleCredentials(credPath) {
  try {
    if (!fs.existsSync(credPath)) {
      return { ok: false, reason: 'File does not exist' };
    }
    
    if (!fs.statSync(credPath).isFile()) {
      return { ok: false, reason: 'Path is not a file' };
    }
    
    // Read and parse JSON
    const fileContent = fs.readFileSync(credPath, 'utf8');
    let creds;
    try {
      creds = JSON.parse(fileContent);
    } catch (parseError) {
      return { ok: false, reason: `Invalid JSON: ${parseError.message}` };
    }
    
    // Validate it looks like a service account key
    const hasServiceAccountType = creds.type === 'service_account';
    const hasClientEmail = typeof creds.client_email === 'string' && creds.client_email.length > 0;
    const hasPrivateKey = typeof creds.private_key === 'string' && creds.private_key.length > 0;
    
    if (!hasServiceAccountType && !(hasClientEmail && hasPrivateKey)) {
      return { ok: false, reason: 'Does not appear to be a service account key (missing type="service_account" or client_email/private_key)' };
    }
    
    // Extract sanitized details
    const details = {
      path: credPath,
      projectId: creds.project_id || null,
      clientEmailDomain: creds.client_email ? creds.client_email.split('@')[1] || null : null,
    };
    
    // Log minimal details (no secrets, no project IDs, no email domains)
    logger.info(`[Config] ✅ Validated Google credentials from: ${path.basename(credPath)}`);
    
    return { ok: true, details };
  } catch (error) {
    return { ok: false, reason: `Validation error: ${error.message}` };
  }
}

// ============================================================================
// Validate Google Vision credentials (using config module)
// ============================================================================
let validatedCredentialsPath = null;
let credentialsValidationResult = null;

if (config.googleVision.credentialsPath) {
  // Validate credentials
  credentialsValidationResult = validateGoogleCredentials(config.googleVision.credentialsPath);
  if (credentialsValidationResult.ok) {
    validatedCredentialsPath = config.googleVision.credentialsPath;
  } else {
    logger.warn(`[Config] ⚠️  Credentials file found but validation failed: ${credentialsValidationResult.reason}`);
    logger.warn(`[Config]    Google Vision API may not work correctly`);
  }
} else {
  logger.warn('[Config] ⚠️  GOOGLE_APPLICATION_CREDENTIALS not set and no credentials.json found');
  logger.warn('[Config]    Google Vision API will not be available');
}

// ============================================================================
// Now safe to import modules that may use Google Cloud
// ============================================================================
const express = require('express');
const multer = require('multer');
// cors is now imported via middleware/cors.js
const axios = require('axios');
// Import Vision client - but initialize lazily after env is set
let ImageAnnotatorClient = null;
try {
  ImageAnnotatorClient = require('@google-cloud/vision').ImageAnnotatorClient;
} catch (error) {
  logger.warn('[Config] ⚠️  Could not load @google-cloud/vision:', error.message);
}
const sqlite3 = require('sqlite3').verbose();
// path already required at top of file
const visionExtractor = require('./services/visionExtractor');
const {
  searchReleaseByArtistAndTitle,
  getReleaseDetailsWithTracks,
  getCoverArtUrlForRelease,
} = require('./services/musicbrainzService');

// NEW: Enhanced identification modules
const { getImageEmbedding } = require('./services/embeddingService');
const { initialize: initializeVectorIndex, indexCoverEmbedding, findNearestCovers, getEmbeddingCount } = require('./services/vectorIndex');
const { initializeEmbeddingModel } = require('./services/embeddingService');
const { parseArtistAndAlbum } = require('./services/ocrParser');
const createIdentifyRecordRoute = require('./routes/identifyRecord');
const { filterWebNoise, filterWebEntities } = require('./services/webNoiseFilter');
const { 
  scoreAndSortReleases, 
  selectBestFromGroups, 
  determineResponseType,
  AUTO_ACCEPT_THRESHOLD,
  SUGGESTIONS_THRESHOLD,
} = require('./services/discogsScoring');
const { logFeedback, getFeedback, initFeedbackRepository } = require('./services/feedbackRepository');
const { similarityScore, normalizeForSearch, levenshteinDistance } = require('./services/similarityUtils');

// const imageEmbedding = require('./services/imageEmbedding');
// const embeddingDatabase = require('./services/embeddingDatabase');

const app = express();
const PORT = config.server.port;

// Configuration - Discogs token (accept multiple env var names)
const DISCOGS_PERSONAL_ACCESS_TOKEN = config.discogs.personalAccessToken;
const DISCOGS_API_KEY = config.discogs.apiKey;
const DISCOGS_API_SECRET = config.discogs.apiSecret;
const DB_PATH = config.database.path;

// Log Discogs token presence (no secrets, no lengths, no prefixes)
if (DISCOGS_PERSONAL_ACCESS_TOKEN) {
  logger.info(`[Config] ✅ Discogs token configured`);
} else if (DISCOGS_API_KEY) {
  logger.info(`[Config] ✅ Discogs API key configured`);
} else {
  logger.warn('[Config] ⚠️  Discogs token not found in environment');
}

// ============================================================================
// Discogs Self-Test (optional, enabled via DISCOGS_SELF_TEST=true)
// ============================================================================
if (config.discogs.selfTest) {
  (async () => {
    try {
      if (!DISCOGS_PERSONAL_ACCESS_TOKEN && !DISCOGS_API_KEY) {
        logger.warn('[Discogs] ⚠️  Self-test skipped: No Discogs token configured');
        return;
      }
      
      logger.info('[Discogs] 🧪 Running startup self-test...');
      const headers = {
        'User-Agent': 'SlotSync/1.0.0 (contact@slotsync.app)',
      };
      
      if (DISCOGS_PERSONAL_ACCESS_TOKEN) {
        headers['Authorization'] = `Discogs token=${DISCOGS_PERSONAL_ACCESS_TOKEN}`;
      }
      
      // Use a cheap endpoint for self-test
      const response = await axios.get('https://api.discogs.com/oauth/identity', {
        headers,
        timeout: 5000,
        validateStatus: (status) => status < 500, // Accept 401, don't throw
      });
      
      if (response.status === 200) {
        logger.info('[Discogs] ✅ Self-test passed: Token is valid');
      } else if (response.status === 401) {
        logger.error('[Discogs] ❌ Self-test failed: Token is invalid (401 Unauthorized)');
        logger.error('[Discogs] ❌ Generate a Discogs personal access token from Settings > Developers');
        logger.error('[Discogs] ❌ Ensure it is set in DISCOGS_PERSONAL_ACCESS_TOKEN environment variable');
      } else {
        logger.warn(`[Discogs] ⚠️  Self-test returned status ${response.status} (non-fatal)`);
      }
    } catch (error) {
      logger.warn(`[Discogs] ⚠️  Self-test failed (non-fatal): ${error.message}`);
    }
  })();
}

// ============================================================================
// Timeout Helper for Preventing Silent Hangs
// ============================================================================
/**
 * B) Generic withTimeout helper
 * Bulletproof implementation: prevents timeout callbacks from firing after promise resolves
 * 
 * Uses a finished flag to prevent race conditions where timeout fires after promise settles.
 * This ensures no orphaned timers or phantom timeouts that poison the request lifecycle.
 * 
 * @param {Promise} promise - Promise to wrap
 * @param {number} ms - Timeout in milliseconds
 * @param {string} label - Label for logging (e.g., "embedding", "vision", "discogs")
 * @param {string} reqId - Request ID for logging context
 * @returns {Promise} Promise that rejects with Error(`TIMEOUT:${label}:${ms}`) if exceeded
 */
function withTimeout(promise, ms, label, reqId = 'N/A') {
  let timeoutId;
  let finished = false;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      if (finished) return;

      const err = new Error(`Timeout in ${label} after ${ms}ms`);
      err.code = 'ETIMEDOUT';
      err.label = label;
      if (reqId) err.reqId = reqId;
      
      logger.warn(`[REQ ${reqId}] TIMEOUT ${label} after ${ms}ms`);
      reject(err);
    }, ms);
  });

  return Promise.race([promise, timeoutPromise])
    .then((result) => {
      finished = true;
      return result;
    })
    .finally(() => {
      finished = true;
      if (timeoutId) clearTimeout(timeoutId);
    });
}

// ============================================================================
// Shared Discogs HTTP Helper with AbortController (Lowest Network Layer)
// ============================================================================
// Shared Discogs HTTP Client (imported from shared module)
// ============================================================================
const { discogsHttpRequest } = require('./services/discogsHttpClient');

/**
 * D) Heartbeat log helper for long-running steps
 * Logs a warning if step takes >5s
 */
function logHeartbeat(reqId, label, startTime, threshold = 5000) {
  const elapsed = Date.now() - startTime;
  if (elapsed > threshold) {
    logger.warn(`[REQ ${reqId}] ⚠️  HEARTBEAT ${label} still running after ${elapsed}ms`);
  }
}

// ============================================================================
// Phase 2A+: Visual-First Decision Policy Configuration
// ============================================================================
// Strong accept: treat embedding match as final (no OCR override)
const STRONG_ACCEPT_THRESHOLD = config.scoring.strongAcceptThreshold;
const STRONG_ACCEPT_MARGIN = config.scoring.strongAcceptMargin;
// Skip Vision: proceed without Vision API (but allow OCR to refine if needed)
const SKIP_VISION_EMBEDDING_THRESHOLD = config.scoring.skipVisionEmbeddingThreshold;
const SKIP_VISION_MARGIN_THRESHOLD = config.scoring.skipVisionMarginThreshold;
// Dataset size guardrail (cold start protection)
const MIN_EMBEDDING_DATASET_SIZE = config.embedding.minDatasetSize;

// ============================================================================
// Phase 2A+: Visual-First Decision Policy
// ============================================================================

/**
 * Decides Vision API strategy based on embedding similarity results.
 * 
 * Three-tier decision system:
 * 1. ACCEPT_EMBEDDING_FINAL: Treat top embedding match as final (no OCR override)
 * 2. SKIP_VISION: Proceed without Vision API (but allow OCR to refine if needed)
 * 3. RUN_VISION: Run Vision OCR/web entities for disambiguation
 * 
 * @param {Object} params
 * @param {Array} params.embeddingMatches - Ordered best→worst embedding matches
 * @param {number} params.datasetSize - Number of indexed cover embeddings
 * @param {boolean} params.hasValidIndex - Ensure we used the correct album cover index
 * @param {boolean} params.enableVision - Environment toggle for Vision API
 * @param {Object} params.thresholds - Threshold configuration
 * @returns {Object} Decision result with reason and metadata
 */
function decideVisionStrategy({
  embeddingMatches = [],
  datasetSize = 0,
  hasValidIndex = true,
  enableVision = true,
  thresholds = {}
}) {
  const {
    strongAccept = STRONG_ACCEPT_THRESHOLD,
    strongAcceptMargin = STRONG_ACCEPT_MARGIN,
    skipVision = SKIP_VISION_EMBEDDING_THRESHOLD,
    margin = SKIP_VISION_MARGIN_THRESHOLD,
    minDatasetSize = MIN_EMBEDDING_DATASET_SIZE
  } = thresholds;

  // Guardrail: Never skip Vision if embeddingMatches is empty
  if (embeddingMatches.length === 0) {
    return {
      decision: 'RUN_VISION',
      reason: 'no_embedding_matches',
      top1: { similarity: 0, discogsId: null, recordId: null },
      top2: null,
      margin: null
    };
  }

  const topMatch = embeddingMatches[0];
  const top1Similarity = topMatch.similarity;
  const top1Id = topMatch.discogsId || topMatch.recordId || topMatch.metadata?.discogsId || topMatch.metadata?.recordId || null;
  
  // Guardrail: Never skip Vision if top1 has no valid discogsId/recordId
  const hasValidId = !!(topMatch.discogsId || topMatch.recordId || topMatch.metadata?.discogsId || topMatch.metadata?.recordId);
  if (!hasValidId) {
    return {
      decision: 'RUN_VISION',
      reason: 'no_valid_id',
      top1: { similarity: top1Similarity, discogsId: null, recordId: null },
      top2: null,
      margin: null
    };
  }

  // Guardrail: Never skip Vision if dataset is too small (cold start)
  const isColdStart = datasetSize < minDatasetSize;
  if (isColdStart) {
    return {
      decision: 'RUN_VISION',
      reason: `cold_start_dataset_size_${datasetSize}_<_${minDatasetSize}`,
      top1: { similarity: top1Similarity, discogsId: top1Id, recordId: top1Id },
      top2: null,
      margin: null
    };
  }

  // Guardrail: Ensure valid index was used
  if (!hasValidIndex) {
    return {
      decision: 'RUN_VISION',
      reason: 'invalid_index',
      top1: { similarity: top1Similarity, discogsId: top1Id, recordId: top1Id },
      top2: null,
      margin: null
    };
  }

  // Get top2 for margin check
  const top2Match = embeddingMatches.length > 1 ? embeddingMatches[1] : null;
  const top2Similarity = top2Match ? top2Match.similarity : null;
  const calculatedMargin = top2Similarity !== null ? (top1Similarity - top2Similarity) : null;
  const marginUnavailable = calculatedMargin === null;

  // Check if margin requirement is met (if margin check is enabled)
  // If margin is unavailable (no top2), only allow if margin threshold is disabled (<= 0)
  // Otherwise, require calculatedMargin >= threshold
  const marginCheck = margin <= 0 || (marginUnavailable ? false : calculatedMargin >= margin);
  const strongMarginCheck = strongAcceptMargin <= 0 || (marginUnavailable ? false : calculatedMargin >= strongAcceptMargin);

  // Decision 1: STRONG_ACCEPT (treat as final, no OCR override)
  if (top1Similarity >= strongAccept && strongMarginCheck && hasValidId && !isColdStart) {
    return {
      decision: 'ACCEPT_EMBEDDING_FINAL',
      reason: `strong_accept_similarity_${top1Similarity.toFixed(3)}_margin_${calculatedMargin !== null ? calculatedMargin.toFixed(3) : 'N/A'}`,
      top1: { similarity: top1Similarity, discogsId: top1Id, recordId: top1Id },
      top2: top2Similarity !== null ? { similarity: top2Similarity } : null,
      margin: calculatedMargin,
      marginUnavailable: marginUnavailable
    };
  }

  // Decision 2: SKIP_VISION (proceed without Vision, but allow OCR refinement)
  if (top1Similarity >= skipVision && marginCheck && hasValidId && !isColdStart && enableVision) {
    return {
      decision: 'SKIP_VISION',
      reason: `skip_vision_similarity_${top1Similarity.toFixed(3)}_margin_${calculatedMargin !== null ? calculatedMargin.toFixed(3) : 'N/A'}`,
      top1: { similarity: top1Similarity, discogsId: top1Id, recordId: top1Id },
      top2: top2Similarity !== null ? { similarity: top2Similarity } : null,
      margin: calculatedMargin,
      marginUnavailable: marginUnavailable
    };
  }

  // Decision 3: RUN_VISION (fallback)
  const reasons = [];
  if (top1Similarity < skipVision) reasons.push(`similarity_${top1Similarity.toFixed(3)}_<_${skipVision}`);
  if (!marginCheck && margin > 0) {
    if (marginUnavailable) {
      reasons.push(`margin_unavailable`);
    } else {
      reasons.push(`margin_${calculatedMargin.toFixed(3)}_<_${margin}`);
    }
  }
  if (!hasValidId) reasons.push('no_valid_id');
  if (isColdStart) reasons.push(`cold_start_dataset_${datasetSize}_<_${minDatasetSize}`);
  if (!enableVision) reasons.push('vision_disabled');

  return {
    decision: 'RUN_VISION',
    reason: reasons.length > 0 ? reasons.join('_') : 'default_fallback',
    skipReasons: reasons, // Explicit array for logging
    top1: { similarity: top1Similarity, discogsId: top1Id, recordId: top1Id },
    top2: top2Similarity !== null ? { similarity: top2Similarity } : null,
    margin: calculatedMargin,
    marginUnavailable: marginUnavailable
  };
}

// ============================================================================
// GLOBAL CACHE WITH TTL AND SIZE LIMITS (for Discogs API responses)
// ============================================================================
// Global cache for Discogs release fetches (to avoid repeated API calls)
const globalDiscogsCache = new Map(); // discogsId -> { data, timestamp }
const MAX_CACHE_SIZE = 1000;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Global cache for Discogs search results (optional, helps CSV imports)
const globalSearchCache = new Map(); // normalized "artist|title" -> { data, timestamp }
const SEARCH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cleanup old cache entries periodically
function cleanupCache() {
  const now = Date.now();
  let cleaned = 0;
  
  // Cleanup release cache
  for (const [key, value] of globalDiscogsCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      globalDiscogsCache.delete(key);
      cleaned++;
    }
  }
  
  // Cleanup search cache
  for (const [key, value] of globalSearchCache.entries()) {
    if (now - value.timestamp > SEARCH_CACHE_TTL) {
      globalSearchCache.delete(key);
      cleaned++;
    }
  }
  
  // Enforce size limit on release cache (LRU: remove oldest if over limit)
  if (globalDiscogsCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(globalDiscogsCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, globalDiscogsCache.size - MAX_CACHE_SIZE);
    for (const [key] of toRemove) {
      globalDiscogsCache.delete(key);
    }
    cleaned += toRemove.length;
  }
  
  if (cleaned > 0 && config.logging.debugCache) {
    logger.debug(`[Cache] 🧹 Cleaned ${cleaned} expired entries (release: ${globalDiscogsCache.size}, search: ${globalSearchCache.size})`);
  }
}

// Cache cleanup interval - only start when running as main module (not in tests)
let cacheCleanupInterval = null;

// Initialize Local Database
let db = null;
const initDatabase = () => {
  return new Promise((resolve, reject) => {
    const database = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        logger.error('❌ Database error:', err.message);
        reject(err);
        return;
      }
      logger.info('✅ Connected to local database');
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
        logger.error('❌ Table creation error:', err.message);
        reject(err);
        return;
      }
      
      // NEW: Create embeddings table for vector search
      database.run(`
        CREATE TABLE IF NOT EXISTS cover_embeddings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          record_id TEXT,
          discogs_id TEXT,
          embedding_vector TEXT NOT NULL,
          artist TEXT,
          title TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(record_id, discogs_id)
        )
      `, (err) => {
        if (err) {
          logger.warn('⚠️  Embeddings table creation warning:', err.message);
        } else {
          logger.info('✅ Embeddings table ready');
        }
        
        // Initialize feedback repository
        initFeedbackRepository(database).then(() => {
          logger.info('✅ Database tables ready (identified_records, cover_embeddings, identification_feedback)');
          resolve(database);
        }).catch((feedbackErr) => {
          logger.warn('⚠️  Feedback repository init warning:', feedbackErr.message);
          logger.info('✅ Database tables ready (identified_records, cover_embeddings)');
          resolve(database);
        });
      });
    });
  });
};

// Initialize runtime (database, vector index, cache cleanup) - only when running as server
function initializeRuntime() {
  // PR2: Initialize new cache cleanup
  const { cleanupCaches } = require('./src/services/cache/identificationCache');
  
  // Start cache cleanup interval (only if not already started)
  if (!cacheCleanupInterval && !config.IS_TEST) {
    cacheCleanupInterval = setInterval(() => {
      cleanupCache(); // Legacy cache cleanup
      cleanupCaches(); // PR2: New cache cleanup
    }, 5 * 60 * 1000);
    
    // Run initial cleanup on startup
    cleanupCaches();
  }
  
  // Initialize database and vector index
  initDatabase()
    .then(async (database) => {
      db = database;
      // Initialize vector index by loading embeddings from database
      try {
        const loadedCount = await initializeVectorIndex(database);
        logger.info(`[Server] ✅ Vector index initialized with ${loadedCount} embeddings`);
      } catch (err) {
        logger.warn('[Server] ⚠️  Failed to initialize vector index:', err.message);
      }
      
      // Preload CLIP model to eliminate cold start delay
      try {
        await initializeEmbeddingModel();
      } catch (err) {
        logger.warn('[Server] ⚠️  Failed to preload embedding model:', err.message);
        // Don't block server startup - CLIP will load lazily on first use
      }
      
      // Create identify record route after db is initialized
      createIdentifyRecordRouteHandler();
    })
    .catch((err) => {
      logger.error('Failed to initialize database:', err);
    });
}

// NOTE: initializeRuntime() is called inside app.listen() callback (line ~4758)
// to ensure it only runs once when the server starts, not at module load time

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
// Legacy confidence threshold (kept for backward compatibility)
const CONFIDENCE_THRESHOLD = config.scoring.confidenceThreshold;
logger.info(`[Config] ⚙️  Legacy confidence threshold: ${CONFIDENCE_THRESHOLD} (set CONFIDENCE_THRESHOLD env var to change)`);
logger.info(`[Config] ⚙️  New dual thresholds: AUTO_ACCEPT=${AUTO_ACCEPT_THRESHOLD}, SUGGESTIONS=${SUGGESTIONS_THRESHOLD}`);

// ============================================================================
// PRODUCTION SAFETY: Rate Limiting
// ============================================================================
// ============================================================================
// Middleware: Rate Limiting
// ============================================================================
const { apiLimiter, identifyRecordLimiter } = require('./middleware/rateLimit');
const { slotsyncApiKey } = require('./middleware/apiKey');

// Apply general API limiter to all /api/ routes
app.use('/api/', apiLimiter);
// Optional shared key for private beta (no-op if SLOTSYNC_API_KEY unset)
app.use('/api/', slotsyncApiKey);

// ============================================================================
// Middleware: CORS Configuration
// ============================================================================
const { getCorsConfig } = require('./middleware/cors');
app.use(getCorsConfig());

// ============================================================================
// PRODUCTION SAFETY: Body Size Limits
// ============================================================================
// Limit JSON and URL-encoded body sizes to prevent DoS attacks
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Initialize Google Vision client (lazy - only when needed)
let visionClient = null;
let visionClientInitialized = false;
let visionClientInitError = null;

function getVisionClient() {
  if (visionClientInitialized) {
    return visionClient;
  }
  
  visionClientInitialized = true;
  
  if (!ImageAnnotatorClient) {
    visionClientInitError = '@google-cloud/vision library not available';
    logger.warn('[Vision] ⚠️  @google-cloud/vision not available');
    return null;
  }
  
    const credPath = validatedCredentialsPath || config.googleVision.credentialsPath;
  
  if (!credPath) {
    visionClientInitError = 'GOOGLE_APPLICATION_CREDENTIALS not set and no validated credentials found';
    logger.warn('[Vision] ⚠️  GOOGLE_APPLICATION_CREDENTIALS not set');
    return null;
  }
  
  // If we validated credentials earlier and they failed, log the reason
  if (credentialsValidationResult && !credentialsValidationResult.ok) {
    visionClientInitError = `Credentials validation failed: ${credentialsValidationResult.reason}`;
    logger.warn(`[Vision] ⚠️  Credentials validation failed earlier: ${credentialsValidationResult.reason}`);
    logger.warn('[Vision] ⚠️  Attempting to initialize anyway, but may fail');
  }
  
  try {
    // Use explicit keyFilename to avoid "default credentials" resolution issues
    const absPath = path.resolve(credPath);
    visionClient = new ImageAnnotatorClient({ keyFilename: absPath });
    logger.info('[Vision] ✅ Google Vision API client initialized');
    visionClientInitError = null; // Clear any previous errors on success
    return visionClient;
  } catch (error) {
    visionClientInitError = error.message;
    logger.warn('[Vision] ⚠️  Failed to initialize Google Vision client:', error.message);
    if (error.message.includes('default credentials') || error.message.includes('Could not load')) {
      logger.warn('[Vision] ⚠️  This error usually means the credentials file path is wrong or the file is invalid');
      logger.warn(`[Vision] ⚠️  Attempted path: ${credPath}`);
    }
    return null;
  }
}

// Database initialization moved to initializeRuntime() - only runs when require.main === module

// Configure multer for file uploads (disk storage to reduce memory pressure)
// Store temp files in backend-example/temp directory
const tempUploadDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempUploadDir)) {
  fs.mkdirSync(tempUploadDir, { recursive: true });
  logger.debug(`[Config] ✅ Created temp upload directory: ${tempUploadDir}`);
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      cb(null, tempUploadDir);
    },
    filename: (req, file, cb) => {
      // Generate unique filename: timestamp-random.ext
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `upload-${uniqueSuffix}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max (PR0: hardened upload limit)
  fileFilter: (req, file, cb) => {
    // PR0: Support JPEG, PNG, GIF, WebP, HEIC/HEIF
    const allowedTypes = /jpeg|jpg|png|gif|webp|heic|heif/i;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (mimetype && extname) {
      return cb(null, true);
    }
    cb(new Error('Only image files are allowed (JPEG, PNG, GIF, WebP, HEIC)'));
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

// generateImageHash moved to utils/imageHash.js - imported below

// similarityScore, normalizeForSearch, and levenshteinDistance are now imported from similarityUtils.js
// (removed local definitions to avoid circular dependency)

// Text processing utilities (extracted to utils for testing)
const {
  normalizeText,
  cleanEcommerceText,
  cleanNoiseTokens,
  extractCandidates,
  isValidCandidate,
  key,
} = require('./utils/textUtils');

// Image hash utility (extracted to utils for testing)
const { generateImageHash } = require('./utils/imageHash');

// OLD: Function definitions removed - now imported from utils/textUtils.js and utils/imageHash.js
// The following functions were moved to enable unit testing:
// - cleanEcommerceText
// - normalizeText
// - cleanNoiseTokens
// - generateImageHash
// - extractCandidates
// - isValidCandidate
// - key

// cleanEcommerceText moved to utils/textUtils.js - imported above

/**
 * Clean Discogs artist name by removing disambiguation numbers
 * Discogs adds numbers like "(8)" or "(2)" to distinguish artists with the same name
 * Example: "Whitney (8)" -> "Whitney", "James Taylor (2)" -> "James Taylor"
 * 
 * @param {string} artistName - Artist name from Discogs
 * @returns {string} Cleaned artist name without disambiguation numbers
 */
function cleanDiscogsArtistName(artistName) {
  if (!artistName || typeof artistName !== 'string') return artistName || '';
  // Remove pattern: "Artist Name (number)" where number is 1-999
  // Matches: "Whitney (8)", "James Taylor (2)", "Prince (1)"
  // Does NOT match: "Album Title (Remastered)" or "Song (Live)"
  return artistName.replace(/\s*\(\d{1,3}\)\s*$/, '').trim();
}

// normalizeText moved to utils/textUtils.js - imported above

// normalizeForSearch is now imported from similarityUtils.js
// (removed local definition to avoid circular dependency)

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

// extractCandidates moved to utils/textUtils.js - imported above

// cleanNoiseTokens moved to utils/textUtils.js - imported above

// isValidCandidate and key moved to utils/textUtils.js - imported above

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
  const client = getVisionClient();
  if (!client) {
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
    logger.debug('[Google Vision] Performing comprehensive analysis...');

    // Request all features simultaneously
    const [batchResult] = await client.batchAnnotateImages({
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
      logger.warn('[Google Vision] No response from API');
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
    logger.debug(`[Google Vision] 📊 Vision API Response Summary:`);
    logger.debug(`[Google Vision]   - Web entities: ${result.webEntities?.length || 0}`);
    logger.debug(`[Google Vision]   - Page titles: ${result.pageTitles?.length || 0}`);
    logger.debug(`[Google Vision]   - Similar images: ${result.similarImageUrls?.length || 0}`);
    logger.debug(`[Google Vision]   - Labels: ${result.labels?.length || 0}`);
    logger.debug(`[Google Vision]   - OCR text length: ${result.extractedText?.length || 0} chars`);
    logger.debug(`[Google Vision]   - OCR text blocks: ${result.ocrTextBlocks?.length || 0}`);
    
    if (result.rawVisionResponse) {
      logger.debug(`[Google Vision] 📊 Detailed response:`, JSON.stringify(result.rawVisionResponse, null, 2));
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
      
      logger.debug('[Google Vision] Raw OCR text (first 500 chars):', rawText.substring(0, 500));
      logger.debug('[Google Vision] Normalized text (first 300 chars):', result.extractedText.substring(0, 300));
      logger.debug('[Google Vision] OCR text blocks:', result.ocrTextBlocks.length);
      
      // Log if text appears to be all caps (common on album covers)
      const upperCount = (result.extractedText.match(/[A-Z]/g) || []).length;
      const lowerCount = (result.extractedText.match(/[a-z]/g) || []).length;
      if (upperCount > lowerCount * 2) {
        logger.debug('[Google Vision] ⚠️  Text appears to be ALL CAPS - will use enhanced all-caps detection');
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
    logger.debug(`[Google Vision] 🎯 Candidate Extraction Summary:`);
    logger.debug(`[Google Vision]   Total candidates: ${result.candidates.length}`);
    
    if (result.candidates.length > 0) {
      logger.debug(`[Google Vision] 📋 All candidates (sorted by confidence):`);
      result.candidates.forEach((c, idx) => {
        logger.debug(`  ${idx + 1}. "${c.artist}" - "${c.title}"`);
        logger.debug(`     Confidence: ${c.confidence.toFixed(3)}, Source: ${c.source}`);
      });
      
      logger.debug(`[Google Vision] 🏆 Top 3 candidates:`);
      result.candidates.slice(0, 3).forEach((c, idx) => {
        logger.debug(`  ${idx + 1}. "${c.artist}" - "${c.title}" (${c.confidence.toFixed(3)}, ${c.source})`);
      });
    } else {
      logger.warn(`[Google Vision] ⚠️  No candidates extracted! This may indicate:`);
      logger.warn(`[Google Vision]   - Poor image quality`);
      logger.warn(`[Google Vision]   - No text visible on cover`);
      logger.warn(`[Google Vision]   - Vision API returned no useful data`);
    }

    return result;
  } catch (error) {
    logger.error('[Google Vision] Error:', error.message);
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
    logger.warn('[Discogs] ⚠️  Discogs not configured, cannot search by barcode');
    return null;
  }

  try {
    logger.debug(`[Discogs] 🔍 Searching by barcode: ${barcode}`);
    
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

    // Use shared Discogs HTTP helper with AbortController (lowest network layer)
    const DISCOGS_SEARCH_TIMEOUT_MS = config.discogs.searchTimeoutMs;
    const searchUrl = 'https://api.discogs.com/database/search';
    const responseData = await discogsHttpRequest(
      searchUrl,
      {
        params,
        headers,
      },
      {
        timeoutMs: DISCOGS_SEARCH_TIMEOUT_MS,
        reqId: 'N/A',
        op: 'barcode_search',
        meta: { barcode }
      }
    );

    // Safely handle undefined or missing results array
    const results = (responseData && responseData.results) ? responseData.results : [];
    if (!results.length) {
      logger.debug(`[Discogs] ❌ No results for barcode ${barcode}`);
      return null;
    }

    logger.debug(`[Discogs] ✅ Found ${results.length} result(s) for barcode ${barcode}`);
    
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
      
      // Use shared Discogs HTTP helper with AbortController (lowest network layer)
      const DISCOGS_FETCH_TIMEOUT_MS = config.discogs.fetchTimeoutMs;
      const release = await discogsHttpRequest(
        releaseUrl,
        {
          params: DISCOGS_PERSONAL_ACCESS_TOKEN ? {} : {
            key: DISCOGS_API_KEY,
            secret: DISCOGS_API_SECRET,
          },
          headers: releaseHeaders,
        },
        {
          timeoutMs: DISCOGS_FETCH_TIMEOUT_MS,
          reqId: 'N/A',
          op: 'barcode_release_fetch',
          meta: { discogsId: top.id }
        }
      );
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
        logger.debug(`[Discogs] ✅ Extracted ${tracks.length} tracks from barcode match`);
      }
      
      // Extract genres and styles for better metadata
      const genres = release.genres && Array.isArray(release.genres) ? release.genres : [];
      const styles = release.styles && Array.isArray(release.styles) ? release.styles : [];
      
      if (genres.length > 0) {
        logger.debug(`[Discogs] ✅ Extracted genres: ${genres.join(', ')}`);
      }
      if (styles.length > 0) {
        logger.debug(`[Discogs] ✅ Extracted styles: ${styles.join(', ')}`);
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
      logger.warn(`[Discogs] ⚠️  Could not fetch full release details: ${releaseError.message}`);
      if (releaseError.response && releaseError.response.status === 401) {
        logger.error(`[Discogs] ❌ Discogs 401: token invalid. Generate a Discogs personal access token from Settings > Developers and ensure it's in DISCOGS_PERSONAL_ACCESS_TOKEN.`);
      }
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
    logger.error('[Discogs] ❌ Barcode search failed:', err.message);
    if (err.response) {
      logger.error('[Discogs] Response status:', err.response.status);
      if (err.response.status === 401) {
        logger.error(`[Discogs] ❌ Discogs 401: token invalid. Generate a Discogs personal access token from Settings > Developers and ensure it's in DISCOGS_PERSONAL_ACCESS_TOKEN.`);
      } else if (err.response.data) {
        logger.error('[Discogs] Response data:', err.response.data);
      }
    }
    return null;
  }
}

/**
 * Enhanced Discogs search with fuzzy matching and confidence scoring
 * Returns detailed logging information for debugging
 */
async function searchDiscogsEnhanced(artist, title, logQueries = true, imageBuffer = null, reqId = 'N/A', parentSignal = null) {
  if (!DISCOGS_PERSONAL_ACCESS_TOKEN && !DISCOGS_API_KEY) {
    return { 
      bestMatch: null, 
      alternates: [], 
      allResults: [],
      searchLog: []
    };
  }

  // PR2: Check Cache C (normalized artist|title -> search results)
  const { getDiscogsSearchCache, setDiscogsSearchCache } = require('./src/services/cache/identificationCache');
  const cachedSearch = getDiscogsSearchCache(artist, title);
  if (cachedSearch) {
    logger.debug(`[Discogs] ✅ Cache C HIT for "${artist}" - "${title}"`);
    return cachedSearch;
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

  logger.debug(`[Discogs] 🔍 Starting Discogs search...`);
  logger.debug(`[Discogs] 🔍 Artist: "${artist}"`);
  logger.debug(`[Discogs] 🔍 Title: "${title}"`);
  logger.info(`[Discogs] 🔍 Generated ${queries.length} query variations`);

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
        logger.debug(`[Discogs]   Query ${searchLog.length + 1}/${queries.length}: "${query}"`);
      }

      // Use shared Discogs HTTP helper with AbortController (lowest network layer)
      const DISCOGS_TIMEOUT_MS = config.discogs.searchTimeoutMs;
      const searchUrl = 'https://api.discogs.com/database/search';
      const responseData = await discogsHttpRequest(
        searchUrl,
        {
          params,
          headers,
        },
        {
          timeoutMs: DISCOGS_TIMEOUT_MS,
          reqId: reqId,
          op: 'search_query',
          meta: { query },
          parentSignal: parentSignal
        }
      );

      // Safely handle undefined or missing results array
      const results = (responseData && responseData.results) ? responseData.results : [];
      queryResult.resultsCount = results.length;
      queryResult.success = true;
      
      // Debug: Log response structure if no results (to diagnose API issues)
      if (results.length === 0 && logQueries) {
        logger.debug(`[Discogs]     → No results for query "${query}"`);
        logger.debug(`[Discogs]     → Response keys: ${responseData ? Object.keys(responseData).join(', ') : 'null'}`);
        if (responseData && responseData.pagination) {
          logger.debug(`[Discogs]     → Pagination: ${JSON.stringify(responseData.pagination)}`);
        }
      } else if (logQueries) {
        logger.debug(`[Discogs]     → Found ${results.length} raw results (will filter by similarity)`);
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
            logger.debug(`[Discogs]     ✅ Good match: "${resultArtist}" - "${resultTitle}"`);
            logger.debug(`[Discogs]        Similarity: ${combinedSimilarity.toFixed(3)} (artist: ${artistSimilarity.toFixed(3)}, title: ${titleSimilarity.toFixed(3)})`);
          }
        }
      }
      
      // Log filtering stats
      if (logQueries && results.length > 0) {
        logger.debug(`[Discogs]     → Filtered: ${filteredCount}/${results.length} results passed similarity threshold (0.25)`);
      }

      // If we got good results, we can stop early
      if (allResults.length >= 5 && allResults[0].similarity > 0.8) {
        if (logQueries) {
          logger.debug(`[Discogs] Early exit: Found ${allResults.length} good results`);
        }
        break;
      }
    } catch (error) {
      queryResult.error = error.message;
      // Enhanced error logging
      if (error.response) {
        logger.error(`[Discogs]   ❌ API Error: ${error.response.status} ${error.response.statusText}`);
        if (error.response.status === 401) {
          logger.error(`[Discogs]   ❌ Discogs 401: token invalid. Generate a Discogs personal access token from Settings > Developers and ensure it's in DISCOGS_PERSONAL_ACCESS_TOKEN.`);
        } else if (error.response.status === 429) {
          logger.error(`[Discogs]   ❌ Rate limited - too many requests`);
        } else if (error.response.data) {
          logger.error(`[Discogs]   ❌ Response: ${JSON.stringify(error.response.data).substring(0, 200)}`);
        }
      } else if (error.request) {
        logger.error(`[Discogs]   ❌ Network error - no response from Discogs API`);
      } else {
        logger.error(`[Discogs]   ❌ Error: ${error.message}`);
      }
      if (logQueries) {
        logger.debug(`[Discogs]   → Query failed: ${error.message}`);
      }
      // Don't throw - continue to next query
    } finally {
      queryResult.duration = Date.now() - queryStart;
      searchLog.push(queryResult);
    }
  }

  const successfulQueries = searchLog.filter(q => q.success);
  logger.info(`[Discogs] 📊 Search Summary: ${allResults.length} results from ${successfulQueries.length}/${searchLog.length} queries`);
  
  // Log detailed error info if all queries failed
  if (successfulQueries.length === 0 && searchLog.length > 0) {
      const firstError = searchLog.find(q => q.error);
      if (firstError) {
        logger.error(`[Discogs]   ❌ All queries failed. First error: ${firstError.error}`);
      }
  }
  
  if (allResults.length > 0) {
    logger.info(`[Discogs]   🏆 Best match: "${allResults[0].artist}" - "${allResults[0].title}" (similarity: ${allResults[0].similarity.toFixed(3)})`);
  } else {
    logger.warn(`[Discogs]   ⚠️  No matches found above similarity threshold (0.25)`);
    // If we had successful queries but no results, log potential issues
    if (successfulQueries.length > 0 && successfulQueries[0].resultsCount === 0) {
      logger.debug(`[Discogs]   ⚠️  Discogs API returned 0 results for all queries`);
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
      
      // Use shared Discogs HTTP helper with AbortController (lowest network layer)
      const DISCOGS_FETCH_TIMEOUT_MS = config.discogs.fetchTimeoutMs;
      const release = await discogsHttpRequest(
        releaseUrl,
        {
          params: DISCOGS_PERSONAL_ACCESS_TOKEN ? {} : {
            key: DISCOGS_API_KEY,
            secret: DISCOGS_API_SECRET,
          },
          headers: releaseHeaders,
        },
        {
          timeoutMs: DISCOGS_FETCH_TIMEOUT_MS,
          reqId: reqId,
          op: 'release_fetch_internal',
          meta: { discogsId: topResult.discogsId },
          parentSignal: parentSignal
        }
      );
      
      // Extract track listing from Discogs release
      const tracks = [];
      if (release.tracklist && Array.isArray(release.tracklist)) {
        logger.debug(`[Discogs] 📀 Processing tracklist: ${release.tracklist.length} entries`);
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
              logger.debug(`[Discogs]     Track ${tracks.length}: "${trackData.title}" (pos: ${track.position || 'N/A'}, dur: ${track.duration || 'N/A'})`);
            }
          } else {
            logger.warn(`[Discogs]     ⚠️  Skipping track entry with no title:`, JSON.stringify(track));
          }
        }
        logger.debug(`[Discogs] ✅ Extracted ${tracks.length} valid tracks from ${release.tracklist.length} entries`);
      } else {
        logger.warn(`[Discogs] ⚠️  No tracklist found in release ${topResult.discogsId}`);
        logger.warn(`[Discogs]     release.tracklist type: ${release.tracklist ? typeof release.tracklist : 'undefined'}`);
        if (release.tracklist) {
          logger.warn(`[Discogs]     release.tracklist value:`, JSON.stringify(release.tracklist).substring(0, 200));
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
      
      logger.debug(`[Discogs] ✅ Release details fetched:`);
      logger.debug(`[Discogs]   Year: ${bestMatch.year || 'N/A'}`);
      logger.debug(`[Discogs]   Tracks: ${tracks.length}`);
      logger.debug(`[Discogs]   Discogs ID: ${bestMatch.discogsId}`);
      
      if (tracks.length > 0) {
        logger.debug(`[Discogs] 📀 Track list preview (first 5):`);
        tracks.slice(0, 5).forEach((t, idx) => {
          logger.debug(`[Discogs]   ${idx + 1}. "${t.title}"${t.trackNumber ? ` (#${t.trackNumber})` : ''}${t.durationSeconds ? ` (${Math.floor(t.durationSeconds / 60)}:${String(t.durationSeconds % 60).padStart(2, '0')})` : ''}`);
        });
        if (tracks.length > 5) {
          logger.debug(`[Discogs]   ... and ${tracks.length - 5} more tracks`);
        }
      } else {
        logger.warn(`[Discogs] ⚠️  No tracks extracted from release ${topResult.discogsId}`);
        if (release.tracklist) {
          logger.warn(`[Discogs]   Raw tracklist sample:`, JSON.stringify(release.tracklist.slice(0, 2), null, 2));
        }
      }
    } catch (err) {
      logger.warn(`[Discogs] Could not fetch release details for ${topResult.discogsId}:`, err.message);
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

  const result = {
    bestMatch,
    alternates,
    allResults: allResults.slice(0, 10), // For debugging
    searchLog // Detailed search attempt log
  };

  // PR2: Store in Cache C (only cache if we have results)
  if (bestMatch || allResults.length > 0) {
    setDiscogsSearchCache(artist, title, null, result);
  }

  return result;
}

// ============================================================================
// DATABASE OPERATIONS
// ============================================================================

/**
 * Search local database for cached records
 * Also checks vector embeddings if image buffer is provided
 * 
 * @param {string} artist - Artist name
 * @param {string} title - Album title
 * @param {string} imageHash - Image hash (optional)
 * @param {Buffer} imageBuffer - Image buffer for vector search (optional)
 * @returns {Promise<Object|null>} Cached record or null
 */
async function searchLocalDatabase(artist, title, imageHash, imageBuffer = null) {
  if (!db) {
    return null;
  }

  // Strategy 1: Vector search if image buffer provided (fastest for visual matches)
  if (imageBuffer) {
    try {
      const { getImageEmbedding } = require('./services/embeddingService');
      const { findNearestCovers } = require('./services/vectorIndex');
      
      const queryEmbedding = await getImageEmbedding(imageBuffer);
      
      // CRITICAL: Only run vector search if we have a valid embedding
      if (!queryEmbedding) {
        logger.debug('[Embedding] ❌ No valid embedding — skipping vector search (cache lookup)');
      } else {
        const embeddingMatches = await findNearestCovers(queryEmbedding, 1, 0.85, db); // High threshold for cache
        
        if (embeddingMatches.length > 0 && embeddingMatches[0].similarity >= 0.85) {
          const match = embeddingMatches[0];
          const discogsId = match.discogsId || match.metadata?.discogsId;
          
          if (discogsId) {
            // Look up full record details from identified_records
            const row = await new Promise((resolve, reject) => {
              db.get(
                `SELECT * FROM identified_records 
                 WHERE discogs_id = ?
                 ORDER BY created_at DESC LIMIT 1`,
                [discogsId],
                (err, row) => {
                  if (err) reject(err);
                  else resolve(row);
                }
              );
            });
            
            if (row) {
              logger.debug(`[Local DB] Found match via vector search: ${row.artist} - ${row.title} (similarity: ${match.similarity.toFixed(3)})`);
              const result = formatDbRecord(row);
              result.embeddingSimilarity = match.similarity;
              result.source = 'local_db_vector';
              return result;
            }
            // Fall through to artist/title search if no row found
          }
        }
      }
    } catch (embeddingError) {
      // Non-critical - fall through to artist/title search
      logger.warn(`[Local DB] Vector search failed: ${embeddingError.message}`);
    }
  }

  // Strategy 2: Search by artist/title (exact match)
  if (artist && title) {
    try {
      const row = await new Promise((resolve, reject) => {
        db.get(
          `SELECT * FROM identified_records 
           WHERE LOWER(artist) = LOWER(?) AND LOWER(title) = LOWER(?)
           ORDER BY created_at DESC LIMIT 1`,
          [artist, title],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });
      
      if (row) {
        logger.debug(`[Local DB] Found match by artist/title: ${row.artist} - ${row.title}`);
        return formatDbRecord(row);
      }
    } catch (err) {
      logger.warn(`[Local DB] Artist/title search failed: ${err.message}`);
    }
  }
  
  return null;
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
          logger.error('[Local DB] Error storing:', err);
        } else {
          logger.debug(`[Local DB] Cached: ${record.artist} - ${record.title}`);
        }
        resolve();
      }
    );
  });
}

// ============================================================================
// EMBEDDING HELPERS
// ============================================================================

/**
 * Get scan embedding for uploaded image
 * Centralized helper that computes and caches embeddings for user scans
 * 
 * @param {Buffer} imageBuffer - Image buffer from upload
 * @param {Object} debugInfo - Debug info object to populate
 * @returns {Promise<number[]|null>} Embedding vector or null if failed
 */
/**
 * Get scan embedding for uploaded image
 * Stabilization patch: prevents invalid embeddings, ensures Vision fallback works
 * 
 * Adds strict type guards to ensure embeddings are valid arrays of numbers.
 * If embedding is invalid, returns null and logs error, allowing pipeline to
 * continue with Vision fallback instead of crashing.
 * 
 * @param {Buffer} imageBuffer - Image buffer from upload
 * @param {Object} debugInfo - Debug info object to populate
 * @param {string} reqId - Request ID for logging (optional)
 * @returns {Promise<number[]|null>} Embedding vector or null if failed/invalid
 */
async function getScanEmbedding(imageBuffer, debugInfo = {}, reqId = null) {
  if (!imageBuffer || imageBuffer.length === 0) {
    if (reqId) logger.debug(`[REQ ${reqId}] embedding_skip_empty_buffer`);
    return null;
  }

  try {
    logger.debug(`[Embedding] 🎨 Computing scan embedding...`);
    const embedding = await getImageEmbedding(imageBuffer);
    
    // getImageEmbedding now validates and normalizes, returning null on failure
    if (!embedding) {
      const logMsg = `[REQ ${reqId || 'N/A'}] embedding_compute_failed (getImageEmbedding returned null)`;
      logger.debug(logMsg);
      debugInfo.embeddingError = 'getImageEmbedding returned null (validation failed)';
      debugInfo.embeddingComputed = false;
      return null;
    }
    
    // Embedding is already validated and normalized by getImageEmbedding
    debugInfo.embeddingComputed = true;
    debugInfo.embeddingDimensions = embedding.length;
    logger.debug(`[Embedding] ✅ Scan embedding computed (${embedding.length} dimensions)`);
    return embedding;
  } catch (error) {
    const logMsg = `[REQ ${reqId || 'N/A'}] embedding_compute_error: ${error.message}`;
    logger.error(`[Embedding] ⚠️  Failed to compute scan embedding: ${error.message}`);
    debugInfo.embeddingError = error.message;
    debugInfo.embeddingComputed = false;
    return null;
  }
}

/**
 * Ensure record has embedding stored
 * Generates and stores embedding for a record if it doesn't exist
 * 
 * @param {string} recordId - Record identifier (discogsId or internal ID)
 * @param {string} coverImageUrl - URL or path to cover image
 * @param {Object} metadata - Record metadata (artist, title, year, discogsId)
 * @returns {Promise<boolean>} True if embedding was created/stored
 */
async function ensureRecordEmbedding(recordId, coverImageUrl, metadata = {}) {
  if (!recordId || !coverImageUrl) {
    return false;
  }

  try {
    // Check if embedding already exists
    if (db) {
      const existing = await new Promise((resolve) => {
        db.get(
          `SELECT id FROM cover_embeddings WHERE discogs_id = ? OR record_id = ? LIMIT 1`,
          [recordId, recordId],
          (err, row) => resolve(!err && row)
        );
      });

      if (existing) {
        logger.debug(`[Embedding] ✅ Embedding already exists for recordId: ${recordId}`);
        return true;
      }
    }

    // Download and process cover image
    // IMPORTANT: preprocessing must match scan+index (applied via getImageEmbedding -> getCLIPEmbedding)
    logger.debug(`[Embedding] 📥 Downloading cover image for recordId: ${recordId}...`);
    const axios = require('axios');
    const response = await axios.get(coverImageUrl, {
      responseType: 'arraybuffer',
      timeout: 10000,
    });

    const imageBuffer = Buffer.from(response.data);
    // getImageEmbedding applies preprocessing via getCLIPEmbedding (same as scan path)
    const embedding = await getImageEmbedding(imageBuffer);

    // CRITICAL: Validate embedding before storing
    if (!embedding) {
      logger.warn(`[Embedding] ⚠️  Failed to generate embedding for recordId ${recordId}, skipping index`);
      return false;
    }

    // Store embedding (indexCoverEmbedding will also validate, but we check here too for clearer logs)
    try {
      await indexCoverEmbedding(
        recordId,
        embedding,
        {
          artist: metadata.artist,
          title: metadata.title,
          year: metadata.year,
          discogsId: metadata.discogsId || recordId,
        },
        db
      );
      logger.debug(`[Embedding] ✅ Created and stored embedding for recordId: ${recordId}`);
      return true;
    } catch (indexError) {
      logger.warn(`[Embedding] ⚠️  Failed to index embedding for recordId ${recordId}: ${indexError.message}`);
      return false;
    }
  } catch (error) {
    logger.warn(`[Embedding] ⚠️  Failed to ensure embedding for ${recordId}: ${error.message}`);
    return false;
  }
}

// ============================================================================
// THREE-PHASE IDENTIFICATION PIPELINE
// ============================================================================

/**
 * Phase 1: Generate Candidates from Input
 * Converts raw input (image/barcode/text) into candidate album matches
 * Now includes embedding-based candidates with proper metadata structure
 */
async function generateCandidatesFromInput(req, imageBuffer, debugInfo) {
  const candidates = [];
  const inputType = req.file ? 'image' : (req.body.barcode ? 'barcode' : 'text');
  debugInfo.inputType = inputType;
  debugInfo.sourcesUsed = debugInfo.sourcesUsed || [];
  debugInfo.embeddingMatches = [];
  debugInfo.ocrParsed = null;
  // reqId is always set by handler, ensure it's available
  const reqId = debugInfo.requestId || 'N/A';

  // Handle image input
  if (inputType === 'image' && imageBuffer) {
    logger.debug(`[Phase1] 🚀 Starting image processing pipeline...`);
    const phase1StartTime = Date.now();
    
    // STEP 1: Compute embedding first (needed for skip-Vision decision)
    const embeddingStart = Date.now();
    logger.debug(`[REQ ${reqId}] embedding_compute_start`);
    // Get timeout constants from handler scope (passed via debugInfo or use defaults)
    const EMBEDDING_TIMEOUT_MS = config.embedding.timeoutMs;
    const queryEmbedding = await withTimeout(
      getScanEmbedding(imageBuffer, debugInfo, reqId),
      EMBEDDING_TIMEOUT_MS,
      'embedding',
      reqId
    ).catch(err => {
      const elapsed = Date.now() - embeddingStart;
      logger.error(`[REQ ${reqId}] ERROR embedding_compute elapsed=${elapsed}ms`, err);
      debugInfo.embeddingError = err.message;
      return null;
    });
    const embeddingTime = Date.now() - embeddingStart;
    logHeartbeat(reqId, 'embedding_compute', embeddingStart);
    if (queryEmbedding) {
      logger.debug(`[REQ ${reqId}] embedding_compute_complete elapsed=${embeddingTime}ms`);
    } else {
      logger.debug(`[REQ ${reqId}] embedding_compute_failed elapsed=${embeddingTime}ms`);
    }
    
    debugInfo.scanEmbedding = queryEmbedding ? 'computed' : 'failed';
    
    // STEP 2: Vector search for similar covers (core signal, not just add-on)
    let visionDecision = null;
    let topEmbeddingSimilarity = 0;
    let top1Id = null;
    let top2Similarity = null;
    
    // CRITICAL: Only run vector search if we have a valid embedding
    // Define constants outside try block so they're available in else block
    const EMBEDDING_K = config.embedding.k;
    const EMBEDDING_MIN_SIMILARITY = config.embedding.minSimilarity;
    const VECTOR_SEARCH_TIMEOUT_MS = config.embedding.vectorSearchTimeoutMs;
    
    if (!queryEmbedding) {
      logger.debug(`[REQ ${reqId}] [Embedding] ❌ No valid embedding — skipping vector search`);
      debugInfo.embeddingMatches = [];
      debugInfo.embeddingNeighborsCount = 0;
    } else {
      try {
        // STEP 2: Vector search
        const vectorSearchStart = Date.now();
        logger.debug(`[REQ ${reqId}] vector_search_start`);
        
        // Run vector search
        embeddingMatches = await withTimeout(
          findNearestCovers(queryEmbedding, EMBEDDING_K, EMBEDDING_MIN_SIMILARITY, db),
          VECTOR_SEARCH_TIMEOUT_MS,
          'vector_search',
          reqId
        );
        const vectorSearchTime = Date.now() - vectorSearchStart;
        logHeartbeat(reqId, 'vector_search', vectorSearchStart);
        
        // A) Log top1 similarity + id + top2 similarity
        const top1 = embeddingMatches[0];
        const top1Similarity = top1 ? top1.similarity : null;
        const top1IdValue = top1 ? (top1.discogsId || top1.recordId || top1.metadata?.discogsId || null) : null;
        const top2 = embeddingMatches[1];
        const top2SimilarityValue = top2 ? top2.similarity : null;
        logger.debug(`[REQ ${reqId}] vector_search_complete elapsed=${vectorSearchTime}ms top1Similarity=${top1Similarity} top1Id=${top1IdValue} top2Similarity=${top2SimilarityValue}`);
        
        debugInfo.embeddingMatches = embeddingMatches;
        debugInfo.embeddingNeighborsCount = embeddingMatches.length;
        
        // Update outer scope variables (using let, not const)
        topEmbeddingSimilarity = top1Similarity || 0;
        top1Id = top1IdValue;
        top2Similarity = top2SimilarityValue;
      } catch (embeddingError) {
        logger.warn(`[Phase1] ⚠️  Vector search failed: ${embeddingError.message}`);
        debugInfo.embeddingSearchError = embeddingError.message;
        debugInfo.embeddingMatches = [];
        debugInfo.embeddingNeighborsCount = 0;
      }
      
      // STEP 3: Decide Vision Strategy (only if we have embeddingMatches from vector search)
      const decideStart = Date.now();
      logger.debug(`[REQ ${reqId}] decideVisionStrategy_start`);
      const datasetSize = getEmbeddingCount();
      const ENABLE_GOOGLE_VISION = config.googleVision.enabled;
      
      visionDecision = decideVisionStrategy({
        embeddingMatches,
        datasetSize,
        hasValidIndex: true,
        enableVision: ENABLE_GOOGLE_VISION && !!getVisionClient(),
        thresholds: {
          strongAccept: STRONG_ACCEPT_THRESHOLD,
          strongAcceptMargin: STRONG_ACCEPT_MARGIN,
          skipVision: SKIP_VISION_EMBEDDING_THRESHOLD,
          margin: SKIP_VISION_MARGIN_THRESHOLD,
          minDatasetSize: MIN_EMBEDDING_DATASET_SIZE
        }
      });
      const decideTime = Date.now() - decideStart;
      
      // A) Log decision + reasons
      const skipReasonsStr = visionDecision.skipReasons && visionDecision.skipReasons.length > 0 
        ? ` reasons=[${visionDecision.skipReasons.join(',')}]` 
        : '';
      logger.debug(`[REQ ${reqId}] decideVisionStrategy_complete elapsed=${decideTime}ms decision=${visionDecision.decision}${skipReasonsStr}`);
      
      // Store decision metadata (variables already declared as let above)
      topEmbeddingSimilarity = visionDecision.top1.similarity;
      top1Id = visionDecision.top1.discogsId || visionDecision.top1.recordId;
      top2Similarity = visionDecision.top2 ? visionDecision.top2.similarity : null;
      
      debugInfo.visionDecision = visionDecision.decision;
      debugInfo.visionDecisionReason = visionDecision.reason;
      debugInfo.visionSkipTop1Id = top1Id;
      debugInfo.visionSkipTop1Similarity = topEmbeddingSimilarity;
      debugInfo.visionSkipTop2Similarity = top2Similarity;
      debugInfo.visionSkipMargin = visionDecision.margin;
      debugInfo.visionSkipMarginUnavailable = visionDecision.marginUnavailable || false;
      debugInfo.visionSkipReasons = visionDecision.skipReasons || null;
      debugInfo.datasetSize = datasetSize;
      debugInfo.indexName = 'album_cover_embeddings';
      
      // Convert embedding neighbors to candidates with proper metadata structure
      if (embeddingMatches.length > 0) {
        for (const match of embeddingMatches) {
          if (match.similarity >= EMBEDDING_MIN_SIMILARITY && match.metadata) {
            const candidate = {
              type: 'embedding',  // ✅ Explicit type
              artist: match.metadata.artist || null,
              title: match.metadata.title || null,
              recordId: match.recordId || null,
              discogsId: match.discogsId || match.metadata.discogsId || null,
              embeddingSimilarity: match.similarity,  // ✅ Explicit similarity
              confidence: match.similarity * 0.9,  // High confidence for visual matches
              source: 'embedding',
              // Metadata for scoring
              metadata: {
                embeddingSimilarity: match.similarity,
                recordId: match.recordId,
                discogsId: match.discogsId,
              }
            };
            
            // Add if we have at least artist+title OR discogsId
            const hasArtistTitle = candidate.artist && candidate.title;
            const hasDiscogsId = candidate.discogsId;
            
            if ((hasArtistTitle || hasDiscogsId) && !candidates.find(c => {
              // Deduplicate by discogsId if available, otherwise by artist|title
              if (candidate.discogsId && c.discogsId) {
                return String(c.discogsId) === String(c.discogsId);
              }
              return key(c) === key(candidate);
            })) {
              candidates.push(candidate);
              logger.debug(`[Phase1] ✅ Added embedding candidate: "${candidate.artist || 'N/A'}" - "${candidate.title || 'N/A'}" (similarity: ${match.similarity.toFixed(3)}, discogsId: ${candidate.discogsId || 'N/A'})`);
            }
          }
        }
        debugInfo.sourcesUsed.push('embedding');
      } else {
        const EMBEDDING_MIN_SIMILARITY = config.embedding.minSimilarity;
        logger.debug(`[Phase1] ⚠️  No embedding neighbors found above threshold ${EMBEDDING_MIN_SIMILARITY}`);
      }
    }
    
    // STEP 3: Conditionally run Vision API based on decision policy
    // IMPORTANT: decideVisionStrategy() is the ONLY source of truth for vision decisions
    // All vision skip/run logic flows through visionDecision.decision
    let visionResult = null;
    const ENABLE_GOOGLE_VISION = config.googleVision.enabled;
    
    if (visionDecision && visionDecision.decision === 'ACCEPT_EMBEDDING_FINAL') {
      // Do NOT run Vision - treat embedding match as final
      logger.debug(`[Phase1] ✅ ACCEPT_EMBEDDING_FINAL: Treating top embedding match as final (no OCR override)`);
      debugInfo.visionSkipped = true; // For logging only, not decision-making
      debugInfo.visionSkipReason = visionDecision.reason;
    } else if (visionDecision && visionDecision.decision === 'SKIP_VISION') {
      // Skip Vision but allow OCR to refine if needed
      logger.debug(`[Phase1] ⏭️  SKIP_VISION: Proceeding without Vision API (OCR may refine if needed)`);
      debugInfo.visionSkipped = true; // For logging only, not decision-making
      debugInfo.visionSkipReason = visionDecision.reason;
    } else if (visionDecision && visionDecision.decision === 'RUN_VISION' && ENABLE_GOOGLE_VISION && getVisionClient()) {
      // Run Vision as fallback - use OCR/web entities to disambiguate or refine
      try {
        const visionStart = Date.now();
        logger.debug(`[REQ ${reqId}] vision_call_start`);
        const VISION_TIMEOUT_MS = config.googleVision.timeoutMs;
        visionResult = await withTimeout(
          processImageWithGoogleVision(imageBuffer),
          VISION_TIMEOUT_MS,
          'vision',
          reqId
        );
        const visionTime = Date.now() - visionStart;
        logHeartbeat(reqId, 'vision_call', visionStart);
        logger.debug(`[REQ ${reqId}] vision_call_complete elapsed=${visionTime}ms`);
        debugInfo.visionSkipped = false;
        debugInfo.visionUsed = true; // PR2: Track Vision usage
        debugInfo.performanceMetrics.visionTime = visionTime;
      } catch (err) {
        logger.warn(`[Phase1] ⚠️  Vision API failed: ${err.message}`);
        debugInfo.visionError = err.message;
        visionResult = null;
        // PR2: Vision failure doesn't set visionUsed=true (fallback to Discogs-only)
      }
    } else if (!visionDecision) {
      // No decision made (embedding failed) - run Vision if enabled
      if (ENABLE_GOOGLE_VISION && getVisionClient()) {
        try {
          const visionStart = Date.now();
          logger.debug(`[REQ ${reqId}] vision_call_start (no embedding decision)`);
          const VISION_TIMEOUT_MS = config.googleVision.timeoutMs;
          visionResult = await withTimeout(
            processImageWithGoogleVision(imageBuffer),
            VISION_TIMEOUT_MS,
            'vision',
            reqId
          );
          const visionTime = Date.now() - visionStart;
          logHeartbeat(reqId, 'vision_call', visionStart);
          logger.debug(`[REQ ${reqId}] vision_call_complete elapsed=${visionTime}ms`);
          debugInfo.visionUsed = true; // PR2: Track Vision usage
          debugInfo.performanceMetrics.visionTime = visionTime;
        } catch (err) {
          const visionTime = Date.now() - (Date.now() - (debugInfo.visionTime || 0));
          logger.error(`[REQ ${reqId}] ERROR vision_call elapsed=${visionTime}ms`, err);
          debugInfo.visionError = err.message;
          visionResult = null;
        }
      }
    } else if (!ENABLE_GOOGLE_VISION || !getVisionClient()) {
      logger.debug(`[Phase1] ⏭️  Vision API disabled or not configured`);
      debugInfo.visionSkipped = true;
      debugInfo.visionSkipReason = 'vision_disabled';
    }
    
    const phase1Time = Date.now() - phase1StartTime;
    const visionStatus = visionDecision ? 
      (visionDecision.decision === 'ACCEPT_EMBEDDING_FINAL' ? '✅ final' : 
       visionDecision.decision === 'SKIP_VISION' ? '⏭️ skipped' : 
       visionResult ? '✅' : '❌') : 
      (visionResult ? '✅' : '❌');
    logger.info(`[Phase1] ⏱️  Phase 1 completed in ${phase1Time}ms (embedding: ${queryEmbedding ? '✅' : '❌'}, vision: ${visionStatus})`);
    debugInfo.phase1Time = phase1Time;

    // STEP 4: Process Vision results (if available)
    // NOTE: If decision == ACCEPT_EMBEDDING_FINAL, visionResult will be null and this block is skipped
    // This ensures OCR candidates cannot override the final embedding match
    if (visionResult && visionDecision?.decision !== 'ACCEPT_EMBEDDING_FINAL') {
      try {
        const visionTime = Date.now();
        debugInfo.visionProcessing = visionTime;
        debugInfo.visionResult = visionResult;

        // Store OCR text and web entities
        if (visionResult.extractedText) {
          debugInfo.rawOcrText = visionResult.extractedText;
        }
        debugInfo.webEntities = visionResult.webEntities?.length || 0;
        debugInfo.pageTitles = visionResult.pageTitles?.length || 0;

        // STEP 4: PRIMARY - Parse OCR text using improved parser
        if (visionResult.extractedText) {
          logger.debug(`[Phase1] 📝 PRIMARY: Parsing OCR text...`);
          const ocrParsed = await parseArtistAndAlbum(visionResult.extractedText);
          debugInfo.ocrParsed = ocrParsed;
          
          if (ocrParsed.artist && ocrParsed.album) {
            logger.debug(`[Phase1] ✅ OCR PRIMARY: "${ocrParsed.artist}" - "${ocrParsed.album}" (confidence: ${ocrParsed.confidence.toFixed(2)})`);
            const ocrCandidate = {
              type: 'ocr',  // ✅ Explicit type
              artist: ocrParsed.artist,
              title: ocrParsed.album,
              confidence: ocrParsed.confidence,
              ocrConfidence: ocrParsed.confidence,  // ✅ Explicit OCR confidence
              source: 'ocr_primary',
              metadata: {
                ocrConfidence: ocrParsed.confidence,
              }
            };
            if (!candidates.find(c => key(c) === key(ocrCandidate))) {
              candidates.push(ocrCandidate);
              debugInfo.sourcesUsed.push('ocr');
            }
          }
          
          // Also extract additional candidates from OCR using legacy extractor (for fallback)
          const textCandidates = extractCandidates(visionResult.extractedText);
          const filteredTextCandidates = filterWebNoise(textCandidates);
          logger.debug(`[Phase1] 📋 Extracted ${filteredTextCandidates.length} additional candidates from OCR (after web noise filtering)`);
          
          for (const candidate of filteredTextCandidates) {
            if (candidate.confidence >= 0.3 && candidates.length < 8) {
              // Enhance with proper metadata structure
              candidate.type = 'ocr';
              candidate.ocrConfidence = candidate.confidence;
              candidate.source = `ocr_${candidate.source}`;
              candidate.metadata = candidate.metadata || {};
              candidate.metadata.ocrConfidence = candidate.confidence;
              
              if (!candidates.find(c => key(c) === key(candidate))) {
                candidates.push(candidate);
              }
            }
          }
        }

        // STEP 5: SECONDARY - Use web detection only as supporting signal (filtered)
        const filteredWebEntities = filterWebEntities(visionResult.webEntities || []);
        logger.debug(`[Phase1] 🌐 SECONDARY: Found ${filteredWebEntities.length} filtered web entities (${visionResult.webEntities?.length || 0} total, ${(visionResult.webEntities?.length || 0) - filteredWebEntities.length} filtered as noise)`);
        
        // Only use web entities to boost confidence if they match OCR candidates
        // Don't create new candidates from web entities alone
        if (filteredWebEntities.length > 0 && candidates.length > 0) {
          const webText = filteredWebEntities.map(e => e.description || '').join(' ').toLowerCase();
          for (const candidate of candidates) {
            const artistLower = (candidate.artist || '').toLowerCase();
            const titleLower = (candidate.title || '').toLowerCase();
            if (webText.includes(artistLower) || webText.includes(titleLower)) {
              // Boost confidence slightly if web entities confirm OCR
              candidate.confidence = Math.min(1.0, (candidate.confidence || 0) + 0.05);
              candidate.source = `${candidate.source}_web_confirmed`;
              logger.debug(`[Phase1] ✅ Web entities confirmed OCR candidate: "${candidate.artist}" - "${candidate.title}"`);
            }
          }
        }

        // REMOVED: Web detection no longer creates candidates
        // Web entities are only used as supporting evidence (confidence boost) above
        // This prevents Wikipedia/shopping page garbage from polluting candidate list
      } catch (error) {
        const errorMsg = error.message || 'Unknown Vision API error';
        debugInfo.errors.push(`Google Vision: ${errorMsg}`);
        logger.error(`[Phase1] ❌ Vision error: ${errorMsg}`);
      }
    } else if (inputType === 'image' && imageBuffer && !getVisionClient()) {
      logger.warn(`[Phase1] ⚠️  Google Vision not configured - cannot process image`);
      throw new Error('Google Vision API not configured. Please set up Google Cloud credentials.');
    }

    // EMBEDDING FALLBACK: If OCR/barcode failed or produced weak candidates, rely on embeddings
    const hasWeakCandidates = candidates.length === 0 || 
      (candidates.length > 0 && candidates.every(c => (c.confidence || 0) < 0.5));
    const hasEmbeddingNeighbors = debugInfo.embeddingMatches && debugInfo.embeddingMatches.length > 0;
    
    if (hasWeakCandidates && hasEmbeddingNeighbors && queryEmbedding) {
      logger.debug(`[Phase1] 🎨 EMBEDDING FALLBACK: OCR/barcode weak, using ${debugInfo.embeddingMatches.length} embedding neighbors as primary signal`);
      debugInfo.embeddingFallbackUsed = true;
      
      // Use embedding neighbors directly as candidates (even if they don't have artist/title)
      // We'll query Discogs by discogsId in Phase 2
      for (const match of debugInfo.embeddingMatches) {
        if (match.similarity >= 0.65) {  // Lower threshold for fallback
          const candidate = {
            type: 'embedding',
            discogsId: match.discogsId || match.metadata?.discogsId || null,
            recordId: match.recordId || null,
            embeddingSimilarity: match.similarity,
            confidence: match.similarity * 0.85,  // Slightly lower for fallback
            source: 'embedding_fallback',
            metadata: {
              embeddingSimilarity: match.similarity,
              recordId: match.recordId,
              discogsId: match.discogsId,
            }
          };
          
          // Add if we have discogsId (we can query it directly)
          if (candidate.discogsId && !candidates.find(c => c.discogsId && String(c.discogsId) === String(candidate.discogsId))) {
            candidates.push(candidate);
            logger.debug(`[Phase1] ✅ Added embedding fallback candidate (discogsId: ${candidate.discogsId}, similarity: ${match.similarity.toFixed(3)})`);
          }
        }
      }
    }

    // OCR → MusicBrainz fallback (last resort, only if embeddings also failed)
    if (candidates.length === 0 && debugInfo.rawOcrText && debugInfo.rawOcrText.trim().length > 0) {
      logger.debug(`[Phase1] 🎵 Trying MusicBrainz OCR fallback...`);
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
              logger.debug(`[Phase1] ✅ MusicBrainz OCR fallback: "${mbFallback.artist}" - "${mbFallback.title}"`);
            } else {
              logger.debug(`[Phase1] ⚠️  MusicBrainz OCR fallback candidate filtered out (not album-like)`);
            }
          }
        }
      } catch (mbError) {
        logger.warn(`[Phase1] ⚠️  MusicBrainz OCR fallback failed: ${mbError.message}`);
      }
    }

  } else if (inputType === 'barcode') {
    const barcode = req.body.barcode?.trim();
    if (!barcode) {
      throw new Error('No barcode provided');
    }

    logger.debug(`[Phase1] 📷 Processing barcode: ${barcode}`);
    const barcodeMatch = await searchDiscogsByBarcode(barcode);
    
    if (barcodeMatch) {
      logger.debug(`[Phase1] ✅ Barcode match: "${barcodeMatch.artist}" - "${barcodeMatch.title}"`);
      candidates.push({
        type: 'barcode',  // ✅ Explicit type
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
        metadata: {
          barcodeMatch: true,
        }
      });
      
      logger.debug(`[Phase1] ✅ Barcode match details: ${barcodeMatch.tracks?.length || 0} tracks, ${barcodeMatch.genres?.length || 0} genres`);
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
      type: 'text',  // ✅ Explicit type
      artist,
      title,
      confidence: 0.9,
      source: 'user_input',
      metadata: {
        userProvided: true,
      }
    });
    debugInfo.sourcesUsed.push('user_input');
    logger.debug(`[Phase1] Processing text: ${artist} - ${title}`);
  }

  // Sort by confidence (highest first)
  candidates.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  
  debugInfo.candidateCount = candidates.length;
  logger.info(`[Phase1] ✅ Generated ${candidates.length} candidates from ${debugInfo.sourcesUsed.join(', ')}`);
  
  return candidates;
}

/**
 * Fetch Discogs release directly by ID (fast path - no search needed)
 * 
 * @param {number|string} discogsId - Discogs release ID
 * @param {Map|null} requestCache - Optional request-scoped cache (to avoid duplicate fetches within same request)
 * @returns {Promise<Object|null>} Release data or null
 */
async function fetchDiscogsReleaseById(discogsId, requestCache = null, reqId = 'N/A', parentSignal = null) {
  const DISCOGS_PERSONAL_ACCESS_TOKEN = config.discogs.personalAccessToken;
  const DISCOGS_API_KEY = config.discogs.apiKey;
  const DISCOGS_API_SECRET = config.discogs.apiSecret;

  if (!DISCOGS_PERSONAL_ACCESS_TOKEN && !DISCOGS_API_KEY) {
    logger.warn('[Discogs] ⚠️  Discogs not configured, cannot fetch by ID');
    return null;
  }

  // 1. Check request-scoped cache first (fastest - avoids duplicate fetches in same request)
  if (requestCache && requestCache.has(discogsId)) {
    logger.debug(`[Discogs] ✅ Request cache hit for release ${discogsId}`);
    return requestCache.get(discogsId);
  }

  // 2. Check Cache B (PR2: using new cache module)
  const { getDiscogsReleaseCache, setDiscogsReleaseCache } = require('./src/services/cache/identificationCache');
  const cachedRelease = getDiscogsReleaseCache(discogsId);
  if (cachedRelease) {
    logger.debug(`[Discogs] ✅ Cache B HIT for release ${discogsId}`);
    // Store in request cache for this request too (if provided)
    if (requestCache) {
      requestCache.set(discogsId, cachedRelease);
    }
    return cachedRelease;
  }
  
  // Legacy: Check global cache (if within TTL) - for backward compatibility
  const cached = globalDiscogsCache.get(discogsId);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    logger.debug(`[Discogs] ✅ Global cache hit for release ${discogsId}`);
    // Migrate to new cache
    setDiscogsReleaseCache(discogsId, cached.data);
    // LRU: Reinsert key to mark as most recently used (delete then set)
    globalDiscogsCache.delete(discogsId);
    globalDiscogsCache.set(discogsId, {
      data: cached.data,
      timestamp: Date.now(), // Update timestamp on access
    });
    // Store in request cache for this request too (if provided)
    if (requestCache) {
      requestCache.set(discogsId, cached.data);
    }
    return cached.data;
  }

  // 3. Fetch from API
  try {
    logger.debug(`[Discogs] 🔍 Fetching release ${discogsId} from API...`);
    const headers = {
      'User-Agent': 'SlotSync/1.0.0 (contact@slotsync.app)',
    };

    if (DISCOGS_PERSONAL_ACCESS_TOKEN) {
      headers['Authorization'] = `Discogs token=${DISCOGS_PERSONAL_ACCESS_TOKEN}`;
    }

    // Use shared Discogs HTTP helper with AbortController (lowest network layer)
    const DISCOGS_FETCH_TIMEOUT_MS = config.discogs.fetchTimeoutMs;
    const releaseUrl = `https://api.discogs.com/releases/${discogsId}`;
    const release = await discogsHttpRequest(
      releaseUrl,
      {
        params: DISCOGS_PERSONAL_ACCESS_TOKEN ? {} : {
          key: DISCOGS_API_KEY,
          secret: DISCOGS_API_SECRET,
        },
        headers,
      },
      {
        timeoutMs: DISCOGS_FETCH_TIMEOUT_MS,
        reqId: reqId,
        op: 'release_fetch_by_id',
        meta: { discogsId },
        parentSignal: parentSignal
      }
    );
    
    // Extract artist and clean Discogs disambiguation numbers
    const rawArtist = release.artists?.[0]?.name || 'Unknown Artist';
    const artist = cleanDiscogsArtistName(rawArtist);
    
    // Extract year
    const year = release.year || null;
    
    // Extract cover image
    const coverImageUrl = release.images?.[0]?.uri || release.images?.[0]?.resource_url || null;
    
    // Extract tracklist
    const tracks = [];
    if (release.tracklist && Array.isArray(release.tracklist)) {
      logger.debug(`[Discogs] 📀 Release ${discogsId} has tracklist with ${release.tracklist.length} items`);
      for (const track of release.tracklist) {
        if (track.title && track.title.trim()) {
          tracks.push({
            title: track.title.trim(),
            trackNumber: track.position ? parseInt(track.position.split(/[-.]/)[0]) || null : null,
            discNumber: track.position && track.position.includes('.') ? parseInt(track.position.split('.')[0]) : null,
            side: track.position && track.position.match(/^[A-Z]/) ? track.position.match(/^([A-Z])/)[1] : null,
            durationSeconds: track.duration ? parseDuration(track.duration) : null,
          });
        } else {
          logger.debug(`[Discogs] ⚠️  Skipping track with empty title: position="${track.position || 'N/A'}", duration="${track.duration || 'N/A'}"`);
        }
      }
      logger.debug(`[Discogs] ✅ Extracted ${tracks.length} valid tracks from ${release.tracklist.length} tracklist items`);
    } else {
      logger.debug(`[Discogs] ⚠️  Release ${discogsId} has no tracklist (tracklist=${release.tracklist ? typeof release.tracklist : 'undefined'})`);
    }
    
    // Extract genres and styles
    const genres = release.genres || [];
    const styles = release.styles || [];
    
    const result = {
      artist,
      title: release.title,
      year,
      discogsId: parseInt(discogsId, 10),
      coverImageRemoteUrl: coverImageUrl,
      tracks,
      genres,
      styles,
      label: release.labels?.[0]?.name || null,
      catalogNumber: release.labels?.[0]?.catno || null,
      format: release.formats?.[0]?.name || null,
    };

    // 4. Store in both caches (only cache successful results)
    if (requestCache) {
      requestCache.set(discogsId, result);
    }

    // PR2: Store in Cache B (new cache module) - already imported above
    setDiscogsReleaseCache(discogsId, result);

    // Cleanup before adding to global cache
    cleanupCache();
    globalDiscogsCache.set(discogsId, {
      data: result,
      timestamp: Date.now(),
    });

    return result;
  } catch (error) {
    // Don't cache failures
    logger.warn(`[Discogs] ⚠️  Failed to fetch release ${discogsId}: ${error.message}`);
    
    // Check for 401 errors and provide actionable hint
    if (error.response && error.response.status === 401) {
      logger.error(`[Discogs] ❌ Discogs 401: token invalid. Generate a Discogs personal access token from Settings > Developers and ensure it's in DISCOGS_PERSONAL_ACCESS_TOKEN.`);
    }
    
    return null;
  }
}

/**
 * Phase 2: Resolve Best Album from Candidates
 * Takes candidates and resolves the best match using Discogs/MusicBrainz
 */
async function resolveBestAlbum(candidates, imageHash, debugInfo, feedbackMatch = null, imageBuffer = null, reqId = null, parentSignal = null) {
  if (!candidates || candidates.length === 0) {
    logger.warn(`[Phase2] ❌ No candidates to resolve`);
    return null;
  }

  // Create request-scoped cache for this request (to avoid duplicate fetches of same discogsId)
  const requestCache = new Map();
  // reqId is always set by handler, use it consistently
  const resolvedReqId = reqId || debugInfo.requestId || 'N/A';
  const resolvedParentSignal = parentSignal || debugInfo.reqControllerSignal || null;
  const DISCOGS_FETCH_TIMEOUT_MS = config.discogs.fetchTimeoutMs; // 12 seconds per call
  const DISCOGS_SEARCH_TIMEOUT_MS = config.discogs.searchTimeoutMs; // 12 seconds per call
  const PHASE2_BUDGET_MS = config.phase2.budgetMs; // 45s max for Phase 2

  // Phase 2A+: ACCEPT_EMBEDDING_FINAL - treat top embedding match as final (no OCR override)
  // This fast path ensures OCR candidates cannot override the chosen embedding match
  if (debugInfo.visionDecision === 'ACCEPT_EMBEDDING_FINAL' && debugInfo.visionSkipTop1Id) {
    logger.debug(`[Phase2] ✅ ACCEPT_EMBEDDING_FINAL: Directly hydrating metadata for discogsId ${debugInfo.visionSkipTop1Id} (no OCR override)`);
    debugInfo.fastPathUsed = true;
    debugInfo.fastPathType = 'embedding_final';
    try {
      debugInfo.discogsDirectFetches++;
      const fetchStart = Date.now();
      logger.debug(`[REQ ${resolvedReqId}] discogs_hydrate_start discogsId=${debugInfo.visionSkipTop1Id}`);
      // Remove withTimeout wrapper - fetchDiscogsReleaseById uses discogsHttpRequest which has AbortController timeout
      const directRelease = await fetchDiscogsReleaseById(debugInfo.visionSkipTop1Id, requestCache, resolvedReqId, resolvedParentSignal);
      const fetchTime = Date.now() - fetchStart;
      logHeartbeat(resolvedReqId, 'discogs_hydrate', fetchStart);
      logger.debug(`[REQ ${resolvedReqId}] discogs_hydrate_complete elapsed=${fetchTime}ms`);
      if (directRelease) {
        logger.debug(`[Phase2] ✅ Embedding final match: ${directRelease.artist} - ${directRelease.title} (discogsId: ${debugInfo.visionSkipTop1Id})`);
        // Ensure finalDiscogsId matches the logged top1Id for consistency
        const finalResult = {
          artist: directRelease.artist,
          title: directRelease.title,
          year: directRelease.year || null,
          discogsId: String(debugInfo.visionSkipTop1Id), // Use the exact ID from decision
          coverImageUrl: directRelease.coverImageRemoteUrl || null,
          confidence: 0.95, // High confidence for strong embedding match
          source: 'embedding_final',
          tracks: directRelease.tracks || null,
          genres: directRelease.genres || [],
          styles: directRelease.styles || [],
        };
        // Verify ID consistency
        if (String(finalResult.discogsId) !== String(debugInfo.visionSkipTop1Id)) {
          logger.warn(`[Phase2] ⚠️  ID mismatch: decision top1Id=${debugInfo.visionSkipTop1Id}, result discogsId=${finalResult.discogsId}`);
        }
        return finalResult;
      }
    } catch (error) {
      logger.warn(`[Phase2] ⚠️  Failed to fetch embedding final match: ${error.message}`);
      // Fall through to normal resolution (should not happen, but safe fallback)
    }
  }

  // NEW: Use feedback if available (short-circuit for previously corrected identifications)
  if (feedbackMatch && feedbackMatch.finalDiscogsId) {
    logger.debug(`[Phase2] ✅ Using feedback match: Discogs ID ${feedbackMatch.finalDiscogsId}`);
    // Try to get full details for this Discogs ID
    try {
      // Remove withTimeout wrapper - searchDiscogsEnhanced uses discogsHttpRequest which has AbortController timeout
      const discogsResult = await searchDiscogsEnhanced(
        feedbackMatch.candidates[0]?.artist || '',
        feedbackMatch.candidates[0]?.title || '',
        false,
        imageBuffer,
        resolvedReqId,
        resolvedParentSignal
      );
      if (discogsResult.bestMatch && String(discogsResult.bestMatch.discogsId) === String(feedbackMatch.finalDiscogsId)) {
        return {
          artist: discogsResult.bestMatch.artist,
          title: discogsResult.bestMatch.title,
          year: discogsResult.bestMatch.year || null,
          discogsId: discogsResult.bestMatch.discogsId,
          coverImageUrl: discogsResult.bestMatch.coverImageRemoteUrl || null,
          confidence: 0.95, // High confidence for feedback matches
          source: 'user_feedback',
          tracks: discogsResult.bestMatch.tracks || null,
        };
      }
    } catch (error) {
      logger.warn(`[Phase2] ⚠️  Failed to resolve feedback match: ${error.message}`);
      // Fall through to normal resolution
    }
  }

  // FAST PATH 1: Barcode match (highest accuracy - barcode = exact Discogs match)
  const barcodeCandidate = candidates.find(c => c.source === 'barcode_discogs' || c.source === 'discogs_barcode');
  if (barcodeCandidate && barcodeCandidate.discogsId) {
    logger.debug(`[Phase2] ⚡ FAST PATH: Barcode match found (confidence: ${barcodeCandidate.confidence || 0.95}), fetching by ID`);
    debugInfo.fastPathUsed = true;
    debugInfo.fastPathType = 'barcode';
    try {
      debugInfo.discogsDirectFetches++;
      const fetchStart = Date.now();
      logger.debug(`[REQ ${resolvedReqId}] discogs_hydrate_start discogsId=${barcodeCandidate.discogsId}`);
      // Remove withTimeout wrapper - fetchDiscogsReleaseById uses discogsHttpRequest which has AbortController timeout
      const directRelease = await fetchDiscogsReleaseById(barcodeCandidate.discogsId, requestCache, resolvedReqId, resolvedParentSignal);
      const fetchTime = Date.now() - fetchStart;
      logHeartbeat(resolvedReqId, 'discogs_hydrate', fetchStart);
      logger.debug(`[REQ ${resolvedReqId}] discogs_hydrate_complete elapsed=${fetchTime}ms`);
      if (directRelease) {
        logger.debug(`[Phase2] ✅ Fast path complete: ${directRelease.artist} - ${directRelease.title}`);
        return {
          artist: directRelease.artist || barcodeCandidate.artist,
          title: directRelease.title || barcodeCandidate.title,
          year: directRelease.year || barcodeCandidate.year || null,
          discogsId: barcodeCandidate.discogsId,
          coverImageUrl: directRelease.coverImageRemoteUrl || barcodeCandidate.coverImageRemoteUrl || null,
          confidence: barcodeCandidate.confidence || 0.95,
          source: barcodeCandidate.source,
          tracks: directRelease.tracks || barcodeCandidate.tracks || null,
          genres: directRelease.genres || barcodeCandidate.genres || [],
          styles: directRelease.styles || barcodeCandidate.styles || [],
        };
      }
    } catch (error) {
      logger.warn(`[Phase2] ⚠️  Direct fetch failed, using candidate data: ${error.message}`);
      // Fall back to candidate data
      return {
        artist: barcodeCandidate.artist,
        title: barcodeCandidate.title,
        year: barcodeCandidate.year || null,
        discogsId: barcodeCandidate.discogsId,
        coverImageUrl: barcodeCandidate.coverImageRemoteUrl || null,
        confidence: barcodeCandidate.confidence || 0.95,
        source: barcodeCandidate.source,
        musicbrainz: barcodeCandidate.musicbrainz || null,
        tracks: barcodeCandidate.tracks || null,
        genres: barcodeCandidate.genres || [],
        styles: barcodeCandidate.styles || [],
      };
    }
  }

  // Prepare embedding signals early (needed for fast path check)
  const embeddingSignals = debugInfo.embeddingMatches || [];
  
  // FAST PATH 2: High embedding similarity (≥0.90) + discogsId → direct fetch
  const highSimEmbedding = embeddingSignals.find(m => 
    m.similarity >= 0.90 && 
    (m.discogsId || m.metadata?.discogsId)
  );
  if (highSimEmbedding) {
    const discogsId = highSimEmbedding.discogsId || highSimEmbedding.metadata?.discogsId;
    logger.debug(`[Phase2] ⚡ FAST PATH: High embedding similarity (${highSimEmbedding.similarity.toFixed(3)}) with discogsId ${discogsId}, fetching by ID`);
    debugInfo.fastPathUsed = true;
    debugInfo.fastPathType = 'embedding';
    try {
      debugInfo.discogsDirectFetches++;
      const fetchStart = Date.now();
      logger.debug(`[REQ ${resolvedReqId}] discogs_hydrate_start discogsId=${discogsId}`);
      // Remove withTimeout wrapper - fetchDiscogsReleaseById uses discogsHttpRequest which has AbortController timeout
      const directRelease = await fetchDiscogsReleaseById(discogsId, requestCache, resolvedReqId, resolvedParentSignal);
      const fetchTime = Date.now() - fetchStart;
      logHeartbeat(resolvedReqId, 'discogs_hydrate', fetchStart);
      logger.debug(`[REQ ${resolvedReqId}] discogs_hydrate_complete elapsed=${fetchTime}ms`);
      if (directRelease) {
        logger.debug(`[Phase2] ✅ Fast path complete: ${directRelease.artist} - ${directRelease.title}`);
        return {
          artist: directRelease.artist || highSimEmbedding.metadata?.artist,
          title: directRelease.title || highSimEmbedding.metadata?.title,
          year: directRelease.year || highSimEmbedding.metadata?.year || null,
          discogsId: discogsId,
          coverImageUrl: directRelease.coverImageRemoteUrl || null,
          confidence: Math.min(0.95, highSimEmbedding.similarity * 0.95), // High but not perfect
          source: 'embedding_fast_path',
          tracks: directRelease.tracks || null,
          genres: directRelease.genres || [],
          styles: directRelease.styles || [],
        };
      }
    } catch (error) {
      logger.warn(`[Phase2] ⚠️  Direct fetch failed for embedding match, continuing to normal flow: ${error.message}`);
      // Fall through to normal resolution
    }
  }

  // FAST PATH 3: Local DB match with discogsId → direct fetch
  if (candidates.length > 0 && candidates[0].discogsId) {
    const topCandidate = candidates[0];
    // Check if we have a strong local match
    try {
      const localMatch = await searchLocalDatabase(topCandidate.artist, topCandidate.title, imageHash, imageBuffer);
      if (localMatch && localMatch.discogsId === topCandidate.discogsId) {
        logger.debug(`[Phase2] ⚡ FAST PATH: Local DB match with discogsId ${localMatch.discogsId}, fetching by ID`);
        debugInfo.fastPathUsed = true;
        debugInfo.fastPathType = 'local_db';
        try {
          debugInfo.discogsDirectFetches++;
          const fetchStart = Date.now();
          logger.debug(`[REQ ${resolvedReqId}] discogs_hydrate_start discogsId=${localMatch.discogsId}`);
          // Remove withTimeout wrapper - fetchDiscogsReleaseById uses discogsHttpRequest which has AbortController timeout
          const directRelease = await fetchDiscogsReleaseById(localMatch.discogsId, requestCache, resolvedReqId, resolvedParentSignal);
          const fetchTime = Date.now() - fetchStart;
          logHeartbeat(resolvedReqId, 'discogs_hydrate', fetchStart);
          logger.debug(`[REQ ${resolvedReqId}] discogs_hydrate_complete elapsed=${fetchTime}ms`);
          if (directRelease) {
            logger.debug(`[Phase2] ✅ Fast path complete: ${directRelease.artist} - ${directRelease.title}`);
            return {
              artist: directRelease.artist || localMatch.artist,
              title: directRelease.title || localMatch.title,
              year: directRelease.year || localMatch.year || null,
              discogsId: localMatch.discogsId,
              coverImageUrl: directRelease.coverImageRemoteUrl || localMatch.coverImageRemoteUrl || null,
              confidence: 0.90, // High confidence for cached match
              source: 'local_db_fast_path',
              tracks: directRelease.tracks || localMatch.tracks || null,
              genres: directRelease.genres || [],
              styles: directRelease.styles || [],
            };
          }
        } catch (error) {
          logger.warn(`[Phase2] ⚠️  Direct fetch failed for local match, continuing: ${error.message}`);
        }
      }
    } catch (error) {
      // Non-critical, continue
    }
  }

  // NEW: Collect all Discogs releases for scoring
  const allDiscogsReleases = [];
  
  // For text input, use candidate artist/title (no OCR data available)
  // For image input, prefer OCR data but fall back to candidates
  const primaryCandidate = candidates.length > 0 ? candidates[0] : null;
  const textInputArtist = primaryCandidate?.type === 'text' ? primaryCandidate.artist : null;
  const textInputTitle = primaryCandidate?.type === 'text' ? primaryCandidate.title : null;
  
  const visionSignals = {
    ocrArtist: debugInfo.ocrParsed?.artist || textInputArtist || null,
    ocrTitle: debugInfo.ocrParsed?.album || textInputTitle || null,
    webEntities: (debugInfo.visionResult?.webEntities || []).map(e => e.description || '').filter(d => d),
  };
  
  // For text input, also populate ocrParsed so scoring works
  const ocrParsedForScoring = debugInfo.ocrParsed || {};
  if (!ocrParsedForScoring.artist && textInputArtist) {
    ocrParsedForScoring.artist = textInputArtist;
  }
  if (!ocrParsedForScoring.album && textInputTitle) {
    ocrParsedForScoring.album = textInputTitle;
  }
  
  // embeddingSignals already defined above for fast path
  const extractedBarcode = null; // Could extract from image if needed

  // DEBUG: Log embedding neighbors if available
  if (config.logging.debugEmbeddings && embeddingSignals.length > 0) {
    logger.debug(`[Debug] 🎨 Embedding neighbors (${embeddingSignals.length}):`);
    for (const match of embeddingSignals.slice(0, 5)) {
      logger.debug(`[Debug]   - ${match.metadata?.artist || 'N/A'} - ${match.metadata?.title || 'N/A'} (discogsId: ${match.discogsId || 'N/A'}, similarity: ${match.similarity.toFixed(3)})`);
    }
  }

  // SCAN SESSION THROTTLE: Limit Discogs searches per scan (max 5)
  const MAX_DISCOGS_SEARCHES = config.phase2.maxDiscogsSearches;
  let discogsSearchCount = 0;
  
  // Phase 2 time budget (hard stop)
  const phase2Deadline = Date.now() + PHASE2_BUDGET_MS;
  logger.debug(`[Phase2] ⏱️  Phase 2 budget: ${PHASE2_BUDGET_MS}ms (deadline: ${new Date(phase2Deadline).toISOString()})`);
  
  // STEP 3: Candidate normalization - filter bad OCR candidates before Discogs search
  // If we have strong Vision signals (e.g., "Bob Seger & The Silver Bullet Band" - "Live Bullet"),
  // filter out weak OCR candidates (e.g., "SILVER BULLET" - "'LIVE' BULLET")
  const normalizedCandidates = [];
  const visionArtist = visionSignals.ocrArtist;
  const visionTitle = visionSignals.ocrTitle;
  
  for (const candidate of candidates) {
    // Skip normalization for candidates with discogsId (they're already validated)
    if (candidate.discogsId) {
      normalizedCandidates.push(candidate);
      continue;
    }
    
    // Skip normalization for embedding candidates (they're already validated)
    if (candidate.type === 'embedding' || candidate.source?.includes('embedding')) {
      normalizedCandidates.push(candidate);
      continue;
    }
    
    // Normalize OCR candidates: if Vision provided strong artist/title, filter out weak OCR fragments
    if (candidate.type === 'ocr' || candidate.source?.includes('ocr')) {
      const candidateArtist = (candidate.artist || '').toLowerCase().trim();
      const candidateTitle = (candidate.title || '').toLowerCase().trim();
      
      // If Vision provided strong signals, check if OCR candidate is a fragment/substring
      if (visionArtist && visionTitle) {
        const visionArtistLower = visionArtist.toLowerCase().trim();
        const visionTitleLower = visionTitle.toLowerCase().trim();
        
        // Check if OCR candidate is a fragment of Vision signal (e.g., "SILVER BULLET" is fragment of "Bob Seger & The Silver Bullet Band")
        const isArtistFragment = candidateArtist.length < visionArtistLower.length && 
                                 visionArtistLower.includes(candidateArtist);
        const isTitleFragment = candidateTitle.length < visionTitleLower.length && 
                                visionTitleLower.includes(candidateTitle);
        
        // If both are fragments, this is likely a bad OCR candidate - skip it
        if (isArtistFragment && isTitleFragment) {
          logger.debug(`[Phase2] 🚫 Filtered OCR fragment candidate: "${candidate.artist}" - "${candidate.title}" (Vision has stronger: "${visionArtist}" - "${visionTitle}")`);
          continue;
        }
        
        // If candidate has quotes around words (e.g., "'LIVE' BULLET"), it's likely OCR noise
        if ((candidateTitle.includes("'") && candidateTitle.split("'").length > 2) ||
            (candidateArtist.includes("'") && candidateArtist.split("'").length > 2)) {
          logger.debug(`[Phase2] 🚫 Filtered OCR quote noise candidate: "${candidate.artist}" - "${candidate.title}"`);
          continue;
        }
      }
    }
    
    // Keep candidate if it passed normalization
    normalizedCandidates.push(candidate);
  }
  
  logger.debug(`[Phase2] 📋 Normalized ${candidates.length} candidates → ${normalizedCandidates.length} (filtered ${candidates.length - normalizedCandidates.length} bad OCR fragments)`);
  
  // Collect releases from normalized candidates
  logger.debug(`[Phase2] 🔍 Processing ${normalizedCandidates.length} candidates (max ${MAX_DISCOGS_SEARCHES} Discogs searches)...`);
  
  // OPTIMIZATION: Batch local DB checks to eliminate N+1 queries
  const candidatesWithArtistTitle = normalizedCandidates.filter(c => c.artist && c.title);
  const localDbMatches = new Map(); // (artist|title) -> match
  let localDbQueryCount = 0;
  
  if (candidatesWithArtistTitle.length > 0 && db) {
    try {
      const batchStart = Date.now();
      logger.debug(`[Phase2] 🔍 Batch checking ${candidatesWithArtistTitle.length} candidates in local DB...`);
      
      // Build batched query: (LOWER(artist) = LOWER(?) AND LOWER(title) = LOWER(?)) OR ...
      const conditions = [];
      const params = [];
      
      for (const candidate of candidatesWithArtistTitle) {
        conditions.push('(LOWER(artist) = LOWER(?) AND LOWER(title) = LOWER(?))');
        params.push(candidate.artist, candidate.title);
      }
      
      if (conditions.length > 0) {
        const query = `
          SELECT * FROM identified_records 
          WHERE ${conditions.join(' OR ')}
          ORDER BY created_at DESC
        `;
        
        localDbQueryCount = 1; // Single batched query
        const rows = await new Promise((resolve, reject) => {
          db.all(query, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows || []);
          });
        });
        
        // Map results back to candidates by (artist, title) key
        for (const row of rows) {
          const key = `${row.artist.toLowerCase()}|${row.title.toLowerCase()}`;
          if (!localDbMatches.has(key)) {
            localDbMatches.set(key, formatDbRecord(row));
          }
        }
        
        const batchTime = Date.now() - batchStart;
        logger.debug(`[Phase2] ✅ Batch local DB check complete: ${localDbMatches.size} matches found (${batchTime}ms, ${localDbQueryCount} query${localDbQueryCount !== 1 ? 's' : ''})`);
        debugInfo.localDbChecks = localDbMatches.size;
      }
    } catch (batchError) {
      logger.warn(`[Phase2] ⚠️  Batch local DB check failed: ${batchError.message}`);
      // Fall through to individual checks if batch fails
    }
  }
  
  // OPTIMIZATION: Batch Discogs ID fetches (parallelize)
  const candidatesWithDiscogsId = normalizedCandidates.filter(c => c.discogsId && discogsSearchCount < MAX_DISCOGS_SEARCHES);
  const discogsIdFetches = new Map(); // discogsId -> release or error
  
  if (candidatesWithDiscogsId.length > 0) {
    try {
      const batchStart = Date.now();
      logger.debug(`[Phase2] 🔍 Batch fetching ${candidatesWithDiscogsId.length} Discogs releases by ID (parallel)...`);
      
      // Fetch all Discogs IDs in parallel
      const fetchPromises = candidatesWithDiscogsId.map(async (candidate) => {
        try {
          debugInfo.discogsDirectFetches++;
          const fetchStart = Date.now();
          logger.debug(`[REQ ${resolvedReqId}] discogs_hydrate_start discogsId=${candidate.discogsId}`);
          const release = await fetchDiscogsReleaseById(candidate.discogsId, requestCache, resolvedReqId, resolvedParentSignal);
          const fetchTime = Date.now() - fetchStart;
          logHeartbeat(resolvedReqId, 'discogs_hydrate', fetchStart);
          logger.debug(`[REQ ${resolvedReqId}] discogs_hydrate_complete elapsed=${fetchTime}ms`);
          // PR2: Track Discogs usage and timing
          debugInfo.discogsUsed = true;
          if (!debugInfo.performanceMetrics.discogsMs) {
            debugInfo.performanceMetrics.discogsMs = 0;
          }
          debugInfo.performanceMetrics.discogsMs += fetchTime;
          return { discogsId: candidate.discogsId, release, candidate };
        } catch (error) {
          return { discogsId: candidate.discogsId, error, candidate };
        }
      });
      
      const fetchResults = await Promise.allSettled(fetchPromises);
      const batchTime = Date.now() - batchStart;
      
      for (const result of fetchResults) {
        if (result.status === 'fulfilled') {
          const { discogsId, release, error, candidate } = result.value;
          if (release) {
            discogsIdFetches.set(discogsId, release);
            allDiscogsReleases.push({
              discogsId: release.discogsId,
              artist: release.artist,
              title: release.title,
              year: release.year,
              coverImageRemoteUrl: release.coverImageRemoteUrl,
              source: candidate.source,
              directFetch: true,
            });
            discogsSearchCount++;
          } else if (error && !String(error.message || error).includes('TIMEOUT')) {
            logger.warn(`[Phase2] ⚠️  Direct fetch failed for ${discogsId}: ${error.message}`);
          }
        }
      }
      
      logger.debug(`[Phase2] ✅ Batch Discogs ID fetch complete: ${discogsIdFetches.size} successful (${batchTime}ms)`);
    } catch (batchError) {
      logger.warn(`[Phase2] ⚠️  Batch Discogs ID fetch failed: ${batchError.message}`);
    }
  }
  
  // Process remaining candidates (those without discogsId or not found in batch checks)
  // OPTIMIZATION: Collect candidates needing search, then run in parallel
  const candidatesNeedingSearch = [];
  
  for (let i = 0; i < normalizedCandidates.length; i++) {
    // Check Phase 2 budget before collecting candidates
    if (Date.now() > phase2Deadline) {
      logger.debug(`[REQ ${resolvedReqId}] Phase2 budget exceeded — stopping candidate collection`);
      break;
    }
    
    const candidate = normalizedCandidates[i];
    
    // PIN LOG: Prove where Phase 2 hangs
    logger.debug(`[REQ ${resolvedReqId}] phase2_candidate_begin idx=${i} source=${candidate.source || 'N/A'} hasDiscogsId=${!!candidate.discogsId} hasArtistTitle=${!!candidate.artist && !!candidate.title}`);
    
    // Skip if already fetched via batch
    if (candidate.discogsId && discogsIdFetches.has(candidate.discogsId)) {
      logger.debug(`[Phase2] 📋 [${i + 1}/${normalizedCandidates.length}] Already fetched by ID (batch): ${candidate.discogsId}`);
      continue;
    }
    
    // Skip if already found in local DB batch
    if (candidate.artist && candidate.title) {
      const key = `${candidate.artist.toLowerCase()}|${candidate.title.toLowerCase()}`;
      if (localDbMatches.has(key)) {
        const localMatch = localDbMatches.get(key);
        allDiscogsReleases.push({
          discogsId: localMatch.discogsId,
          artist: localMatch.artist,
          title: localMatch.title,
          year: localMatch.year,
          coverImageRemoteUrl: localMatch.coverImageRemoteUrl,
          source: 'local_db',
        });
        logger.debug(`[Phase2] ✅ [${i + 1}/${normalizedCandidates.length}] Found in local DB (batch): ${localMatch.artist} - ${localMatch.title}`);
        continue; // Skip Discogs search for local match
      }
    }
    
    if (!candidate.artist || !candidate.title) continue;
    
    // Check if we've hit the search limit
    if (discogsSearchCount + candidatesNeedingSearch.length >= MAX_DISCOGS_SEARCHES) {
      logger.debug(`[Phase2] ⚠️  Reached max Discogs searches (${MAX_DISCOGS_SEARCHES}), skipping remaining candidates`);
      break;
    }
    
    // Collect candidate for parallel search
    candidatesNeedingSearch.push({ candidate, index: i });
  }
  
  // OPTIMIZATION: Run Discogs searches in parallel
  if (candidatesNeedingSearch.length > 0) {
    const parallelSearchStart = Date.now();
    logger.debug(`[Phase2] 🔍 Running ${candidatesNeedingSearch.length} Discogs searches in parallel (max ${MAX_DISCOGS_SEARCHES})...`);
    
    // Check Phase 2 budget before starting parallel searches
    if (Date.now() > phase2Deadline) {
      logger.debug(`[REQ ${resolvedReqId}] Phase2 budget exceeded — skipping parallel searches`);
    } else {
      // Create search promises for all candidates (up to MAX_DISCOGS_SEARCHES)
      const candidatesToSearch = candidatesNeedingSearch.slice(0, MAX_DISCOGS_SEARCHES - discogsSearchCount);
      const searchPromises = candidatesToSearch.map(async ({ candidate, index }) => {
        const searchStart = Date.now();
        try {
          debugInfo.discogsSearches++;
          logger.debug(`[Phase2] 🔍 [${index + 1}/${normalizedCandidates.length}] Searching Discogs in parallel... artist="${candidate.artist}" title="${candidate.title}"`);
          logger.debug(`[REQ ${resolvedReqId}] discogs_search_start artist="${candidate.artist}" title="${candidate.title}"`);
          
          // Search Discogs for this candidate (discogsHttpRequest already has AbortController timeout)
          const discogsResult = await searchDiscogsEnhanced(candidate.artist, candidate.title, false, imageBuffer, resolvedReqId, resolvedParentSignal);
          
          const searchTime = Date.now() - searchStart;
          logHeartbeat(resolvedReqId, 'discogs_search', searchStart);
          logger.debug(`[REQ ${resolvedReqId}] discogs_search_complete elapsed=${searchTime}ms`);
          // PR2: Track Discogs usage and timing
          debugInfo.discogsUsed = true;
          if (!debugInfo.performanceMetrics.discogsMs) {
            debugInfo.performanceMetrics.discogsMs = 0;
          }
          debugInfo.performanceMetrics.discogsMs += searchTime;
          
          // PIN LOG: After Discogs search
          logger.debug(`[REQ ${resolvedReqId}] phase2_after_discogs_search idx=${index} ok=${!!discogsResult} resultsCount=${discogsResult?.allResults?.length || 0}`);
          
          return {
            candidate,
            index,
            discogsResult,
            searchTime,
            error: null,
          };
        } catch (discogsError) {
          const searchTime = Date.now() - searchStart;
          // Make Discogs failures non-fatal per candidate
          if (String(discogsError.message || discogsError).includes('TIMEOUT') || String(discogsError.message || discogsError).includes('Timeout')) {
            logger.debug(`[REQ ${resolvedReqId}] Discogs timeout — candidate ${index + 1}`);
          } else {
            logger.warn(`[Phase2] ⚠️  Discogs search failed for "${candidate.artist}" - "${candidate.title}": ${discogsError.message}`);
          }
          
          return {
            candidate,
            index,
            discogsResult: null,
            searchTime,
            error: discogsError,
          };
        }
      });
      
      // Wait for all searches to complete (settled, not all fulfilled - some may fail)
      const searchResults = await Promise.allSettled(searchPromises);
      const parallelSearchTime = Date.now() - parallelSearchStart;
      
      // Process results
      let successCount = 0;
      for (const result of searchResults) {
        if (result.status === 'fulfilled') {
          const { candidate, discogsResult, error } = result.value;
          
          // Track successful searches (only count if we got results and no error)
          if (discogsResult && !error) {
            successCount++;
            discogsSearchCount++;
            
            // Safely handle undefined or missing allResults array
            if (discogsResult.allResults && Array.isArray(discogsResult.allResults) && discogsResult.allResults.length > 0) {
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
          }
        } else {
          // Promise.allSettled rejection (shouldn't happen, but handle gracefully)
          logger.warn(`[Phase2] ⚠️  Parallel search promise rejected: ${result.reason}`);
        }
      }
      
      logger.debug(`[Phase2] ✅ Parallel Discogs searches complete: discogs_parallel_count=${candidatesToSearch.length}, success=${successCount}, elapsedMs=${parallelSearchTime}`);
      
      // Check Phase 2 budget after parallel searches
      if (Date.now() > phase2Deadline) {
        logger.debug(`[REQ ${resolvedReqId}] Phase2 budget exceeded after parallel searches`);
      }
    }
  }
  
  // Log query count improvement
  const expectedQueries = normalizedCandidates.length;
  const actualQueries = localDbQueryCount + (discogsIdFetches.size > 0 ? 1 : 0); // Batch counts as 1
  logger.debug(`[Phase2] 📊 Query optimization: ${expectedQueries} candidates → ${actualQueries} DB queries (${expectedQueries - actualQueries} queries saved)`);

  // Check if Phase 2 budget was exceeded
  const budgetExceeded = Date.now() > phase2Deadline;
  if (budgetExceeded) {
    logger.debug(`[REQ ${resolvedReqId}] Phase2 budget exceeded — processed ${normalizedCandidates.length} candidates, found ${allDiscogsReleases.length} releases`);
  }
  
  if (allDiscogsReleases.length === 0) {
    logger.debug(`[Phase2] ❌ No Discogs releases found for any candidate`);
    
    // Return gracefully if Phase 2 produces no confirmed match
    logger.debug(`[REQ ${resolvedReqId}] Phase2: No confirmed Discogs match — returning structured response`);
    // Return structured response instead of null to prevent client timeout
    return {
      success: false,
      reason: budgetExceeded ? 'PHASE2_BUDGET_EXCEEDED' : 'NO_CONFIRMED_DISCOGS_MATCH',
      candidatesTried: normalizedCandidates.length,
      reqId: resolvedReqId
    };
  }

  // NEW: Score all releases using explicit scoring system (embeddings are first-class)
  logger.debug(`[Phase2] 📊 Scoring ${allDiscogsReleases.length} Discogs releases (with ${embeddingSignals.length} embedding neighbors)...`);
  const scoredReleases = scoreAndSortReleases(
    allDiscogsReleases,
    visionSignals,
    ocrParsedForScoring,  // Use enhanced ocrParsed (includes text input data)
    embeddingSignals,  // Array of embedding matches
    extractedBarcode
  );

  // DEBUG: Log scoring details if enabled
  if (config.logging.debugScoring && scoredReleases.length > 0) {
    logger.debug(`[Debug] 📊 Top 3 scored releases:`);
    for (const release of scoredReleases.slice(0, 3)) {
      logger.debug(`[Debug]   ${release.artist} - ${release.title}:`);
      logger.debug(`[Debug]     - Score: ${safeToFixed(release.score, 3)}`);
      logger.debug(`[Debug]     - Artist similarity: ${safeToFixed(release.artistSimilarity, 3)}`);
      logger.debug(`[Debug]     - Title similarity: ${safeToFixed(release.titleSimilarity, 3)}`);
      // Find embedding match for this release
      const embeddingMatch = embeddingSignals.find(m => String(m.discogsId) === String(release.discogsId));
      if (embeddingMatch) {
        logger.debug(`[Debug]     - Embedding similarity: ${safeToFixed(embeddingMatch.similarity, 3)} (contribution: ${safeToFixed(embeddingMatch.similarity * 0.20, 3)})`);
      } else {
        logger.debug(`[Debug]     - Embedding similarity: 0.000 (no match)`);
      }
    }
  }

  // NEW: Group variants and select best from each group
  const groupedReleases = selectBestFromGroups(scoredReleases);
  logger.debug(`[Phase2] 📊 Grouped into ${groupedReleases.length} canonical albums (from ${scoredReleases.length} releases)`);

  // NEW: Determine response type using dual thresholds
  const responseType = determineResponseType(groupedReleases);
  logger.debug(`[Phase2] 📊 Response type: ${responseType.type} (best score: ${safeToFixed(groupedReleases[0]?.score, 3)})`);

  // Get full release details for the best match(es)
  let bestRelease = null;
  if (responseType.releases.length > 0) {
    const topRelease = responseType.releases[0];
    try {
      // Fetch full release details from Discogs (with timeout)
      const releaseUrl = `https://api.discogs.com/releases/${topRelease.discogsId}`;
      const headers = {
        'User-Agent': 'SlotSync/1.0.0 (contact@slotsync.app)',
      };
      if (DISCOGS_PERSONAL_ACCESS_TOKEN) {
        headers['Authorization'] = `Discogs token=${DISCOGS_PERSONAL_ACCESS_TOKEN}`;
      }
      
      const release = await discogsHttpRequest(
        releaseUrl,
        {
          params: DISCOGS_PERSONAL_ACCESS_TOKEN ? {} : {
            key: DISCOGS_API_KEY,
            secret: DISCOGS_API_SECRET,
          },
          headers,
        },
        {
          timeoutMs: DISCOGS_FETCH_TIMEOUT_MS,
          reqId: resolvedReqId,
          op: 'release_fetch',
          meta: { discogsId: topRelease.discogsId },
          parentSignal: resolvedParentSignal
        }
      );
      
      // Safely extract tracks - handle missing or invalid release object
      if (!release || typeof release !== 'object') {
        throw new Error('Release details fetch returned invalid response');
      }
      
      const tracks = [];
      const tracklist = Array.isArray(release?.tracklist) ? release.tracklist : [];
      if (tracklist.length > 0) {
        for (const track of tracklist) {
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

      bestRelease = {
        artist: topRelease.artist,
        title: topRelease.title,
        year: topRelease.year || release.year || null,
        discogsId: topRelease.discogsId,
        coverImageUrl: topRelease.coverImageRemoteUrl || release.cover_image || null,
        confidence: topRelease.score,
        source: topRelease.source || 'discogs_scored',
        tracks: tracks.length > 0 ? tracks : null,
        genres: release.genres || [],
        styles: release.styles || [],
      };
    } catch (releaseError) {
      logger.warn(`[Phase2] ⚠️  Failed to fetch full release details: ${releaseError.message}`);
      // Use basic info from search result
      bestRelease = {
        artist: topRelease.artist,
        title: topRelease.title,
        year: topRelease.year || null,
        discogsId: topRelease.discogsId,
        coverImageUrl: topRelease.coverImageRemoteUrl || null,
        confidence: topRelease.score,
        source: topRelease.source || 'discogs_scored',
        tracks: null,
      };
    }
  }

  if (responseType.type === 'auto_accept' && bestRelease) {
    // Auto-accept: return single best match
    debugInfo.responseType = responseType.type; // Store for debug output
    logger.debug(`[Phase2] ✅ Auto-accept: returning best match (score: ${safeToFixed(bestRelease.score, 3)})`);
    return bestRelease;
  } else if (responseType.type === 'suggestions' && bestRelease) {
    // Suggestions: return best match but mark as medium confidence
    // Store suggestions on debugInfo for later use
    debugInfo.responseType = responseType.type; // Store for debug output
    debugInfo.suggestions = responseType.releases.map(r => ({
      artist: r.artist,
      title: r.title,
      year: r.year,
      discogsId: r.discogsId,
      score: r.score,
    }));
    // Keep original confidence score (it's between SUGGESTIONS_THRESHOLD and AUTO_ACCEPT_THRESHOLD)
    // Status will be determined in response building based on actual score
    logger.debug(`[Phase2] 📊 Suggestions: returning best match with ${responseType.releases.length} total suggestions (best score: ${safeToFixed(bestRelease.score, 3)})`);
    return bestRelease;
  } else {
    // Low confidence: return null (will trigger suggestions response)
    // CRITICAL: Store responseType in debugInfo so we can use it later
    debugInfo.lowConfidence = true;
    debugInfo.responseType = responseType.type; // Store for debug output
    debugInfo.suggestions = responseType.releases.map(r => ({
      artist: r.artist,
      title: r.title,
      year: r.year,
      discogsId: r.discogsId,
      score: r.score,
    }));
    logger.debug(`[Phase2] 📊 Low confidence: returning ${responseType.releases.length} suggestions (scores: ${responseType.releases.map(r => safeToFixed(r.score, 3)).join(', ')})`);
    return null;
  }
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
      logger.debug(`[Phase3] 🔄 Using unified resolver for "${bestAlbum.artist}" - "${bestAlbum.title}"`);
      const unifiedMetadata = await resolveAlbumMetadata(bestAlbum.artist, bestAlbum.title);
      
      if (unifiedMetadata && unifiedMetadata.coverImage) {
        logger.debug(`[Phase3] ✅ Unified resolver returned HQ cover art: ${unifiedMetadata.coverImage ? 'YES' : 'NO'}`);
        
        // Build enriched result from unified metadata
        const enriched = {
          artist: unifiedMetadata.canonicalArtist || unifiedMetadata.artist || bestAlbum.artist,
          title: unifiedMetadata.canonicalAlbum || unifiedMetadata.album || bestAlbum.title,
          year: unifiedMetadata.releaseYear || bestAlbum.year || null,
          discogsId: unifiedMetadata.discogsId || bestAlbum.discogsId || null,
          musicbrainz: unifiedMetadata.mbid ? { mbid: unifiedMetadata.mbid } : bestAlbum.musicbrainz || null,
          // CRITICAL: ALWAYS use HQ cover art from unified resolver, NEVER user photo
          coverImageUrl: unifiedMetadata.coverImage, // ALWAYS from API
          tracks: Array.isArray(unifiedMetadata.tracks) ? unifiedMetadata.tracks.map(t => ({
            title: t.title,
            trackNumber: t.number,
            discNumber: t.discNumber || null,
            durationSeconds: t.durationMs ? Math.floor(t.durationMs / 1000) : null,
          })) : [],
          genres: unifiedMetadata.genres || [],
          styles: unifiedMetadata.styles || [],
          confidence: unifiedMetadata.confidence || bestAlbum.confidence || 0.7,
          source: 'unified_resolver',
        };
        
        logger.debug(`[Phase3] ✅ Enriched with unified resolver: ${enriched.tracks.length} tracks, cover: ${enriched.coverImageUrl ? 'YES' : 'NO'}`);
        return enriched;
      } else {
        logger.debug(`[Phase3] ⚠️  Unified resolver found no cover art, falling back to legacy enrichment`);
        // Fall through to legacy enrichment
      }
    } catch (unifiedError) {
      logger.warn(`[Phase3] ⚠️  Unified resolver failed: ${unifiedError.message}, falling back to legacy enrichment`);
      // Fall through to legacy enrichment
    }
  }
  
  // Legacy enrichment (fallback if unified resolver fails or no artist/title)
  const DISCOGS_PERSONAL_ACCESS_TOKEN = config.discogs.personalAccessToken;
  const DISCOGS_API_KEY = config.discogs.apiKey;
  const DISCOGS_API_SECRET = config.discogs.apiSecret;

  const primary = {
    artist: bestAlbum.artist,
    title: bestAlbum.title,
    year: bestAlbum.year || null,
    discogsId: bestAlbum.discogsId || null,
    musicbrainz: bestAlbum.musicbrainz || null,
    tracks: Array.isArray(bestAlbum.tracks) ? bestAlbum.tracks : [],
    coverImageUrl: bestAlbum.coverImageUrl || null,
    genres: [],
    styles: [],
    confidence: bestAlbum.confidence,
    source: bestAlbum.source,
  };

  // Fetch Discogs release details (primary source)
  if (primary.discogsId) {
    try {
      logger.debug(`[Phase3] 📀 Fetching Discogs release: ${primary.discogsId}`);
      const headers = {
        'User-Agent': 'SlotSync/1.0.0 (contact@slotsync.app)',
      };
      if (DISCOGS_PERSONAL_ACCESS_TOKEN) {
        headers['Authorization'] = `Discogs token=${DISCOGS_PERSONAL_ACCESS_TOKEN}`;
      }

      const releaseUrl = `https://api.discogs.com/releases/${primary.discogsId}`;
      const release = await discogsHttpRequest(
        releaseUrl,
        {
          params: DISCOGS_PERSONAL_ACCESS_TOKEN ? {} : {
            key: DISCOGS_API_KEY,
            secret: DISCOGS_API_SECRET,
          },
          headers: headers,
        },
        {
          timeoutMs: config.discogs.fetchTimeoutMs,
          reqId: 'N/A',
          op: 'release_fetch',
          meta: { discogsId: primary.discogsId }
        }
      );
      
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
      // Safely handle tracklist - ensure release and tracklist exist
      const tracklist = (release && Array.isArray(release.tracklist)) ? release.tracklist : [];
      if (primary.tracks.length === 0 && tracklist.length > 0) {
        for (const track of tracklist) {
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
        logger.debug(`[Phase3] ✅ Extracted ${primary.tracks.length} tracks from Discogs`);
      }

      // Extract cover image
      if (release.images && release.images.length > 0) {
        primary.coverImageUrl = release.images[0].uri || release.images[0].resource_url || null;
      }

    } catch (discogsError) {
      logger.warn(`[Phase3] ⚠️  Discogs release fetch failed: ${discogsError.message}`);
      debugInfo.errors.push(`Discogs release fetch: ${discogsError.message}`);
    }
  }

  // MusicBrainz enrichment (fallback + additional data)
  if (primary.musicbrainz?.mbid) {
    try {
      logger.debug(`[Phase3] 🎵 Fetching MusicBrainz release: ${primary.musicbrainz.mbid}`);
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
          logger.debug(`[Phase3] ✅ MusicBrainz provided ${primary.tracks.length} tracks`);
        }

        // Use MusicBrainz year if missing
        if (!primary.year && mbDetails.year) {
          primary.year = mbDetails.year;
        }
      }
    } catch (mbError) {
      logger.warn(`[Phase3] ⚠️  MusicBrainz enrichment failed: ${mbError.message}`);
      debugInfo.errors.push(`MusicBrainz enrichment: ${mbError.message}`);
    }
  }

  // Cover Art Archive fallback
  if ((!primary.coverImageUrl || primary.coverImageUrl.includes('spacer.gif')) && primary.musicbrainz?.mbid) {
    try {
      logger.debug(`[Phase3] 🖼️  Fetching cover art from CAA...`);
      const caaUrl = await getCoverArtUrlForRelease(primary.musicbrainz.mbid);
      if (caaUrl) {
        primary.coverImageUrl = caaUrl;
        debugInfo.coverArtArchiveUsed = true;
        logger.debug(`[Phase3] ✅ Cover Art Archive provided cover image`);
      }
    } catch (caaError) {
      logger.warn(`[Phase3] ⚠️  Cover Art Archive failed: ${caaError.message}`);
    }
  }

  logger.debug(
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

// Create identify record route with dependencies
// Note: db is initialized asynchronously, so we'll create the route after db is ready
let identifyRecordRoute = null;

function createIdentifyRecordRouteHandler() {
  if (!identifyRecordRoute) {
    identifyRecordRoute = createIdentifyRecordRoute({
      generateCandidatesFromInput,
      resolveBestAlbum,
      enrichAlbumMetadata,
      getScanEmbedding,
      storeInLocalDatabase,
      ensureRecordEmbedding,
      db,
      upload,
    });
    // Mount the route
    app.use('/api/identify-record', identifyRecordRoute);
  }
  return identifyRecordRoute;
}

// Route handler is now in backend-example/routes/identifyRecord.js
// OLD HANDLER REMOVED - The handler code has been moved to routes/identifyRecord.js

// ============================================================================
// HEALTH CHECK & API INFO ENDPOINTS
// ============================================================================

/**
 * GET /api/debug/env
 * 
 * Debug endpoint for environment configuration (dev only).
 * 
 * HTTP Status Code Contract:
 * - 403: Production mode (debug endpoints disabled)
 * - 200: Environment info JSON
 */
app.get('/api/debug/env', (req, res) => {
  if (config.IS_PRODUCTION) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Debug endpoint disabled in production'
    });
  }
  
  const credsPath = config.googleVision.credentialsPath;
  let googleCreds = {
    present: !!credsPath,
    path: credsPath ? path.basename(credsPath) : null, // Sanitize: only basename
    readable: false,
    fileExists: false,
  };
  
  if (credsPath) {
    try {
      const absPath = path.isAbsolute(credsPath) ? credsPath : path.resolve(__dirname, credsPath);
      googleCreds.fileExists = fs.existsSync(absPath);
      if (googleCreds.fileExists) {
        const stats = fs.statSync(absPath);
        googleCreds.readable = stats.isFile() && (stats.mode & parseInt('444', 8)) !== 0;
      }
    } catch (error) {
      // Error reading file
    }
  }
  
  const discogsToken = DISCOGS_PERSONAL_ACCESS_TOKEN || DISCOGS_API_KEY;
  const discogsInfo = {
    present: !!discogsToken,
    // PR0: No secrets in debug output - removed len and prefix
  };
  
  const os = require('os');
  const networkInterfaces = os.networkInterfaces();
  let host = '0.0.0.0';
  for (const interfaceName of Object.keys(networkInterfaces)) {
    const addresses = networkInterfaces[interfaceName];
    for (const addr of addresses) {
      if (addr.family === 'IPv4' && !addr.internal) {
        host = addr.address;
        break;
      }
    }
    if (host !== '0.0.0.0') break;
  }
  
  res.json({
    googleCreds,
    discogsToken: discogsInfo,
    apiBase: {
      listeningPort: PORT,
      host: host,
    },
  });
});

/**
 * GET /api/debug/vision
 * 
 * Debug endpoint for Google Vision configuration (dev only).
 * 
 * HTTP Status Code Contract:
 * - 403: Production mode (debug endpoints disabled)
 * - 200: Vision configuration info JSON
 */
app.get('/api/debug/vision', (req, res) => {
  if (config.IS_PRODUCTION) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Debug endpoint disabled in production'
    });
  }
  
  const credsPath = validatedCredentialsPath || config.googleVision.credentialsPath;
  const result = {
    hasVisionLibrary: !!ImageAnnotatorClient,
    credentialsEnvSet: !!config.googleVision.credentialsPath,
    credentialsPath: credsPath ? path.basename(credsPath) : null, // Sanitize: only basename
    credentialsFileExists: credsPath ? fs.existsSync(credsPath) : false,
    credentialsValidated: credentialsValidationResult ? credentialsValidationResult.ok : false,
    validationReason: credentialsValidationResult && !credentialsValidationResult.ok 
      ? credentialsValidationResult.reason 
      : (credentialsValidationResult && credentialsValidationResult.ok ? 'Valid service account key' : null),
    visionClientInitialized: visionClient !== null,
    visionClientInitError: visionClientInitError || null,
  };
  
  res.json(result);
});

// ============================================================================
// Routes: Health Check
// ============================================================================
const healthRoutes = require('./routes/health');
app.use('/', healthRoutes);

/**
 * GET /api
 * 
 * API information endpoint.
 * 
 * HTTP Status Code Contract:
 * - 200: API info JSON (always succeeds)
 */
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

/**
 * POST /api/feedback
 * 
 * Logs user feedback for record identifications.
 * 
 * HTTP Status Code Contract:
 * - 400: Invalid input (missing imageHash)
 * - 200: Feedback logged successfully
 * - 500: Unexpected server error
 */
app.post('/api/feedback', async (req, res) => {
  try {
    const { imageHash, finalDiscogsId, finalRecordId, source = 'scan' } = req.body;
    
    if (!imageHash) {
      return res.status(400).json({
        error: 'MISSING_PARAMETER',
        message: 'imageHash is required',
        details: { required: ['imageHash'] }
      });
    }
    
    // Get candidates from request (if provided)
    const candidates = req.body.candidates || [];
    
    await logFeedback({
      imageHash,
      finalRecordId: finalRecordId || null,
      finalDiscogsId: finalDiscogsId || null,
      candidates,
      visionSummary: req.body.visionSummary || {},
      ocrSummary: req.body.ocrSummary || {},
      source,
    });
    
    res.json({ success: true, message: 'Feedback logged' });
  } catch (error) {
    logger.error('[API] Error logging feedback:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to log feedback',
      details: { originalError: error.message }
    });
  }
});

/**
 * POST /api/metadata/resolve-by-text
 * 
 * Resolves album metadata by artist and album title text.
 * Always uses HQ cover art from APIs, never user photos.
 * 
 * HTTP Status Code Contract:
 * - 400: Invalid input (missing artist or albumTitle)
 * - 200: Metadata resolved (even if no cover art found)
 * - 500: Unexpected server error
 */
app.post('/api/metadata/resolve-by-text', async (req, res) => {
  try {
    const { artist, albumTitle } = req.body;

    if (!artist || !albumTitle) {
      return res.status(400).json({
        error: 'MISSING_PARAMETER',
        message: 'Artist and albumTitle are required',
        details: { required: ['artist', 'albumTitle'] }
      });
    }

    logger.debug(`[API] Unified metadata resolution: "${artist}" - "${albumTitle}"`);

    // Use unified resolver - ALWAYS returns HQ cover art from APIs
    const metadata = await resolveAlbumMetadata(artist.trim(), albumTitle.trim());

    if (!metadata || !metadata.coverImage) {
      logger.warn(`[API] ⚠️  No cover art found for "${artist}" - "${albumTitle}"`);
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
    logger.error('[API] Unified metadata resolution error:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Metadata resolution failed',
      details: { originalError: error.message },
      // Legacy fields for backward compatibility
      success: false
    });
  }
});

// Identify album by text (artist + title) - for CSV imports and manual entry
// NOW USES UNIFIED RESOLVER - ALWAYS returns HQ cover art
/**
 * Simple text-based record identification (manual lookup)
 * 
 * This is a dedicated, fast, reliable function for manual artist + title lookup.
 * It does NOT use:
 * - Image embeddings
 * - Google Vision
 * - Image hash cache
 * - Complex scoring with Vision/embedding signals
 * 
 * It DOES use:
 * - Direct Discogs search with multiple query patterns
 * - Simple text-based similarity scoring
 * - MusicBrainz as fallback
 * 
 * @param {string} artist - Artist name
 * @param {string} title - Album title
 * @returns {Promise<Object>} Identification result with bestMatch and alternates
 */
async function identifyRecordByText(artist, title) {
  logger.debug(`[TextLookup] 🔍 Manual text lookup: "${artist}" - "${title}"`);
  
  // Create request-scoped cache for this lookup
  const requestCache = new Map();
  
  // Step 1: Search Discogs (optionally use global cache for search results)
  const cacheKey = `${normalizeForSearch(artist)}|${normalizeForSearch(title)}`;
  const cachedSearch = globalSearchCache.get(cacheKey);
  let discogsResult;
  
  if (cachedSearch && (Date.now() - cachedSearch.timestamp < SEARCH_CACHE_TTL)) {
    logger.debug(`[TextLookup] ✅ Search cache hit for "${artist}" - "${title}"`);
    discogsResult = cachedSearch.data;
  } else {
    // Search Discogs directly (no Vision, no embeddings)
    // Note: identifyRecordByText doesn't have reqId, so use 'N/A'
    // Remove withTimeout wrapper - searchDiscogsEnhanced uses discogsHttpRequest which has AbortController timeout
    discogsResult = await searchDiscogsEnhanced(artist, title, true, null, 'N/A', null);
    // Cache successful searches only
    if (discogsResult.bestMatch) {
      globalSearchCache.set(cacheKey, {
        data: discogsResult,
        timestamp: Date.now(),
      });
    }
  }
  
  if (!discogsResult.bestMatch) {
    // Fallback to MusicBrainz if Discogs fails
    logger.debug(`[TextLookup] 🔄 Discogs found nothing, trying MusicBrainz fallback...`);
    try {
      const mbRelease = await searchReleaseByArtistAndTitle(artist, title);
      if (mbRelease && mbRelease.mbid) {
        let coverImageUrl = null;
        try {
          coverImageUrl = await getCoverArtUrlForRelease(mbRelease.mbid);
        } catch (caaError) {
          // Non-critical
        }
        
        // CRITICAL: Fetch full release details with tracks
        let tracks = [];
        try {
          logger.debug(`[TextLookup] 📥 Fetching MusicBrainz release details with tracks for mbid: ${mbRelease.mbid}`);
          const mbDetails = await getReleaseDetailsWithTracks(mbRelease.mbid);
          if (mbDetails && mbDetails.tracks && Array.isArray(mbDetails.tracks) && mbDetails.tracks.length > 0) {
            // Convert MusicBrainz tracks to our format
            tracks = mbDetails.tracks.map(t => ({
              title: t.title,
              trackNumber: t.trackNumber || null,
              discNumber: t.disc || null,
              durationSeconds: t.lengthMs ? Math.floor(t.lengthMs / 1000) : null,
            }));
            logger.debug(`[TextLookup] ✅ Fetched ${tracks.length} tracks from MusicBrainz`);
          } else {
            logger.debug(`[TextLookup] ⚠️  MusicBrainz release details returned no tracks`);
          }
        } catch (tracksError) {
          logger.warn(`[TextLookup] ⚠️  Failed to fetch MusicBrainz tracks: ${tracksError.message}`);
          // Continue without tracks
        }
        
        return {
          bestMatch: {
            artist: mbRelease.artist,
            title: mbRelease.title,
            year: mbRelease.year || null,
            coverImageRemoteUrl: coverImageUrl,
            discogsId: null,
            confidence: 0.7, // Lower confidence for MusicBrainz-only
            source: 'musicbrainz_fallback',
            tracks: tracks, // Always an array (never null)
          },
          alternates: [],
        };
      }
    } catch (mbError) {
      logger.warn(`[TextLookup] ⚠️  MusicBrainz fallback failed: ${mbError.message}`);
    }
    
    // No results from either source
    return {
      bestMatch: null,
      alternates: [],
    };
  }
  
  // Step 2: Simple text-based scoring for Discogs results
  // Use similarity scores already calculated by searchDiscogsEnhanced
  const { similarityScore } = require('./services/similarityUtils');
  
  // Score each result with simple text-based scoring
  // Safely handle undefined or missing allResults array
  const allResults = (discogsResult && discogsResult.allResults && Array.isArray(discogsResult.allResults)) 
    ? discogsResult.allResults 
    : [];
  const scoredResults = allResults.map(result => {
    const artistSim = similarityScore(artist, result.artist);
    const titleSim = similarityScore(title, result.title);
    
    // Simple weighted score: 60% artist, 40% title
    const textScore = (artistSim * 0.6) + (titleSim * 0.4);
    
    return {
      ...result,
      textScore, // Add text-based score
      artistSimilarity: artistSim,
      titleSimilarity: titleSim,
    };
  });
  
  // Sort by text score (highest first), but prefer earlier release years when scores are close
  // This helps select original releases over reissues (e.g., Back in Black 1980 vs 2009)
  scoredResults.sort((a, b) => {
    const scoreDiff = b.textScore - a.textScore;
    
    // If text scores are very close (within 0.05), prefer earlier release year
    if (Math.abs(scoreDiff) < 0.05) {
      const yearA = a.year || 9999; // Treat missing year as very recent (low priority)
      const yearB = b.year || 9999;
      
      // Prefer earlier year (original release over reissue)
      if (yearA !== yearB) {
        return yearA - yearB; // Lower year = earlier = better
      }
    }
    
    // Otherwise, sort by text score (higher is better)
    return scoreDiff;
  });
  
  // Step 3: Determine best match and alternates
  const bestResult = scoredResults[0];
  const bestScore = bestResult.textScore;
  
  // Log top results for debugging
  logger.debug(`[TextLookup] 📊 Top 3 text-scored results (sorted by score, preferring earlier years):`);
  for (let i = 0; i < Math.min(3, scoredResults.length); i++) {
    const r = scoredResults[i];
    logger.debug(`[TextLookup]   ${i + 1}. ${r.artist} - ${r.title} (${r.year || 'no year'}): textScore=${r.textScore.toFixed(3)} (artist=${r.artistSimilarity.toFixed(3)}, title=${r.titleSimilarity.toFixed(3)})`);
  }
  
  // Determine confidence and response type
  let confidence = bestScore;
  if (bestScore >= 0.9) {
    confidence = 0.95; // Very high confidence for near-perfect matches
  } else if (bestScore >= 0.7) {
    confidence = 0.85; // High confidence for good matches
  } else if (bestScore >= 0.5) {
    confidence = 0.70; // Medium confidence
  } else {
    confidence = Math.max(0.5, bestScore); // Low but still valid
  }
  
  // Get full release details for best match (includes tracks, genres, styles)
  // Use fetchDiscogsReleaseById which now has request-scoped + global caching
  let fullReleaseDetails = null;
  if (bestResult.discogsId) {
    try {
      logger.debug(`[TextLookup] 📥 Fetching full release details for discogsId: ${bestResult.discogsId}`);
      // Remove withTimeout wrapper - fetchDiscogsReleaseById uses discogsHttpRequest which has AbortController timeout
      fullReleaseDetails = await fetchDiscogsReleaseById(bestResult.discogsId, requestCache, 'N/A', null);
      if (fullReleaseDetails) {
        logger.debug(`[TextLookup] ✅ Fetched full release: ${fullReleaseDetails.tracks?.length || 0} tracks`);
      } else {
        logger.debug(`[TextLookup] ⚠️  fetchDiscogsReleaseById returned null for discogsId: ${bestResult.discogsId}`);
      }
    } catch (fetchError) {
      logger.warn(`[TextLookup] ⚠️  Failed to fetch full release details: ${fetchError.message}`);
      // Continue without full details - will use search result data
    }
  } else {
    logger.debug(`[TextLookup] ⚠️  No discogsId available for full release fetch`);
  }
  
  // Extract tracks from full release or use from discogsResult
  // CRITICAL: Always return an array (never null) for tracks
  let tracks = [];
  if (fullReleaseDetails?.tracks && Array.isArray(fullReleaseDetails.tracks) && fullReleaseDetails.tracks.length > 0) {
    tracks = fullReleaseDetails.tracks;
    logger.debug(`[TextLookup] ✅ Using ${tracks.length} tracks from full release details`);
  } else if (discogsResult.bestMatch?.tracks && Array.isArray(discogsResult.bestMatch.tracks) && discogsResult.bestMatch.tracks.length > 0) {
    tracks = discogsResult.bestMatch.tracks;
    logger.debug(`[TextLookup] ✅ Using ${tracks.length} tracks from search result`);
  } else {
    logger.debug(`[TextLookup] ⚠️  No tracks found in full release or search result`);
    tracks = []; // Ensure it's always an array
  }
  
  // Clean artist name from Discogs disambiguation numbers
  // Use artist from full release details if available (more accurate), otherwise use from search result
  const releaseArtist = fullReleaseDetails?.artist ? cleanDiscogsArtistName(fullReleaseDetails.artist) : null;
  const finalArtist = releaseArtist || cleanDiscogsArtistName(bestResult.artist);
  
  const bestMatch = {
    artist: finalArtist,
    title: bestResult.title,
    year: bestResult.year || fullReleaseDetails?.year || null,
    coverImageRemoteUrl: bestResult.coverImageRemoteUrl || fullReleaseDetails?.images?.[0]?.uri || null,
    discogsId: bestResult.discogsId,
    confidence: confidence,
    source: 'discogs_text_search',
    tracks: tracks,
    genres: fullReleaseDetails?.genres || discogsResult.bestMatch?.genres || [],
    styles: fullReleaseDetails?.styles || discogsResult.bestMatch?.styles || [],
  };
  
  // Get alternates (next best results with score >= 0.5)
  // Clean artist names from Discogs disambiguation numbers
  const alternates = scoredResults
    .slice(1)
    .filter(r => r.textScore >= 0.5)
    .slice(0, 4)
    .map(r => ({
      artist: cleanDiscogsArtistName(r.artist),
      title: r.title,
      year: r.year || null,
      coverImageRemoteUrl: r.coverImageRemoteUrl || null,
      discogsId: r.discogsId,
      confidence: Math.max(0.5, r.textScore),
      source: 'discogs_text_search',
    }));
  
  logger.debug(`[TextLookup] ✅ Best match: "${bestMatch.artist}" - "${bestMatch.title}" (score: ${bestScore.toFixed(3)}, confidence: ${confidence.toFixed(3)})`);
  logger.debug(`[TextLookup] ✅ Tracks: ${bestMatch.tracks?.length || 0}`);
  logger.debug(`[TextLookup] ✅ Found ${alternates.length} alternate suggestions`);
  
  return {
    bestMatch,
    alternates,
  };
}

/**
 * POST /api/identify-by-text
 * 
 * Simple text-based record identification (manual lookup).
 * This is a dedicated, fast, reliable function for manual artist + title lookup.
 * 
 * Does NOT use: Image embeddings, Google Vision, image processing
 * DOES use: Direct Discogs search, simple text-based scoring
 * 
 * HTTP Status Code Contract:
 * - 400: Invalid input (missing artist or title)
 * - 200: Valid request - always returns 200 with status field:
 *   - status: 'ok' (match found) - includes bestMatch and suggestions
 *   - status: 'no_match' (no matches found) - includes empty suggestions
 * - 500: Unexpected server error
 */
app.post('/api/identify-by-text', async (req, res) => {
  try {
    const { artist, title } = req.body;

    if (!artist || !title) {
      return res.status(400).json({
        error: 'MISSING_PARAMETER',
        message: 'Both artist and title are required for text lookup',
        details: { required: ['artist', 'title'] },
        // Legacy fields for backward compatibility
        success: false
      });
    }

    logger.debug(`\n[API] ========================================`);
    logger.debug(`[API] 📥 INCOMING REQUEST: /api/identify-by-text`);
    logger.debug(`[API] 📍 Artist: "${artist}"`);
    logger.debug(`[API] 📍 Title: "${title}"`);
    logger.debug(`[API] ========================================\n`);

    // Use dedicated text-based identification (no Vision, no embeddings)
    const result = await identifyRecordByText(artist.trim(), title.trim());

    // CRITICAL: Return 200 even if no match found (valid request, just no results)
    if (!result.bestMatch) {
      return res.status(200).json({
        status: 'no_match',
        message: `Could not find album "${title}" by "${artist}". Please check spelling or try manual entry.`,
        suggestions: [],
        // Legacy fields for backward compatibility
        success: false,
        code: 'NOT_FOUND',
        error: 'Could not find album'
      });
    }

    // Format response to match frontend expectations
    const response = {
      status: 'ok', // Match found
      bestMatch: {
        artist: result.bestMatch.artist,
        title: result.bestMatch.title,
        year: result.bestMatch.year,
        coverImageRemoteUrl: result.bestMatch.coverImageRemoteUrl,
        discogsId: result.bestMatch.discogsId,
        tracks: result.bestMatch.tracks || [],
        genres: result.bestMatch.genres || [],
        styles: result.bestMatch.styles || [],
      },
      suggestions: result.alternates.map(alt => ({
        artist: cleanDiscogsArtistName(alt.artist),
        title: alt.title,
        year: alt.year,
        coverImageRemoteUrl: alt.coverImageRemoteUrl,
        discogsId: alt.discogsId,
        confidence: alt.confidence,
      })),
      // Legacy fields for backward compatibility
      success: true,
      confidence: result.bestMatch.confidence,
      alternates: result.alternates.map(alt => ({
        artist: cleanDiscogsArtistName(alt.artist),
        title: alt.title,
        year: alt.year,
        coverImageRemoteUrl: alt.coverImageRemoteUrl,
        discogsId: alt.discogsId,
        confidence: alt.confidence,
      })),
    };

    logger.debug(`[API] ✅ Text identification success: "${response.bestMatch.artist}" - "${response.bestMatch.title}"`);
    logger.debug(`[API] ✅ Confidence: ${response.confidence.toFixed(3)}`);
    logger.debug(`[API] ✅ Tracks: ${response.bestMatch.tracks.length}`);
    logger.debug(`[API] ✅ Alternates: ${response.alternates.length}`);

    res.json(response);
  } catch (error) {
    logger.error('[API] Text identification error:', error);
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Text identification failed',
      details: { originalError: error.message },
      // Legacy fields for backward compatibility
      success: false
    });
  }
});

/**
 * GET /api/discogs/release/:id
 * 
 * Fetches a Discogs release by ID.
 * 
 * HTTP Status Code Contract:
 * - 400: Invalid input (invalid release ID format)
 * - 503: Service unavailable (Discogs API not configured)
 * - 404: Release not found
 * - 200: Release data
 * - 500: Unexpected server error
 */
app.get('/api/discogs/release/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const releaseId = parseInt(id, 10);

    if (!releaseId || isNaN(releaseId)) {
      return res.status(400).json({
        error: 'INVALID_PARAMETER',
        message: 'Invalid release ID',
        details: { parameter: 'id', value: id }
      });
    }

    if (!DISCOGS_PERSONAL_ACCESS_TOKEN && !DISCOGS_API_KEY) {
      return res.status(503).json({
        error: 'SERVICE_UNAVAILABLE',
        message: 'Discogs API not configured'
      });
    }

    const headers = {
      'User-Agent': 'SlotSync/1.0.0 (contact@slotsync.app)',
    };

    if (DISCOGS_PERSONAL_ACCESS_TOKEN) {
      headers['Authorization'] = `Discogs token=${DISCOGS_PERSONAL_ACCESS_TOKEN}`;
    }

    logger.debug(`[API] Fetching Discogs release ${releaseId}...`);

    // Use shared Discogs HTTP helper with AbortController (lowest network layer)
    const DISCOGS_FETCH_TIMEOUT_MS = config.discogs.fetchTimeoutMs;
    const releaseUrl = `https://api.discogs.com/releases/${releaseId}`;
    const release = await discogsHttpRequest(
      releaseUrl,
      {
        params: DISCOGS_PERSONAL_ACCESS_TOKEN ? {} : {
          key: DISCOGS_API_KEY,
          secret: DISCOGS_API_SECRET,
        },
        headers,
      },
      {
        timeoutMs: DISCOGS_FETCH_TIMEOUT_MS,
        reqId: 'N/A',
        op: 'release_endpoint',
        meta: { releaseId }
      }
    );

    // Extract artist and clean Discogs disambiguation numbers
    const rawArtist = release.artists?.[0]?.name || 'Unknown Artist';
    const artist = cleanDiscogsArtistName(rawArtist);

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

    logger.debug(`[API] ✅ Fetched Discogs release ${releaseId}: ${artist} - ${release.title}`);

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
    logger.error('[API] Discogs release fetch error:', error.message);
    if (error.response) {
      if (error.response.status === 404) {
        return res.status(404).json({
          error: 'NOT_FOUND',
          message: 'Release not found',
          details: { releaseId }
        });
      }
      return res.status(error.response.status).json({
        error: 'EXTERNAL_API_ERROR',
        message: 'Discogs API error',
        details: { status: error.response.status, message: error.response.data?.message }
      });
    }
    res.status(500).json({
      error: 'INTERNAL_ERROR',
      message: 'Failed to fetch release',
      details: { originalError: error.message }
    });
  }
});

// GPT REMOVED – print label endpoint not used in core SlotSync backend
// app.get('/api/metadata/:id/print-label', ...) - Removed - was using vinyl_metadata table

// ============================================================================
// DEV-ONLY: Regression Test Endpoint
// ============================================================================
// DEV-ONLY: regression tests for known albums like Primitive Cool and Party Mix!
// Only enabled when ENABLE_DEV_TEST=true
if (config.features.enableDevTest) {
  const devTest = require('./devTest');
  
  /**
   * POST /api/dev-test
   * 
   * Dev-only regression test endpoint (requires ENABLE_DEV_TEST=true).
   * 
   * HTTP Status Code Contract:
   * - 400: Invalid input (invalid test name)
   * - 200: Test result
   * - 500: Unexpected server error
   */
  app.post('/api/dev-test', async (req, res) => {
    try {
      const { testName } = req.body;
      
      if (!testName || !devTest.TEST_IMAGES[testName]) {
        return res.status(400).json({
          error: 'INVALID_PARAMETER',
          message: 'Invalid test name',
          details: {
            parameter: 'testName',
            value: testName,
            availableTests: Object.keys(devTest.TEST_IMAGES)
          }
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
        error: 'INTERNAL_ERROR',
        message: 'Test execution failed',
        details: { originalError: error.message },
        // Legacy fields for backward compatibility
        success: false
      });
    }
  });
  
  /**
   * GET /api/dev-test/run-all
   * 
   * Dev-only endpoint to run all regression tests (requires ENABLE_DEV_TEST=true).
   * 
   * HTTP Status Code Contract:
   * - 200: All test results
   * - 500: Unexpected server error
   */
  app.get('/api/dev-test/run-all', async (req, res) => {
    try {
      const results = await devTest.runAllTests();
      res.json({
        success: true,
        results,
      });
    } catch (error) {
      res.status(500).json({
        error: 'INTERNAL_ERROR',
        message: 'Test execution failed',
        details: { originalError: error.message },
        // Legacy fields for backward compatibility
        success: false
      });
    }
  });
  
  logger.debug('[Config] ✅ Dev test endpoints enabled (ENABLE_DEV_TEST=true)');
  logger.debug('[Config]    POST /api/dev-test - Test single album');
  logger.debug('[Config]    GET /api/dev-test/run-all - Run all regression tests');
}

// ============================================================================
// GRACEFUL SHUTDOWN HANDLERS
// ============================================================================
// Store HTTP server reference for graceful shutdown (declared before function for scope)
let httpServer = null;

/**
 * Graceful shutdown handler - cleans up resources and stops the server
 */
function gracefulShutdown(signal) {
  const shutdownMessage = `[Shutdown] 🛑 Received ${signal}, shutting down gracefully...`;
  if (logger && typeof logger.info === 'function') {
    logger.info(shutdownMessage);
  } else {
    logger.warn(shutdownMessage);
  }
  
  // Clear cache cleanup interval
  if (cacheCleanupInterval) {
    clearInterval(cacheCleanupInterval);
  }
  
  // Close database connection first, then close server
  const closeServer = () => {
    if (httpServer) {
      httpServer.close(() => {
        const successMsg = '[Shutdown] ✅ HTTP server closed';
        if (logger && typeof logger.info === 'function') {
          logger.info(successMsg);
        } else {
          logger.debug(successMsg);
        }
        process.exit(0);
      });
      
      // Force close after 10 seconds if graceful shutdown doesn't complete
      setTimeout(() => {
        const forceMsg = '[Shutdown] ⚠️  Force closing server after timeout';
        if (logger && typeof logger.warn === 'function') {
          logger.warn(forceMsg);
        } else {
          logger.warn(forceMsg);
        }
        process.exit(1);
      }, 10000);
    } else {
      // No HTTP server, exit directly
      process.exit(0);
    }
  };
  
  // Close database connection
  if (db) {
    db.close((err) => {
      if (err) {
        const errorMsg = `[Shutdown] ⚠️  Database close error: ${err.message}`;
        if (logger && typeof logger.warn === 'function') {
          logger.warn(errorMsg);
        } else {
          logger.warn(errorMsg);
        }
      } else {
        const successMsg = '[Shutdown] ✅ Database closed';
        if (logger && typeof logger.info === 'function') {
          logger.info(successMsg);
        } else {
          logger.debug(successMsg);
        }
      }
      // Proceed to close server regardless of database close result
      closeServer();
    });
  } else {
    // No database, proceed directly to close server
    closeServer();
  }
}

// ============================================================
// Server startup (only when run directly, not when imported)
// ============================================================

if (require.main === module) {
  // Register shutdown handlers (only once, using persistent global flag)
  if (!globalThis.__slotsyncShutdownHandlersRegistered) {
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    globalThis.__slotsyncShutdownHandlersRegistered = true;
  }

  // Start server
  httpServer = app.listen(PORT, '0.0.0.0', () => {
    // Get LAN IP address for logging
    const os = require('os');
    const networkInterfaces = os.networkInterfaces();
    let lanIp = '0.0.0.0';

    for (const interfaceName of Object.keys(networkInterfaces)) {
      const addresses = networkInterfaces[interfaceName] || [];
      for (const addr of addresses) {
        if (addr.family === 'IPv4' && !addr.internal) {
          lanIp = addr.address;
          break;
        }
      }
      if (lanIp !== '0.0.0.0') break;
    }

    logger.info(`\n🚀 SlotSync API Server running on port ${PORT}`);
    logger.info(`📍 Listening on: 0.0.0.0:${PORT}`);
    logger.info(`📍 LAN address: http://${lanIp}:${PORT}`);
    logger.info(`📍 Health check: http://${lanIp}:${PORT}/health`);
    logger.info(`📍 Identify endpoint: http://${lanIp}:${PORT}/api/identify-record\n`);

    const client = getVisionClient();
    if (!client) {
      logger.warn('⚠️  Google Vision not configured - running in Discogs-only mode');
      logger.info('   Set GOOGLE_APPLICATION_CREDENTIALS to enable Vision OCR\n');
    } else {
      logger.info('✅ Google Vision API client initialized');
    }

    if (!DISCOGS_PERSONAL_ACCESS_TOKEN && !DISCOGS_API_KEY) {
      logger.warn('⚠️  ⚠️  ⚠️  Discogs API not configured ⚠️  ⚠️  ⚠️');
      logger.warn('   This will cause identification to fail!');
      logger.info('   Set DISCOGS_PERSONAL_ACCESS_TOKEN to enable\n');
    } else {
      logger.info('✅ Discogs API configured');
      logger.info(
        DISCOGS_PERSONAL_ACCESS_TOKEN
          ? '   Using: Personal Access Token'
          : '   Using: API Key + Secret'
      );
    }

    logger.info('✅ Ready to identify records!\n');

    // Initialize runtime (database, vector index, cache cleanup)
    // This is safe because we're inside require.main === module check
    initializeRuntime();

    // Google Vision self-test (dev mode only, NOT during tests)
    if (
      !config.IS_PRODUCTION &&
      !config.IS_TEST
    ) {
      (async () => {
        const testClient = getVisionClient();
        if (!testClient) return;

        try {
          logger.debug('[Vision] 🧪 Running self-test...');
          const testImageBase64 =
            'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
          const imageBuffer = Buffer.from(testImageBase64, 'base64');

          const [result] = await testClient.labelDetection({
            image: { content: imageBuffer },
          });

          const labels = result.labelAnnotations || [];
          logger.debug(`[Vision] ✅ Self-test passed: detected ${labels.length} labels`);
        } catch (error) {
          logger.warn(`[Vision] ⚠️  Self-test failed: ${error.message}`);
        }
      })();
    }
  });
}

// ============================================================
// Export app for testing + cleanup function
// ============================================================

/**
 * Cleanup function for tests - closes database, clears intervals, etc.
 * Only needed when server-hybrid.js is imported in tests
 */
async function testCleanup() {
  // Clear cache cleanup interval
  if (cacheCleanupInterval) {
    clearInterval(cacheCleanupInterval);
    cacheCleanupInterval = null;
  }
  
  // Close database connection
  if (db) {
    return new Promise((resolve) => {
      db.close((err) => {
        if (err) {
          logger.warn(`[Test Cleanup] ⚠️  Database close warning: ${err.message}`);
        } else {
          logger.debug('[Test Cleanup] ✅ Database closed');
        }
        db = null;
        resolve();
      });
    });
  }
  
  return Promise.resolve();
}

// Export app for testing (backward compatibility)
module.exports = app;

// Export cleanup function for tests
if (config.IS_TEST) {
  module.exports._test = {
    cleanup: testCleanup,
    shutdown: testCleanup, // Alias for clarity
  };
}
