/**
 * Image Hash Utility
 * 
 * Generates a hash from an image buffer for caching and duplicate detection.
 * Uses multiple samples from different parts of the image to avoid collisions.
 */

/**
 * Generates a hash from an image buffer
 * 
 * @param {Buffer} buffer - Image buffer
 * @returns {string|null} Image hash string (hex) or null if generation fails
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

module.exports = {
  generateImageHash,
};

