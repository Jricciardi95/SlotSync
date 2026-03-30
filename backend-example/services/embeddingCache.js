/**
 * Embedding Cache Service
 * 
 * LRU cache for parsed embedding vectors to avoid repeated JSON.parse overhead.
 * 
 * Features:
 * - Max size: 2000 entries (configurable)
 * - LRU eviction (least recently used entries evicted first)
 * - Stores parsed embeddings (number[] or Float32Array)
 * - Bounded memory usage
 */

const logger = require('./logger');

const MAX_CACHE_SIZE = 2000;

/**
 * Simple LRU cache implementation using Map
 * Map preserves insertion order, so we can use it for LRU
 */
class EmbeddingCache {
  constructor(maxSize = MAX_CACHE_SIZE) {
    this.cache = new Map(); // key -> embedding array
    this.maxSize = maxSize;
  }

  /**
   * Get embedding from cache
   * @param {string} key - Cache key (recordId, discogsId, or stable identifier)
   * @returns {number[]|null} Parsed embedding or null if not cached
   */
  get(key) {
    if (!key) return null;
    
    if (this.cache.has(key)) {
      // Move to end (most recently used)
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      logger.debug(`[EmbeddingCache] ✅ Cache hit for key: ${key}`);
      return value;
    }
    
    logger.debug(`[EmbeddingCache] ❌ Cache miss for key: ${key}`);
    return null;
  }

  /**
   * Store embedding in cache
   * @param {string} key - Cache key
   * @param {number[]} embedding - Parsed embedding array
   */
  set(key, embedding) {
    if (!key || !embedding) return;
    
    // If already exists, update (move to end)
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else {
      // If at max size, evict oldest (first) entry
      if (this.cache.size >= this.maxSize) {
        const firstKey = this.cache.keys().next().value;
        this.cache.delete(firstKey);
        logger.debug(`[EmbeddingCache] 🗑️  Evicted key: ${firstKey} (cache full)`);
      }
    }
    
    // Add to end (most recently used)
    this.cache.set(key, embedding);
    logger.debug(`[EmbeddingCache] 💾 Cached embedding for key: ${key} (size: ${this.cache.size}/${this.maxSize})`);
  }

  /**
   * Clear cache
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    logger.debug(`[EmbeddingCache] 🗑️  Cleared cache (${size} entries)`);
  }

  /**
   * Get cache size
   * @returns {number} Number of cached embeddings
   */
  size() {
    return this.cache.size;
  }

  /**
   * Check if key exists in cache
   * @param {string} key - Cache key
   * @returns {boolean}
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * Remove specific key from cache
   * @param {string} key - Cache key to remove
   */
  delete(key) {
    if (this.cache.delete(key)) {
      logger.debug(`[EmbeddingCache] 🗑️  Removed key: ${key}`);
    }
  }
}

// Global cache instance
const embeddingCache = new EmbeddingCache(MAX_CACHE_SIZE);

module.exports = {
  embeddingCache,
  EmbeddingCache,
};

