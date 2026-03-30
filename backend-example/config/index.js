/**
 * Centralized Configuration Module
 * 
 * Centralizes all environment variable access with defaults and validation.
 * 
 * Usage:
 *   const config = require('./config');
 *   const port = config.server.port;
 *   const discogsToken = config.discogs.personalAccessToken;
 * 
 * Validation:
 *   - In production (NODE_ENV=production), validates required Discogs + Vision config
 *   - In dev/test, validation is skipped (allows running without API keys)
 */

const path = require('path');
const fs = require('fs');
const logger = require('../services/logger');

// ============================================================================
// Environment Detection
// ============================================================================
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PRODUCTION = NODE_ENV === 'production';
const IS_TEST = NODE_ENV === 'test';
const IS_DEV = !IS_PRODUCTION && !IS_TEST;

// ============================================================================
// Server Configuration
// ============================================================================
const server = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: NODE_ENV,
  isProduction: IS_PRODUCTION,
  isTest: IS_TEST,
  isDev: IS_DEV,
};

// ============================================================================
// Google Vision Configuration
// ============================================================================
let googleVisionCredentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || null;

// Auto-discover credentials if not set
if (!googleVisionCredentialsPath) {
  const credentialPaths = [
    path.resolve(__dirname, '..', 'credentials.json'),
    path.resolve(__dirname, '..', 'credentials', 'credentials.json'),
    path.resolve(__dirname, '..', '..', 'credentials.json'),
  ];
  
  for (const credPath of credentialPaths) {
    try {
      if (fs.existsSync(credPath) && fs.statSync(credPath).isFile()) {
        googleVisionCredentialsPath = path.resolve(credPath);
        logger.info(`[Config] ✅ Auto-discovered Google credentials: ${path.basename(googleVisionCredentialsPath)}`);
        break;
      }
    } catch (error) {
      // Continue to next path
    }
  }
}

// Always convert to absolute path if set
if (googleVisionCredentialsPath) {
  googleVisionCredentialsPath = path.resolve(googleVisionCredentialsPath);
  // Set process.env for backward compatibility (some code may still read it)
  process.env.GOOGLE_APPLICATION_CREDENTIALS = googleVisionCredentialsPath;
}

// Check if credentials file exists and is valid
let visionAvailable = false;
if (googleVisionCredentialsPath) {
  try {
    if (fs.existsSync(googleVisionCredentialsPath)) {
      visionAvailable = true;
    }
  } catch (error) {
    // Ignore errors, visionAvailable remains false
  }
}

const googleVision = {
  credentialsPath: googleVisionCredentialsPath,
  enabled: process.env.ENABLE_GOOGLE_VISION !== 'false',
  available: visionAvailable, // Indicates if credentials file exists and is accessible
  timeoutMs: parseInt(process.env.VISION_TIMEOUT_MS || '20000', 10),
  selfTest: process.env.DISCOGS_SELF_TEST === 'true', // Note: This is actually for Vision, but keeping name for backward compat
};

// ============================================================================
// Discogs Configuration
// ============================================================================
const discogs = {
  personalAccessToken: process.env.DISCOGS_PERSONAL_ACCESS_TOKEN || process.env.DISCOGS_TOKEN || null,
  apiKey: process.env.DISCOGS_API_KEY || process.env.DISCOGS_CONSUMER_KEY || null,
  apiSecret: process.env.DISCOGS_API_SECRET || process.env.DISCOGS_CONSUMER_SECRET || null,
  userAgent: process.env.DISCOGS_USER_AGENT || 'SlotSync/1.0 (james@example.com)',
  searchTimeoutMs: parseInt(process.env.DISCOGS_SEARCH_TIMEOUT_MS || '12000', 10),
  fetchTimeoutMs: parseInt(process.env.DISCOGS_FETCH_TIMEOUT_MS || '12000', 10),
  selfTest: process.env.DISCOGS_SELF_TEST === 'true',
};

// ============================================================================
// Database Configuration
// ============================================================================
const database = {
  path: process.env.DB_PATH || path.join(__dirname, '..', 'identified_records.db'),
};

// ============================================================================
// Embedding Configuration
// ============================================================================
const embedding = {
  timeoutMs: parseInt(process.env.EMBEDDING_TIMEOUT_MS || '30000', 10),
  k: parseInt(process.env.EMBEDDING_K || '5', 10),
  minSimilarity: parseFloat(process.env.EMBEDDING_MIN_SIMILARITY || '0.65'),
  vectorSearchTimeoutMs: parseInt(process.env.VECTOR_SEARCH_TIMEOUT_MS || '5000', 10),
  minDatasetSize: parseInt(process.env.MIN_EMBEDDING_DATASET_SIZE || '200', 10),
};

// ============================================================================
// OpenAI Configuration (optional)
// ============================================================================
const openai = {
  apiKey: process.env.OPENAI_API_KEY || null,
  model: process.env.GPT_MODEL || 'gpt-4o',
  useGptOcrParsing: process.env.USE_GPT_OCR_PARSING === 'true',
  enableVinylVision: process.env.ENABLE_VINYL_VISION !== 'false',
};

// ============================================================================
// Scoring & Thresholds Configuration
// ============================================================================
const scoring = {
  autoAcceptThreshold: parseFloat(process.env.AUTO_ACCEPT_THRESHOLD || '0.8'),
  suggestionsThreshold: parseFloat(process.env.SUGGESTIONS_THRESHOLD || '0.5'),
  confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.5'),
  strongAcceptThreshold: parseFloat(process.env.STRONG_ACCEPT_THRESHOLD || '0.94'),
  strongAcceptMargin: parseFloat(process.env.STRONG_ACCEPT_MARGIN || '0.04'),
  skipVisionEmbeddingThreshold: parseFloat(process.env.SKIP_VISION_EMBEDDING_THRESHOLD || '0.92'),
  skipVisionMarginThreshold: parseFloat(process.env.SKIP_VISION_MARGIN_THRESHOLD || '0.03'),
};

// ============================================================================
// Phase 2 Configuration
// ============================================================================
const phase2 = {
  budgetMs: parseInt(process.env.PHASE2_BUDGET_MS || '45000', 10),
  maxDiscogsSearches: parseInt(process.env.MAX_DISCOGS_SEARCHES || '5', 10),
};

// ============================================================================
// Request Configuration
// ============================================================================
const request = {
  deadlineMs: parseInt(process.env.REQUEST_DEADLINE_MS || '80000', 10),
  timeoutMs: parseInt(process.env.REQUEST_TIMEOUT_MS || '85000', 10),
};

// ============================================================================
// CORS Configuration
// ============================================================================
const cors = {
  allowedOrigins: process.env.ALLOWED_ORIGINS ? 
    process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean) : 
    null,
};

// ============================================================================
// Logging Configuration
// ============================================================================
const logging = {
  level: (process.env.LOG_LEVEL || 'info').toLowerCase(),
  debugCache: process.env.DEBUG_CACHE === 'true',
  debugEmbeddings: process.env.DEBUG_EMBEDDINGS === 'true',
  debugScoring: process.env.DEBUG_SCORING === 'true',
  debugIdentify: process.env.DEBUG_IDENTIFY === 'true',
  debugIdentification: process.env.DEBUG_IDENTIFICATION === 'true',
  scanDecisionLogPath: process.env.SCAN_DECISION_LOG_PATH || null,
};

// ============================================================================
// Feature Flags
// ============================================================================
const features = {
  enableDevTest: process.env.ENABLE_DEV_TEST === 'true',
  enableGpt4Vision: process.env.ENABLE_GPT4_VISION === 'true',
};

// ============================================================================
// Discogs-Only Mode Detection
// ============================================================================
/**
 * Check if backend is running in "Discogs-only mode" (no Vision API)
 * @returns {boolean} True if Vision is not available
 */
function isDiscogsOnlyMode() {
  return !googleVision.available || !googleVision.credentialsPath;
}

// ============================================================================
// Validation (only in production)
// ============================================================================
function validateProductionConfig() {
  if (!IS_PRODUCTION) {
    return { valid: true, errors: [] };
  }

  const errors = [];

  // Validate Discogs configuration (REQUIRED)
  if (!discogs.personalAccessToken && !discogs.apiKey) {
    errors.push('Discogs API not configured: Set DISCOGS_PERSONAL_ACCESS_TOKEN or DISCOGS_API_KEY');
  }

  // Google Vision is OPTIONAL - backend can run in Discogs-only mode
  // Only warn if Vision is enabled but credentials are missing
  if (googleVision.enabled && !googleVision.credentialsPath) {
    logger.warn('[Config] ⚠️  Google Vision enabled but credentials not found - running in Discogs-only mode');
  } else if (googleVision.credentialsPath && !fs.existsSync(googleVision.credentialsPath)) {
    logger.warn(`[Config] ⚠️  Google Vision credentials file not found: ${googleVision.credentialsPath} - running in Discogs-only mode`);
  }

  if (errors.length > 0) {
    logger.warn('[Config] ⚠️  Production configuration validation failed:');
    errors.forEach(error => logger.warn(`[Config]   - ${error}`));
    logger.warn('[Config]   Server will start but identification may fail');
    // Note: We don't throw/exit - allows graceful degradation
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// Run validation on module load (only logs warnings in production, doesn't block)
if (IS_PRODUCTION) {
  validateProductionConfig();
}

// ============================================================================
// Export Configuration
// ============================================================================
module.exports = {
  server,
  googleVision,
  discogs,
  database,
  embedding,
  openai,
  scoring,
  phase2,
  request,
  cors,
  logging,
  features,
  // Utility functions
  validateProductionConfig,
  isDiscogsOnlyMode,
  // Constants
  IS_PRODUCTION,
  IS_TEST,
  IS_DEV,
  NODE_ENV,
};

