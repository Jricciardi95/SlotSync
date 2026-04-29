/**
 * Embedding Database Service
 * 
 * Manages storage and retrieval of album cover embeddings for visual similarity matching.
 * Stores embeddings in SQLite database for fast lookup.
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { embeddingCache } = require('./embeddingCache');

const config = require('../config');
const DB_PATH = config.database.path;

/**
 * Get database connection
 */
function getDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(db);
      }
    });
  });
}

/**
 * Store embedding for an album
 * 
 * @param {Object} album - Album info {artist, title, year, discogsId, coverImageUrl}
 * @param {Array<number>} embedding - Embedding vector
 * @param {string} model - Model used to generate embedding (CLIP)
 */
async function storeEmbedding(album, embedding, model = 'Xenova/clip-vit-base-patch32') {
  return new Promise((resolve, reject) => {
    getDatabase().then(db => {
      // Serialize embedding array to JSON string for storage
      const embeddingJson = JSON.stringify(embedding);
      
      db.run(
        `INSERT OR REPLACE INTO album_embeddings 
         (artist, title, year, discogs_id, embedding, embedding_model, cover_image_url)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          album.artist,
          album.title,
          album.year || null,
          album.discogsId || null,
          embeddingJson,
          model,
          album.coverImageUrl || null,
        ],
        function(err) {
          db.close();
          if (err) {
            console.error('[Embedding DB] ❌ Error storing embedding:', err.message);
            reject(err);
          } else {
            console.log(`[Embedding DB] ✅ Stored embedding for "${album.artist}" - "${album.title}"`);
            resolve(this.lastID);
          }
        }
      );
    }).catch(reject);
  });
}

/**
 * Search for similar albums using embedding similarity
 * 
 * @param {Array<number>} queryEmbedding - Query embedding vector
 * @param {number} threshold - Minimum similarity threshold (default 0.85)
 * @param {number} limit - Maximum results to return (default 10)
 * @returns {Promise<Array>} Similar albums with similarity scores
 */
async function searchSimilarAlbums(queryEmbedding, threshold = 0.85, limit = 10) {
  return new Promise((resolve, reject) => {
    getDatabase().then(db => {
      db.all(
        `SELECT artist, title, year, discogs_id, embedding, cover_image_url 
         FROM album_embeddings`,
        [],
        (err, rows) => {
          db.close();
          
          if (err) {
            console.error('[Embedding DB] ❌ Error searching embeddings:', err.message);
            reject(err);
            return;
          }

          if (rows.length === 0) {
            console.log('[Embedding DB] ℹ️  No embeddings in database');
            resolve([]);
            return;
          }

          // Calculate similarity for each stored embedding
          const { cosineSimilarity } = require('./imageEmbedding');
          const results = [];

          for (const row of rows) {
            try {
              // Create cache key from album info
              const cacheKey = `${row.artist}::${row.title}::${row.year || ''}`;
              
              // Check cache first, then parse and cache
              let storedEmbedding = embeddingCache.get(cacheKey);
              if (!storedEmbedding) {
                storedEmbedding = JSON.parse(row.embedding);
                embeddingCache.set(cacheKey, storedEmbedding);
              }
              
              const similarity = cosineSimilarity(queryEmbedding, storedEmbedding);

              if (similarity >= threshold) {
                results.push({
                  artist: row.artist,
                  title: row.title,
                  year: row.year,
                  discogsId: row.discogs_id,
                  coverImageUrl: row.cover_image_url,
                  similarity: similarity,
                });
              }
            } catch (parseError) {
              console.warn(`[Embedding DB] ⚠️  Failed to parse embedding for ${row.artist} - ${row.title}`);
            }
          }

          // Sort by similarity (highest first) and limit
          results.sort((a, b) => b.similarity - a.similarity);
          const limitedResults = results.slice(0, limit);

          console.log(`[Embedding DB] 🔍 Found ${limitedResults.length} similar albums (threshold: ${threshold})`);
          resolve(limitedResults);
        }
      );
    }).catch(reject);
  });
}

/**
 * Get embedding for a specific album
 * 
 * @param {string} artist - Artist name
 * @param {string} title - Album title
 * @param {number} year - Year (optional)
 * @returns {Promise<Array<number>|null>} Embedding vector or null if not found
 */
async function getEmbedding(artist, title, year = null) {
  return new Promise((resolve, reject) => {
    getDatabase().then(db => {
      const query = year
        ? `SELECT embedding FROM album_embeddings 
           WHERE LOWER(artist) = LOWER(?) AND LOWER(title) = LOWER(?) AND year = ?`
        : `SELECT embedding FROM album_embeddings 
           WHERE LOWER(artist) = LOWER(?) AND LOWER(title) = LOWER(?)`;
      
      const params = year ? [artist, title, year] : [artist, title];
      
      db.get(query, params, (err, row) => {
        db.close();
        
        if (err) {
          reject(err);
        } else if (row) {
          try {
            // Create cache key from album info
            const cacheKey = `${artist}::${title}::${year || ''}`;
            
            // Check cache first, then parse and cache
            let embedding = embeddingCache.get(cacheKey);
            if (!embedding) {
              embedding = JSON.parse(row.embedding);
              embeddingCache.set(cacheKey, embedding);
            }
            
            resolve(embedding);
          } catch (parseError) {
            reject(parseError);
          }
        } else {
          resolve(null);
        }
      });
    }).catch(reject);
  });
}

/**
 * Check if embedding exists for an album
 * 
 * @param {string} artist - Artist name
 * @param {string} title - Album title
 * @param {number} year - Year (optional)
 * @returns {Promise<boolean>} True if embedding exists
 */
async function hasEmbedding(artist, title, year = null) {
  const embedding = await getEmbedding(artist, title, year);
  return embedding !== null;
}

/**
 * Get count of stored embeddings
 * 
 * @returns {Promise<number>} Number of embeddings in database
 */
async function getEmbeddingCount() {
  return new Promise((resolve, reject) => {
    getDatabase().then(db => {
      db.get('SELECT COUNT(*) as count FROM album_embeddings', [], (err, row) => {
        db.close();
        if (err) {
          reject(err);
        } else {
          resolve(row.count);
        }
      });
    }).catch(reject);
  });
}

module.exports = {
  storeEmbedding,
  searchSimilarAlbums,
  getEmbedding,
  hasEmbedding,
  getEmbeddingCount,
};

