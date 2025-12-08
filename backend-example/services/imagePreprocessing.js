/**
 * Image Preprocessing Service
 * 
 * Enhances images before sending to Vision API for better OCR accuracy.
 * Implements Vinyl Vision-style preprocessing:
 * - Deskewing (rotation correction)
 * - Contrast enhancement
 * - Noise reduction
 * - Brightness/contrast adjustment
 * 
 * Uses sharp for image processing (fast, efficient)
 */

const sharp = require('sharp');

const ENABLE_PREPROCESSING = process.env.ENABLE_IMAGE_PREPROCESSING !== 'false';

/**
 * Preprocess image for better OCR accuracy
 * 
 * @param {Buffer} imageBuffer - Original image buffer
 * @param {Object} options - Preprocessing options
 * @returns {Promise<Buffer>} Preprocessed image buffer
 */
async function preprocessImage(imageBuffer, options = {}) {
  if (!ENABLE_PREPROCESSING) {
    console.log('[Image Preprocessing] ⚠️  Preprocessing disabled');
    return imageBuffer;
  }

  try {
    console.log('[Image Preprocessing] 🔧 Starting image enhancement...');
    
    const {
      enhanceContrast = true,
      enhanceBrightness = true,
      reduceNoise = true,
      sharpen = true,
      normalize = true,
    } = options;

    let processed = sharp(imageBuffer);

    // Step 1: Normalize (auto-adjust levels)
    if (normalize) {
      console.log('[Image Preprocessing]   → Normalizing image levels');
      processed = processed.normalise(); // Auto-adjusts brightness/contrast
    }

    // Step 2: Enhance contrast
    if (enhanceContrast) {
      console.log('[Image Preprocessing]   → Enhancing contrast');
      // Increase contrast by 20% (adjustable)
      processed = processed.modulate({
        brightness: enhanceBrightness ? 1.1 : 1.0, // Slight brightness boost
        saturation: 1.0, // Keep saturation
      });
      
      // Apply contrast adjustment using linear transformation
      // This is done via gamma correction and levels adjustment
      processed = processed.gamma(1.2); // Slight gamma boost for contrast
    }

    // Step 3: Sharpen (helps with text clarity)
    if (sharpen) {
      console.log('[Image Preprocessing]   → Applying sharpening');
      processed = processed.sharpen({
        sigma: 1.5, // Sharpening strength
        flat: 1.0,
        jagged: 2.0,
      });
    }

    // Step 4: Reduce noise (median filter)
    if (reduceNoise) {
      console.log('[Image Preprocessing]   → Reducing noise');
      // Sharp doesn't have built-in denoising, but we can use
      // a slight blur followed by sharpening to reduce noise
      // For better denoising, would need a dedicated library
      processed = processed.median(2); // Median filter (reduces noise)
    }

    // Convert to JPEG for consistency
    const processedBuffer = await processed
      .jpeg({ quality: 90, mozjpeg: true }) // High quality JPEG
      .toBuffer();

    const originalSize = imageBuffer.length;
    const processedSize = processedBuffer.length;
    console.log(`[Image Preprocessing] ✅ Enhancement complete`);
    console.log(`[Image Preprocessing]   Original: ${(originalSize / 1024).toFixed(2)}KB`);
    console.log(`[Image Preprocessing]   Processed: ${(processedSize / 1024).toFixed(2)}KB`);

    return processedBuffer;

  } catch (error) {
    console.error('[Image Preprocessing] ❌ Error:', error.message);
    console.warn('[Image Preprocessing] ⚠️  Returning original image');
    return imageBuffer; // Return original on error
  }
}

/**
 * Detect and correct image skew (rotation)
 * 
 * Note: Full deskewing requires advanced image analysis.
 * This is a simplified version that handles common cases.
 * 
 * @param {Buffer} imageBuffer - Image buffer
 * @returns {Promise<Buffer>} Deskewed image buffer
 */
async function deskewImage(imageBuffer) {
  if (!ENABLE_PREPROCESSING) {
    return imageBuffer;
  }

  try {
    console.log('[Image Preprocessing] 🔄 Attempting deskew detection...');
    
    // Note: Full deskewing requires:
    // 1. Edge detection
    // 2. Hough transform or similar to detect lines
    // 3. Calculate rotation angle
    // 4. Rotate image
    
    // For now, we'll use sharp's auto-orientation which handles EXIF rotation
    // Full deskewing would require a more advanced library like OpenCV
    const processed = await sharp(imageBuffer)
      .rotate() // Auto-rotate based on EXIF
      .jpeg({ quality: 90 })
      .toBuffer();

    console.log('[Image Preprocessing] ✅ EXIF orientation applied');
    return processed;

  } catch (error) {
    console.error('[Image Preprocessing] ❌ Deskew error:', error.message);
    return imageBuffer;
  }
}

/**
 * Full preprocessing pipeline
 * Applies all enhancements in optimal order
 * 
 * @param {Buffer} imageBuffer - Original image buffer
 * @param {Object} options - Preprocessing options
 * @returns {Promise<Buffer>} Fully preprocessed image buffer
 */
async function preprocessImageFull(imageBuffer, options = {}) {
  try {
    console.log('[Image Preprocessing] 🎨 Full preprocessing pipeline...');
    
    // Step 1: Deskew (rotation correction)
    let processed = await deskewImage(imageBuffer);
    
    // Step 2: Enhance (contrast, brightness, sharpening, noise reduction)
    processed = await preprocessImage(processed, options);
    
    console.log('[Image Preprocessing] ✅ Full preprocessing complete');
    return processed;

  } catch (error) {
    console.error('[Image Preprocessing] ❌ Full preprocessing error:', error.message);
    return imageBuffer;
  }
}

module.exports = {
  preprocessImage,
  deskewImage,
  preprocessImageFull,
  isEnabled: () => ENABLE_PREPROCESSING
};

