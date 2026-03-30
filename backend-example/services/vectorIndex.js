/**
 * Vector Index Service
 * 
 * Efficient vector database for storing and searching album cover embeddings.
 * 
 * Features:
 * - Persists embeddings to SQLite database
 * - Loads embeddings on initialization
 * - Optimized similarity search with early termination
 * - Batch operations for efficiency
 * 
 * Stores:
 * - recordId (or discogsId)
 * - embeddingVector (JSON array)
 * - metadata (artist, title, etc.)
 * 
 * Provides:
 * - initialize(database) - Load embeddings from DB
 * - indexCoverEmbedding(recordId, embedding, metadata, database)
 * - findNearestCovers(queryEmbedding, k, minSimilarity, database)
 * - batchIndexEmbeddings(embeddingsArray, database)
 * 
 * Note: For production with 100k+ embeddings, consider:
 * - FAISS (via node-faiss) for approximate nearest neighbor
 * - Pinecone, Weaviate, or Qdrant for managed vector DB
 */

const { cosineSimilarity } = require('./embeddingService');
const { embeddingCache } = require('./embeddingCache');
const logger = require('./logger');

// In-memory cache for fast lookups
// Also persisted to database for durability
const embeddings = new Map(); // recordId -> {embedding, metadata, discogsId, indexedAt}

// Track if initialized
let isInitialized = false;

/**
 * Initialize vector index by loading embeddings from database
 * 
 * @param {Object} database - SQLite database instance
 * @returns {Promise<number>} Number of embeddings loaded
 */
async function initialize(database) {
  if (isInitialized) {
    return embeddings.size;
  }

  return new Promise((resolve, reject) => {
    if (!database) {
      logger.warn('[VectorIndex] ⚠️  No database provided, using in-memory only');
      isInitialized = true;
      resolve(0);
      return;
    }

    database.all(
      `SELECT record_id, discogs_id, embedding_vector, artist, title, created_at 
       FROM cover_embeddings`,
      (err, rows) => {
        if (err) {
          logger.warn('[VectorIndex] ⚠️  Failed to load embeddings from DB:', err.message);
          isInitialized = true;
          resolve(0);
          return;
        }

        let loaded = 0;
        for (const row of rows) {
          try {
            const recordId = row.record_id || row.discogs_id;
            
            // Check cache first, then parse and cache
            let embedding = embeddingCache.get(recordId);
            if (!embedding) {
              embedding = JSON.parse(row.embedding_vector);
              embeddingCache.set(recordId, embedding);
            }
            
            embeddings.set(recordId, {
              embedding,
              metadata: {
                artist: row.artist,
                title: row.title,
                discogsId: row.discogs_id,
              },
              discogsId: row.discogs_id || recordId,
              indexedAt: row.created_at,
            });
            loaded++;
          } catch (parseError) {
            logger.warn(`[VectorIndex] ⚠️  Failed to parse embedding for ${row.record_id}:`, parseError.message);
          }
        }

        isInitialized = true;
        logger.info(`[VectorIndex] ✅ Loaded ${loaded} embeddings from database`);
        resolve(loaded);
      }
    );
  });
}

/**
 * Index a cover embedding (persists to database)
 * 
 * @param {string} recordId - Record identifier (can be discogsId or internal ID)
 * @param {number[]} embedding - Embedding vector
 * @param {Object} metadata - Optional metadata (artist, title, discogsId, etc.)
 * @param {Object} database - SQLite database instance (optional, for persistence)
 */
async function indexCoverEmbedding(recordId, embedding, metadata = {}, database = null) {
  if (!recordId) {
    throw new Error('Invalid recordId');
  }
  
  // CRITICAL: Validate embedding before storing
  if (!embedding) {
    throw new Error('Embedding is null/undefined - cannot index');
  }
  
  if (!Array.isArray(embedding) || embedding.length === 0) {
    throw new Error(`Invalid embedding: expected array, got ${typeof embedding}`);
  }
  
  // Validate embedding contains only numbers
  if (embedding.some(v => typeof v !== 'number' || !Number.isFinite(v))) {
    throw new Error('Embedding contains invalid values (NaN, Infinity, or non-numbers)');
  }
  
  // Validate embedding dimensions (expect ~512, allow ±10% tolerance)
  const expectedDims = 512;
  const minDims = Math.floor(expectedDims * 0.9);
  const maxDims = Math.ceil(expectedDims * 1.1);
  if (embedding.length < minDims || embedding.length > maxDims) {
    throw new Error(`Invalid embedding dimensions: got ${embedding.length}, expected ~${expectedDims} (range: ${minDims}-${maxDims})`);
  }

  const discogsId = metadata.discogsId || recordId;
  const embeddingData = {
    embedding: [...embedding], // Copy array
    metadata: { ...metadata },
    discogsId,
    indexedAt: new Date().toISOString(),
  };

  // Update in-memory cache
  embeddings.set(recordId, embeddingData);
  
  // Cache parsed embedding
  embeddingCache.set(recordId, embedding);

  // Persist to database if provided
  if (database) {
    return new Promise((resolve, reject) => {
      const embeddingJson = JSON.stringify(embedding);
      
      database.run(
        `INSERT OR REPLACE INTO cover_embeddings 
         (record_id, discogs_id, embedding_vector, artist, title, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          recordId,
          discogsId,
          embeddingJson,
          metadata.artist || null,
          metadata.title || null,
          embeddingData.indexedAt,
        ],
        (err) => {
          if (err) {
            logger.warn(`[VectorIndex] ⚠️  Failed to persist embedding for ${recordId}:`, err.message);
            // Don't reject - in-memory cache is still updated
            resolve();
          } else {
            logger.info(`[VectorIndex] ✅ Indexed embedding for recordId: ${recordId} (discogs: ${discogsId})`);
            resolve();
          }
        }
      );
    });
  } else {
    logger.info(`[VectorIndex] ✅ Indexed embedding for recordId: ${recordId} (in-memory only)`);
  }
}

/**
 * Find nearest covers by embedding similarity (optimized)
 * 
 * @param {number[]} queryEmbedding - Query embedding vector
 * @param {number} k - Number of nearest neighbors to return (default: 5)
 * @param {number} minSimilarity - Minimum similarity threshold (default: 0.0)
 * @param {Object} database - SQLite database instance (optional, for DB-only search)
 * @returns {Array<{recordId: string, similarity: number, metadata: Object, discogsId: string}>}
 */
async function findNearestCovers(queryEmbedding, k = 5, minSimilarity = 0.0, database = null) {
  if (!queryEmbedding || queryEmbedding.length === 0) {
    return [];
  }

  // If database is provided and in-memory cache is empty, search database
  if (database && embeddings.size === 0) {
    return await findNearestCoversInDB(queryEmbedding, k, minSimilarity, database);
  }

  if (embeddings.size === 0) {
    logger.warn('[VectorIndex] ⚠️  No embeddings indexed yet');
    return [];
  }

  // Optimized: Use a min-heap approach for top-k (more efficient than full sort)
  // For small k, we can use a simple approach with early termination
  const topK = [];
  const minHeap = []; // Keep track of minimum similarity in top-k

  // Compute similarity with all indexed embeddings
  for (const [recordId, data] of embeddings.entries()) {
    try {
      const similarity = cosineSimilarity(queryEmbedding, data.embedding);
      
      // Skip if below minimum threshold
      if (similarity < minSimilarity) continue;

      // If we have fewer than k results, add it
      if (topK.length < k) {
        topK.push({
          recordId,
          similarity,
          metadata: data.metadata,
          discogsId: data.discogsId,
        });
        minHeap.push(similarity);
        // Sort minHeap to track minimum
        if (topK.length === k) {
          minHeap.sort((a, b) => a - b);
        }
      } else {
        // We have k results, check if this is better than the worst
        const minSimilarityInTopK = minHeap[0];
        if (similarity > minSimilarityInTopK) {
          // Replace the worst result
          const worstIndex = topK.findIndex(item => item.similarity === minSimilarityInTopK);
          if (worstIndex !== -1) {
            topK[worstIndex] = {
              recordId,
              similarity,
              metadata: data.metadata,
              discogsId: data.discogsId,
            };
            // Update minHeap
            minHeap[0] = similarity;
            minHeap.sort((a, b) => a - b);
          }
        }
      }
    } catch (error) {
      logger.warn(`[VectorIndex] Error computing similarity for ${recordId}:`, error.message);
    }
  }

  // Sort by similarity (descending) for final result
  topK.sort((a, b) => b.similarity - a.similarity);
  
  if (topK.length > 0) {
    logger.debug(`[VectorIndex] Found ${topK.length} nearest covers (top similarity: ${topK[0].similarity.toFixed(3)})`);
  }
  
  return topK;
}

/**
 * Find nearest covers by searching database directly (for large datasets)
 * 
 * @param {number[]} queryEmbedding - Query embedding vector
 * @param {number} k - Number of nearest neighbors to return
 * @param {number} minSimilarity - Minimum similarity threshold
 * @param {Object} database - SQLite database instance
 * @returns {Promise<Array>}
 */
async function findNearestCoversInDB(queryEmbedding, k, minSimilarity, database) {
  return new Promise((resolve, reject) => {
    database.all(
      `SELECT record_id, discogs_id, embedding_vector, artist, title 
       FROM cover_embeddings`,
      (err, rows) => {
        if (err) {
          logger.warn('[VectorIndex] ⚠️  Failed to search embeddings in DB:', err.message);
          resolve([]);
          return;
        }

        const similarities = [];
        const queryJson = JSON.stringify(queryEmbedding);

        for (const row of rows) {
          try {
            const recordId = row.record_id || row.discogs_id;
            
            // Check cache first, then parse and cache
            let embedding = embeddingCache.get(recordId);
            if (!embedding) {
              embedding = JSON.parse(row.embedding_vector);
              embeddingCache.set(recordId, embedding);
            }
            
            const similarity = cosineSimilarity(queryEmbedding, embedding);
            
            if (similarity >= minSimilarity) {
              similarities.push({
                recordId,
                similarity,
                metadata: {
                  artist: row.artist,
                  title: row.title,
                  discogsId: row.discogs_id,
                },
                discogsId: row.discogs_id,
              });
            }
          } catch (parseError) {
            // Skip invalid embeddings
            continue;
          }
        }

        // Sort and return top k
        similarities.sort((a, b) => b.similarity - a.similarity);
        const topK = similarities.slice(0, k);
        
        logger.debug(`[VectorIndex] Found ${topK.length} nearest covers from DB (top similarity: ${topK[0]?.similarity.toFixed(3) || 0})`);
        resolve(topK);
      }
    );
  });
}

/**
 * Batch index multiple embeddings (more efficient than individual calls)
 * 
 * @param {Array<{recordId: string, embedding: number[], metadata: Object}>} embeddingsArray
 * @param {Object} database - SQLite database instance (optional)
 * @returns {Promise<void>}
 */
async function batchIndexEmbeddings(embeddingsArray, database = null) {
  if (!Array.isArray(embeddingsArray) || embeddingsArray.length === 0) {
    return;
  }

  // Update in-memory cache
  for (const item of embeddingsArray) {
    const { recordId, embedding, metadata = {} } = item;
    if (!recordId || !embedding || embedding.length === 0) continue;

    const discogsId = metadata.discogsId || recordId;
    const embeddingCopy = [...embedding];
    
    embeddings.set(recordId, {
      embedding: embeddingCopy,
      metadata: { ...metadata },
      discogsId,
      indexedAt: new Date().toISOString(),
    });
    
    // Cache parsed embedding
    embeddingCache.set(recordId, embeddingCopy);
  }

  // Batch persist to database if provided
  if (database) {
    return new Promise((resolve, reject) => {
      const stmt = database.prepare(
        `INSERT OR REPLACE INTO cover_embeddings 
         (record_id, discogs_id, embedding_vector, artist, title, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      );

      let completed = 0;
      let errors = 0;

      for (const item of embeddingsArray) {
        const { recordId, embedding, metadata = {} } = item;
        if (!recordId || !embedding || embedding.length === 0) {
          completed++;
          continue;
        }

        const discogsId = metadata.discogsId || recordId;
        const embeddingJson = JSON.stringify(embedding);

        stmt.run(
          [recordId, discogsId, embeddingJson, metadata.artist || null, metadata.title || null, new Date().toISOString()],
          (err) => {
            if (err) {
              errors++;
              logger.warn(`[VectorIndex] ⚠️  Failed to persist embedding for ${recordId}:`, err.message);
            }
            completed++;
            if (completed === embeddingsArray.length) {
              stmt.finalize();
              logger.info(`[VectorIndex] ✅ Batch indexed ${embeddingsArray.length - errors} embeddings (${errors} errors)`);
              resolve();
            }
          }
        );
      }

      // Handle case where all items are invalid
      if (completed === 0) {
        resolve();
      }
    });
  } else {
    logger.info(`[VectorIndex] ✅ Batch indexed ${embeddingsArray.length} embeddings (in-memory only)`);
  }
}

/**
 * Remove an embedding from the index
 * 
 * @param {string} recordId - Record identifier to remove
 * @param {Object} database - SQLite database instance (optional)
 */
async function removeEmbedding(recordId, database = null) {
  embeddings.delete(recordId);
  embeddingCache.delete(recordId);
  
  if (database) {
    return new Promise((resolve, reject) => {
      database.run(
        `DELETE FROM cover_embeddings WHERE record_id = ? OR discogs_id = ?`,
        [recordId, recordId],
        (err) => {
          if (err) {
            logger.warn(`[VectorIndex] ⚠️  Failed to remove embedding from DB for ${recordId}:`, err.message);
          } else {
            logger.debug(`[VectorIndex] Removed embedding for recordId: ${recordId}`);
          }
          resolve();
        }
      );
    });
  } else {
    logger.debug(`[VectorIndex] Removed embedding for recordId: ${recordId} (in-memory only)`);
  }
}

/**
 * Get embedding count
 * 
 * @returns {number} Number of indexed embeddings
 */
function getEmbeddingCount() {
  return embeddings.size;
}

/**
 * Clear all embeddings (useful for testing)
 */
function clearIndex() {
  embeddings.clear();
  logger.info('[VectorIndex] Cleared all embeddings');
}

/**
 * Get all indexed record IDs
 * 
 * @returns {string[]} Array of record IDs
 */
function getAllRecordIds() {
  return Array.from(embeddings.keys());
}

/**
 * Check if vector index is initialized
 * 
 * @returns {boolean}
 */
function isReady() {
  return isInitialized;
}

module.exports = {
  initialize,
  indexCoverEmbedding,
  batchIndexEmbeddings,
  findNearestCovers,
  removeEmbedding,
  getEmbeddingCount,
  clearIndex,
  getAllRecordIds,
  isReady,
};

