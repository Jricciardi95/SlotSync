/**
 * Image Embedding Service
 *
 * CLIP embeddings via @xenova/transformers (local, no third-party API).
 *
 *   const embedding = await getImageEmbedding(imageBuffer);
 */

const sharp = require('sharp');

const config = require('../config');
const logger = require('./logger');

// CLIP model will be loaded lazily (cached after first load)
let clipModel = null;
let clipProcessor = null;

// Simple cache for recently computed embeddings (key: image hash, value: embedding)
// This avoids recomputing embeddings for the same image
const embeddingCache = new Map();
const MAX_CACHE_SIZE = 100; // Limit cache size to prevent memory issues

/**
 * Initialize CLIP model (lazy loading)
 * Uses @xenova/transformers for self-hosted embeddings
 * 
 * Note: For now, we'll use a simple fallback if CLIP is not available.
 * In production, you may want to use a dedicated embedding service.
 */
async function initCLIP() {
  if (clipModel) return; // Already initialized
  
  try {
    // Try to require @xenova/transformers (CommonJS)
    const transformers = require('@xenova/transformers');
    const { pipeline } = transformers;
    
    logger.info('[Embedding] Loading CLIP model (first time only, may take a moment)...');
    
    // Add timeout protection for CLIP initialization (30 seconds max)
    const initPromise = pipeline('image-feature-extraction', 'Xenova/clip-vit-base-patch32');
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('CLIP initialization timeout after 30 seconds')), 30000);
    });
    
    clipModel = await Promise.race([initPromise, timeoutPromise]);
    logger.info('[Embedding] ✅ CLIP model loaded');
  } catch (error) {
    logger.warn('[Embedding] ⚠️  CLIP model not available:', error.message);
    logger.warn('[Embedding] Install with: npm install @xenova/transformers');
    logger.warn('[Embedding] Falling back to simple hash-based similarity (limited accuracy)');
    // Don't throw - allow fallback behavior
    clipModel = null;
  }
}

/**
 * Initialize embedding model at server startup (preloads CLIP to eliminate cold start)
 * Should be called after database and vector index initialization
 * 
 * @returns {Promise<void>}
 */
async function initializeEmbeddingModel() {
  // Skip in test mode (tests don't need CLIP model)
  if (config.IS_TEST) {
    logger.debug('[Embedding] Skipping CLIP preload in test mode');
    return;
  }
  
  logger.info('[Embedding] Preloading CLIP model at startup...');
  const startTime = Date.now();
  
  try {
    await initCLIP();
    const elapsedMs = Date.now() - startTime;
    if (clipModel) {
      logger.info(`[Embedding] ✅ CLIP model preloaded (${elapsedMs}ms)`);
    } else {
      logger.warn(`[Embedding] ⚠️  CLIP model preload failed (${elapsedMs}ms)`);
    }
  } catch (error) {
    const elapsedMs = Date.now() - startTime;
    logger.warn(`[Embedding] ⚠️  CLIP model preload error (${elapsedMs}ms):`, error.message);
    // Don't throw - allow server to start without CLIP (fallback behavior)
  }
}

/**
 * Preprocess image for embedding (Phase 2A+): square crop, normalize size, contrast
 * 
 * @param {Buffer} imageBuffer - Original image buffer
 * @returns {Promise<Buffer>} Preprocessed image buffer
 */
async function preprocessImageForEmbedding(imageBuffer) {
  try {
    // Phase 2A+: Safe preprocessing with error handling
    const metadata = await sharp(imageBuffer).metadata();
    const { width, height } = metadata;
    
    if (!width || !height || width <= 0 || height <= 0) {
      console.warn('[Embedding] ⚠️  Invalid image metadata, skipping preprocessing');
      return imageBuffer;
    }
    
    // Step 1: Center-crop to square (handles odd formats safely)
    const size = Math.min(width, height);
    const left = Math.max(0, Math.floor((width - size) / 2));
    const top = Math.max(0, Math.floor((height - size) / 2));
    
    // Step 2: Resize to fixed resolution (512x512)
    // Step 3: Mild contrast normalization
    // Use single pipeline to avoid multiple full-size copies (memory efficient)
    const processed = await sharp(imageBuffer)
      .extract({ left, top, width: size, height: size })
      .resize(512, 512, { fit: 'fill' })
      .normalise() // Auto-adjust brightness/contrast
      .modulate({ brightness: 1.05, saturation: 1.0 }) // Slight brightness boost
      .jpeg({ quality: 90, mozjpeg: true }) // Optimized JPEG encoding
      .toBuffer();
    
    // 4) Log preprocessing output type for debugging
    const isBuffer = Buffer.isBuffer(processed);
    console.log(`[Embedding] preprocess_output_type=${typeof processed} buffer=${isBuffer} length=${isBuffer ? processed.length : 'N/A'}`);
    
    return processed;
  } catch (error) {
    console.warn('[Embedding] ⚠️  Preprocessing failed, using original:', error.message);
    return imageBuffer; // Fallback to original (safe for odd formats)
  }
}

/**
 * Get image embedding using CLIP model
 * 
 * @param {Buffer} imageBuffer - Image buffer
 * @param {boolean} preprocess - Whether to preprocess image (Phase 2A+)
 * @returns {Promise<number[]>} Embedding vector (512 dimensions for CLIP)
 */
async function getCLIPEmbedding(imageBuffer, preprocess = true) {
  await initCLIP();
  
  // Phase 2A+: Preprocess image before embedding (square crop, normalize, contrast)
  // 4) Fix CLIP input type - ensure preprocessing returns Buffer
  let processedBuffer = imageBuffer;
  if (preprocess) {
    processedBuffer = await preprocessImageForEmbedding(imageBuffer);
    // Verify preprocessing returned a Buffer
    if (!Buffer.isBuffer(processedBuffer)) {
      console.error('[Embedding] CLIP preprocessing error: preprocessImageForEmbedding did not return a Buffer, type:', typeof processedBuffer);
      // Fallback to original buffer
      processedBuffer = imageBuffer;
    }
  }
  
  if (!clipModel) {
    // Fallback: Generate a simple feature vector from image hash
    // This is not a true embedding but allows the system to work without CLIP
    console.warn('[Embedding] CLIP not available, using hash-based fallback');
    const hash = require('crypto').createHash('sha256').update(processedBuffer).digest('hex');
    // Convert hash to numeric vector (simple approach)
    const embedding = [];
    for (let i = 0; i < 64; i += 2) {
      const hexPair = hash.substring(i, i + 2);
      embedding.push(parseInt(hexPair, 16) / 255.0);
    }
    // Pad to 512 dimensions
    while (embedding.length < 512) {
      embedding.push(0);
    }
    return embedding.slice(0, 512);
  }

  try {
    // Preprocess image: resize to 224x224 (CLIP input size)
    // Note: preprocessImageForEmbedding already did square crop + normalize, so we just resize here
    let processedImage = await sharp(processedBuffer)
      .resize(224, 224, { fit: 'cover' })
      .toBuffer();

    // CRITICAL: Ensure processedImage is a Buffer/Uint8Array
    // Handle cases where sharp returns {data, info} or {buffer, ...} objects
    if (processedImage && typeof processedImage === 'object') {
      // Extract buffer from object wrapper if present
      if (processedImage.buffer && Buffer.isBuffer(processedImage.buffer)) {
        console.log('[Embedding] Extracting buffer from object wrapper (.buffer)');
        processedImage = processedImage.buffer;
      } else if (processedImage.data && Buffer.isBuffer(processedImage.data)) {
        console.log('[Embedding] Extracting buffer from object wrapper (.data)');
        processedImage = processedImage.data;
      } else if (processedImage instanceof Uint8Array) {
        // Already Uint8Array, convert to Buffer
        console.log('[Embedding] Converting Uint8Array to Buffer');
        processedImage = Buffer.from(processedImage);
      }
    }
    
    // Final validation: must be Buffer/Uint8Array
    if (!Buffer.isBuffer(processedImage) && !(processedImage instanceof Uint8Array)) {
      const inputType = typeof processedImage;
      const isBuffer = Buffer.isBuffer(processedImage);
      const byteLength = processedImage?.byteLength || processedImage?.length || 'N/A';
      console.error(`[Embedding] CLIP input type error: inputType=${inputType} isBuffer=${isBuffer} byteLength=${byteLength}`);
      
      // Try to convert to Buffer if possible
      try {
        if (processedImage && typeof processedImage === 'object') {
          // Try Buffer.from() for array-like objects
          if (Array.isArray(processedImage) || (processedImage.length !== undefined && processedImage.length > 0)) {
            console.log('[Embedding] Attempting Buffer.from() conversion');
            processedImage = Buffer.from(processedImage);
          } else {
            throw new Error(`Cannot convert object to Buffer: ${JSON.stringify(Object.keys(processedImage))}`);
          }
        } else {
          throw new Error(`Unsupported type: ${inputType}`);
        }
      } catch (convertError) {
        console.error(`[Embedding] Failed to convert to Buffer: ${convertError.message}`);
        // Return safe fallback embedding
        const hash = require('crypto').createHash('sha256').update(processedBuffer).digest('hex');
        const embedding = [];
        for (let i = 0; i < 64; i += 2) {
          const hexPair = hash.substring(i, i + 2);
          embedding.push(parseInt(hexPair, 16) / 255.0);
        }
        while (embedding.length < 512) {
          embedding.push(0);
        }
        return embedding.slice(0, 512);
      }
    }
    
    // Ensure it's a Buffer (convert Uint8Array if needed)
    if (!Buffer.isBuffer(processedImage) && processedImage instanceof Uint8Array) {
      processedImage = Buffer.from(processedImage);
    }
    
    // Log input type before CLIP call for debugging
    const inputType = typeof processedImage;
    const isBuffer = Buffer.isBuffer(processedImage);
    const byteLength = processedImage.byteLength || processedImage.length || 'N/A';
    console.log(`[Embedding] CLIP input check: inputType=${inputType} isBuffer=${isBuffer} byteLength=${byteLength}`);
    
    // Compute CLIP embedding using @xenova/transformers pipeline
    try {
      // @xenova/transformers CLIP image-feature-extraction pipeline accepts:
      // - URL string (http/https)
      // - File path (string) - THIS IS THE MOST RELIABLE METHOD
      // Since Buffer/Uint8Array doesn't work reliably, save to temp file and use file path
      console.log(`[Embedding] Converting Buffer for CLIP (size=${processedImage.length} bytes)`);
      
      const fs = require('fs');
      const path = require('path');
      const os = require('os');
      
      // Save Buffer to temporary file
      const tempDir = path.join(__dirname, '..', 'temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }
      
      const tempFilePath = path.join(tempDir, `clip-input-${Date.now()}-${Math.random().toString(36).substring(7)}.jpg`);
      fs.writeFileSync(tempFilePath, processedImage);
      console.log(`[Embedding] Saved Buffer to temp file: ${path.basename(tempFilePath)}`);
      
      try {
        // Call CLIP with file path (most reliable method)
        const result = await clipModel(tempFilePath);
        
        // Clean up temp file immediately after CLIP call
        try {
          fs.unlinkSync(tempFilePath);
        } catch (cleanupErr) {
          // Ignore cleanup errors
        }
        
        // Validate and normalize embedding (handles shape, NaN, zeros, normalization)
        const validated = validateAndNormalizeEmbedding(result, 512);
        if (!validated) {
          console.error(`[Embedding] ❌ CLIP embedding validation failed`);
          return null;
        }

        console.log(`[Embedding] ✅ Scan embedding computed (dims=${validated.length})`);
        return validated;
      } catch (clipError) {
        // Clean up temp file on error
        try {
          fs.unlinkSync(tempFilePath);
        } catch (cleanupErr) {
          // Ignore cleanup errors
        }
        console.error(`[Embedding] ❌ CLIP embedding failed: ${clipError?.message || clipError}`);
        return null; // Return null instead of throwing to allow fallback
      }
    } catch (err) {
      console.error(`[Embedding] ❌ CLIP embedding failed: ${err?.message || err}`);
      return null; // IMPORTANT: propagate failure instead of pretending
    }
  } catch (error) {
    console.error('[Embedding] CLIP processing error (outer catch):', error.message);
    // Return null on failure to signal that embedding computation failed
    return null;
  }
}

/**
 * Get image embedding (CLIP)
 * Includes simple caching to avoid recomputing the same image
 * 
 * @param {Buffer} imageBuffer - Image buffer (JPEG/PNG)
 * @param {boolean} useCache - Whether to use cache (default: true)
 * @returns {Promise<number[]>} Embedding vector
 */
async function getImageEmbedding(imageBuffer, useCache = true) {
  if (!imageBuffer || imageBuffer.length === 0) {
    throw new Error('Empty image buffer');
  }

  // Check cache first
  if (useCache) {
    const crypto = require('crypto');
    const imageHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
    if (embeddingCache.has(imageHash)) {
      console.log('[Embedding] ✅ Using cached embedding');
      return embeddingCache.get(imageHash);
    }
  }

  // Add timeout protection (20 seconds max for embedding computation)
  const EMBEDDING_TIMEOUT = 20000;
  let embedding;

  try {
    const embeddingPromise = (async () => {
      console.log('[Embedding] Using CLIP for image embedding');
      return await getCLIPEmbedding(imageBuffer);
    })();

    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Embedding computation timeout after ${EMBEDDING_TIMEOUT / 1000} seconds`)), EMBEDDING_TIMEOUT);
    });

    embedding = await Promise.race([embeddingPromise, timeoutPromise]);
    
    // Validate embedding before returning/caching
    if (!embedding) {
      console.warn('[Embedding] ⚠️  Embedding computation returned null');
      return null;
    }
    
    // Validate embedding shape and normalize
    const validated = validateAndNormalizeEmbedding(embedding, 512);
    if (!validated) {
      console.warn('[Embedding] ⚠️  Embedding validation failed, returning null');
      return null;
    }
    
    embedding = validated; // Use validated/normalized embedding
  } catch (error) {
    console.error('[Embedding] ❌ Embedding computation failed:', error.message);
    // Return null to signal failure - let callers handle it appropriately
    // (e.g., skip embedding-based matching, use alternative strategies)
    return null;
  }

  // Cache the result (only if embedding is valid - already validated above)
  if (useCache && embedding) {
    const crypto = require('crypto');
    const imageHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');
    
    // Simple LRU: remove oldest entries if cache is full
    if (embeddingCache.size >= MAX_CACHE_SIZE) {
      const firstKey = embeddingCache.keys().next().value;
      embeddingCache.delete(firstKey);
    }
    
    embeddingCache.set(imageHash, embedding);
  }

  return embedding;
}

/**
 * Validate and normalize embedding vector
 * 
 * @param {*} embedding - Embedding to validate (can be nested array, typed array, etc.)
 * @param {number} expectedDims - Expected dimension (default: 512, tolerance: ±10%)
 * @returns {number[]|null} Normalized 1D array or null if invalid
 */
function validateAndNormalizeEmbedding(embedding, expectedDims = 512) {
  // Check for null/undefined
  if (!embedding) {
    console.error('[Embedding] ❌ Validation failed: embedding is null/undefined');
    return null;
  }

  // Handle nested arrays (e.g., result from CLIP pipeline)
  let vec;
  if (Array.isArray(embedding)) {
    // Check if it's a nested array (e.g., [[...]] or result[0].data)
    if (embedding.length > 0 && Array.isArray(embedding[0])) {
      // If nested, try to flatten or take first element
      if (embedding[0].data) {
        vec = Array.from(embedding[0].data);
      } else {
        vec = Array.from(embedding[0]);
      }
    } else {
      vec = Array.from(embedding);
    }
  } else if (embedding.data) {
    vec = Array.from(embedding.data);
  } else if (embedding instanceof Float32Array || embedding instanceof Float64Array || embedding instanceof Uint8Array) {
    vec = Array.from(embedding);
  } else {
    console.error(`[Embedding] ❌ Validation failed: embedding is not array-like (type: ${typeof embedding})`);
    return null;
  }

  // Validate length (allow ±10% tolerance)
  const minDims = Math.floor(expectedDims * 0.9);
  const maxDims = Math.ceil(expectedDims * 1.1);
  if (vec.length < minDims || vec.length > maxDims) {
    console.error(`[Embedding] ❌ Validation failed: wrong dimensions (got ${vec.length}, expected ~${expectedDims}, range: ${minDims}-${maxDims})`);
    return null;
  }

  // Validate all elements are numbers and check for NaN/Infinity
  const hasNaN = vec.some(v => typeof v !== 'number' || Number.isNaN(v));
  const hasInfinity = vec.some(v => !Number.isFinite(v));
  
  if (hasNaN) {
    console.error('[Embedding] ❌ Validation failed: embedding contains NaN values');
    return null;
  }
  
  if (hasInfinity) {
    console.error('[Embedding] ❌ Validation failed: embedding contains Infinity values');
    return null;
  }

  // Check if all zeros (invalid embedding)
  if (vec.every(v => v === 0)) {
    console.error('[Embedding] ❌ Validation failed: embedding is all zeros');
    return null;
  }

  // Normalize to unit vector (safe normalization)
  const magnitude = Math.sqrt(vec.reduce((sum, val) => sum + val * val, 0));
  
  if (!Number.isFinite(magnitude) || magnitude === 0) {
    console.error(`[Embedding] ❌ Normalization failed: magnitude is ${magnitude} (not finite or zero)`);
    return null;
  }

  const normalized = vec.map(val => val / magnitude);
  
  // Final validation: check normalized vector is valid
  const normalizedMagnitude = Math.sqrt(normalized.reduce((sum, val) => sum + val * val, 0));
  if (Math.abs(normalizedMagnitude - 1.0) > 0.001) {
    console.error(`[Embedding] ❌ Normalization validation failed: normalized magnitude is ${normalizedMagnitude} (expected ~1.0)`);
    return null;
  }

  return normalized;
}

/**
 * Compute cosine similarity between two embedding vectors
 * 
 * @param {number[]} vec1 - First embedding vector
 * @param {number[]} vec2 - Second embedding vector
 * @returns {number} Similarity score (0-1, where 1 is identical)
 */
function cosineSimilarity(vec1, vec2) {
  if (vec1.length !== vec2.length) {
    throw new Error('Embedding vectors must have same length');
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

module.exports = {
  getImageEmbedding,
  cosineSimilarity,
  validateAndNormalizeEmbedding,
  initializeEmbeddingModel,
};

