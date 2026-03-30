/**
 * Identification Cache Module
 * 
 * Implements 3 cache layers:
 * - Cache A: imageHash -> final identification result
 * - Cache B: discogsReleaseId -> release metadata
 * - Cache C: normalized(artist|title|year?) -> discogs search results
 */

const logger = require('../../../services/logger');
const config = require('../../../config');

// Cache A: imageHash -> final identification result
const imageHashCache = new Map(); // imageHash -> { result, cachedAt }

// Cache B: discogsReleaseId -> release metadata
const discogsReleaseCache = new Map(); // discogsId -> { data, cachedAt }

// Cache C: normalized(artist|title|year?) -> discogs search results
const discogsSearchCache = new Map(); // normalizedKey -> { data, cachedAt }

// Cache configuration
const CACHE_A_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const CACHE_B_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const CACHE_C_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_CACHE_SIZE = 5000; // Maximum entries per cache

/**
 * Normalize cache key (trim, collapse spaces, casefold)
 */
function normalizeCacheKey(key) {
  if (!key || typeof key !== 'string') return '';
  return key
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ') // Collapse multiple spaces
    .replace(/[^\w\s-]/g, ''); // Remove special chars except word chars, spaces, hyphens
}

/**
 * Generate normalized search cache key from artist, title, year
 */
function generateSearchCacheKey(artist, title, year = null) {
  const parts = [
    normalizeCacheKey(artist || ''),
    normalizeCacheKey(title || ''),
    year ? String(year).trim() : ''
  ].filter(Boolean);
  return parts.join('|');
}

/**
 * Cache A: Get cached identification result by imageHash
 */
function getImageHashCache(imageHash) {
  if (!imageHash) return null;
  
  const cached = imageHashCache.get(imageHash);
  if (!cached) return null;
  
  const age = Date.now() - cached.cachedAt;
  if (age > CACHE_A_TTL) {
    imageHashCache.delete(imageHash);
    return null;
  }
  
  return cached.result;
}

/**
 * Cache A: Store identification result by imageHash
 */
function setImageHashCache(imageHash, result) {
  if (!imageHash) return;
  
  // Enforce size limit (LRU: remove oldest if over limit)
  if (imageHashCache.size >= MAX_CACHE_SIZE) {
    const entries = Array.from(imageHashCache.entries());
    entries.sort((a, b) => a[1].cachedAt - b[1].cachedAt);
    const toRemove = entries.slice(0, imageHashCache.size - MAX_CACHE_SIZE + 1);
    for (const [key] of toRemove) {
      imageHashCache.delete(key);
    }
  }
  
  imageHashCache.set(imageHash, {
    result,
    cachedAt: Date.now()
  });
}

/**
 * Cache B: Get cached Discogs release by ID
 */
function getDiscogsReleaseCache(discogsId) {
  if (!discogsId) return null;
  
  const cached = discogsReleaseCache.get(discogsId);
  if (!cached) return null;
  
  const age = Date.now() - cached.cachedAt;
  if (age > CACHE_B_TTL) {
    discogsReleaseCache.delete(discogsId);
    return null;
  }
  
  return cached.data;
}

/**
 * Cache B: Store Discogs release by ID
 */
function setDiscogsReleaseCache(discogsId, data) {
  if (!discogsId || !data) return;
  
  // Enforce size limit (LRU: remove oldest if over limit)
  if (discogsReleaseCache.size >= MAX_CACHE_SIZE) {
    const entries = Array.from(discogsReleaseCache.entries());
    entries.sort((a, b) => a[1].cachedAt - b[1].cachedAt);
    const toRemove = entries.slice(0, discogsReleaseCache.size - MAX_CACHE_SIZE + 1);
    for (const [key] of toRemove) {
      discogsReleaseCache.delete(key);
    }
  }
  
  discogsReleaseCache.set(discogsId, {
    data,
    cachedAt: Date.now()
  });
}

/**
 * Cache C: Get cached Discogs search results
 */
function getDiscogsSearchCache(artist, title, year = null) {
  const key = generateSearchCacheKey(artist, title, year);
  if (!key) return null;
  
  const cached = discogsSearchCache.get(key);
  if (!cached) return null;
  
  const age = Date.now() - cached.cachedAt;
  if (age > CACHE_C_TTL) {
    discogsSearchCache.delete(key);
    return null;
  }
  
  return cached.data;
}

/**
 * Cache C: Store Discogs search results
 */
function setDiscogsSearchCache(artist, title, year, data) {
  const key = generateSearchCacheKey(artist, title, year);
  if (!key || !data) return;
  
  // Enforce size limit (LRU: remove oldest if over limit)
  if (discogsSearchCache.size >= MAX_CACHE_SIZE) {
    const entries = Array.from(discogsSearchCache.entries());
    entries.sort((a, b) => a[1].cachedAt - b[1].cachedAt);
    const toRemove = entries.slice(0, discogsSearchCache.size - MAX_CACHE_SIZE + 1);
    for (const [key] of toRemove) {
      discogsSearchCache.delete(key);
    }
  }
  
  discogsSearchCache.set(key, {
    data,
    cachedAt: Date.now()
  });
}

/**
 * Cleanup expired entries from all caches
 */
function cleanupCaches() {
  const now = Date.now();
  let cleaned = 0;
  
  // Cleanup Cache A
  for (const [key, value] of imageHashCache.entries()) {
    if (now - value.cachedAt > CACHE_A_TTL) {
      imageHashCache.delete(key);
      cleaned++;
    }
  }
  
  // Cleanup Cache B
  for (const [key, value] of discogsReleaseCache.entries()) {
    if (now - value.cachedAt > CACHE_B_TTL) {
      discogsReleaseCache.delete(key);
      cleaned++;
    }
  }
  
  // Cleanup Cache C
  for (const [key, value] of discogsSearchCache.entries()) {
    if (now - value.cachedAt > CACHE_C_TTL) {
      discogsSearchCache.delete(key);
      cleaned++;
    }
  }
  
  if (cleaned > 0 && config.logging.debugCache) {
    logger.debug(`[Cache] 🧹 Cleaned ${cleaned} expired entries (A: ${imageHashCache.size}, B: ${discogsReleaseCache.size}, C: ${discogsSearchCache.size})`);
  }
}

/**
 * Get cache statistics
 */
function getCacheStats() {
  return {
    cacheA: {
      size: imageHashCache.size,
      maxSize: MAX_CACHE_SIZE,
      ttlDays: CACHE_A_TTL / (24 * 60 * 60 * 1000)
    },
    cacheB: {
      size: discogsReleaseCache.size,
      maxSize: MAX_CACHE_SIZE,
      ttlDays: CACHE_B_TTL / (24 * 60 * 60 * 1000)
    },
    cacheC: {
      size: discogsSearchCache.size,
      maxSize: MAX_CACHE_SIZE,
      ttlDays: CACHE_C_TTL / (24 * 60 * 60 * 1000)
    }
  };
}

module.exports = {
  // Cache A: imageHash -> result
  getImageHashCache,
  setImageHashCache,
  
  // Cache B: discogsId -> release
  getDiscogsReleaseCache,
  setDiscogsReleaseCache,
  
  // Cache C: artist|title|year -> search results
  getDiscogsSearchCache,
  setDiscogsSearchCache,
  
  // Utilities
  normalizeCacheKey,
  generateSearchCacheKey,
  cleanupCaches,
  getCacheStats,
};


