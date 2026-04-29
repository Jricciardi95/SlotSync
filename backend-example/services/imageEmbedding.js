/**
 * Image embedding bridge for the identification pipeline.
 * Uses CLIP-based embeddings from embeddingService (no external API keys).
 */

const { getImageEmbedding } = require('./embeddingService');

const ENABLE_EMBEDDINGS = process.env.ENABLE_IMAGE_EMBEDDINGS !== 'false';

/**
 * @param {Buffer} imageBuffer
 * @param {string} [_base64Image] ignored; kept for call-site compatibility
 * @returns {Promise<number[]|null>}
 */
async function generateImageEmbedding(imageBuffer, _base64Image = null) {
  if (!ENABLE_EMBEDDINGS || !imageBuffer?.length) {
    return null;
  }
  try {
    return await getImageEmbedding(imageBuffer);
  } catch (e) {
    console.warn('[Image Embedding] CLIP embedding failed:', e?.message || e);
    return null;
  }
}

function cosineSimilarity(embedding1, embedding2) {
  if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
    return 0;
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

function findSimilarCovers(queryEmbedding, knownAlbums, threshold = 0.85) {
  if (!queryEmbedding || !knownAlbums || knownAlbums.length === 0) {
    return [];
  }

  const results = knownAlbums
    .map((album) => ({
      ...album,
      similarity: cosineSimilarity(queryEmbedding, album.embedding),
    }))
    .filter((album) => album.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);

  console.log(`[Image Embedding] 🔍 Found ${results.length} similar covers (threshold: ${threshold})`);

  return results;
}

module.exports = {
  generateImageEmbedding,
  cosineSimilarity,
  findSimilarCovers,
  /** Pipeline may call embedding path when enabled; CLIP load happens lazily inside getImageEmbedding. */
  isEnabled: () => ENABLE_EMBEDDINGS,
};
