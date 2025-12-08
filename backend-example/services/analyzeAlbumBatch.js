/**
 * Vinyl Vision Batch Processing
 * 
 * Processes multiple album cover images in batch mode.
 * Used by the Batch tab for rapid-fire scanning of multiple records.
 */

const analyzeAlbumCover = require('./analyzeAlbumCover');
const crypto = require('crypto');

/**
 * Generate a simple hash for an image (for caching)
 */
function getImageHash(imageBase64) {
  return crypto.createHash('md5').update(imageBase64).digest('hex');
}

/**
 * Analyze multiple album covers in batch
 * 
 * @param {Object} params - Batch parameters
 * @param {Array} params.entries - Array of { imageBase64, artist?, albumTitle?, fileName? }
 * @returns {Promise<Array>} Array of results with success/error status
 */
async function analyzeAlbumBatch({ entries }) {
  if (!entries || !Array.isArray(entries)) {
    throw new Error('Entries must be a non-empty array');
  }

  console.log(`[Vinyl Vision Batch] Processing ${entries.length} images...`);

  const results = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const fileName = entry.fileName || `image_${i + 1}.jpg`;

    try {
      console.log(`[Vinyl Vision Batch] Processing ${i + 1}/${entries.length}: ${fileName}`);

      const metadata = await analyzeAlbumCover.analyzeAlbumCover({
        imageBase64: entry.imageBase64,
        artist: entry.artist,
        albumTitle: entry.albumTitle,
      });

      if (metadata) {
        results.push({
          success: true,
          fileName: fileName,
          metadata: metadata,
        });
        console.log(`[Vinyl Vision Batch] ✅ ${fileName}: ${metadata.artist} - ${metadata.albumTitle}`);
      } else {
        results.push({
          success: false,
          fileName: fileName,
          error: 'Analysis returned null',
        });
        console.log(`[Vinyl Vision Batch] ⚠️  ${fileName}: Analysis returned null`);
      }
    } catch (err) {
      results.push({
        success: false,
        fileName: fileName,
        error: err.message || 'Failed to analyze image',
      });
      console.error(`[Vinyl Vision Batch] ❌ ${fileName}: ${err.message}`);
    }

    // Small delay between requests to avoid rate limiting
    if (i < entries.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 500)); // 500ms delay
    }
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`[Vinyl Vision Batch] ✅ Complete: ${successCount}/${entries.length} successful`);

  return results;
}

module.exports = {
  analyzeAlbumBatch,
  getImageHash,
};

