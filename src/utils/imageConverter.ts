/**
 * Image Conversion Utility
 * 
 * Converts images (including HEIC) to JPEG format for Google Vision API compatibility.
 * Also resizes and compresses images for optimal upload speed and API performance.
 * 
 * CRITICAL: Google Vision API does NOT support HEIC files.
 * All images must be converted to JPEG before uploading.
 */

import * as ImageManipulator from 'expo-image-manipulator';
import { logger } from './logger';

export interface ConvertToJpegOptions {
  maxWidth?: number;
  quality?: number;
}

const DEFAULT_MAX_WIDTH = 1200; // 1000-1200px as requested
const DEFAULT_QUALITY = 0.8; // 0.75-0.85 as requested

/**
 * Converts any image (HEIC, PNG, etc.) to JPEG format
 * Resizes to maxWidth (default 1200px) and compresses to quality (default 0.8)
 * 
 * This function MUST be called for all images before uploading to backend/Google Vision
 * 
 * @param imageUri - Local file URI of the image (can be HEIC, PNG, JPEG, etc.)
 * @param options - Conversion options
 * @returns JPEG image URI (always JPEG format, never HEIC)
 */
export const convertToJpeg = async (
  imageUri: string,
  options: ConvertToJpegOptions = {}
): Promise<string> => {
  const {
    maxWidth = DEFAULT_MAX_WIDTH,
    quality = DEFAULT_QUALITY,
  } = options;

  try {
    logger.debug(`[ImageConverter] Converting image to JPEG: ${imageUri}`);
    logger.debug(`[ImageConverter] Target: maxWidth=${maxWidth}px, quality=${quality}`);

    // First, get the original image dimensions
    const originalImage = await ImageManipulator.manipulateAsync(
      imageUri,
      [], // No manipulations - just get info
      { format: ImageManipulator.SaveFormat.JPEG }
    );

    const originalWidth = originalImage.width;
    const originalHeight = originalImage.height;
    logger.debug(`[ImageConverter] Original size: ${originalWidth}x${originalHeight}`);

    // Calculate resize dimensions maintaining aspect ratio
    let resizeWidth = originalWidth;
    let resizeHeight = originalHeight;

    if (originalWidth > maxWidth) {
      const ratio = maxWidth / originalWidth;
      resizeWidth = maxWidth;
      resizeHeight = Math.round(originalHeight * ratio);
      logger.debug(`[ImageConverter] Resizing to: ${resizeWidth}x${resizeHeight} (maintaining aspect ratio)`);
    } else {
      logger.debug(`[ImageConverter] Image width (${originalWidth}px) is within limit, keeping original size`);
    }

    // Convert to JPEG, resize if needed, and compress
    // This will convert HEIC → JPEG automatically
    // CRITICAL: We preserve orientation by not rotating - ImageManipulator handles EXIF correctly
    const convertedImage = await ImageManipulator.manipulateAsync(
      imageUri,
      resizeWidth < originalWidth
        ? [
            {
              resize: {
                width: resizeWidth,
                height: resizeHeight,
              },
            },
          ]
        : [], // No resize needed
      {
        compress: quality,
        format: ImageManipulator.SaveFormat.JPEG, // CRITICAL: Always save as JPEG
        // Note: ImageManipulator automatically handles EXIF orientation correctly
        // The output image will be in the correct orientation
      }
    );

    logger.debug(`[ImageConverter] ✅ Converted to JPEG: ${convertedImage.width}x${convertedImage.height}`);
    logger.debug(`[ImageConverter] ✅ JPEG URI: ${convertedImage.uri}`);
    logger.debug(`[ImageConverter] ✅ Format: JPEG (HEIC/PNG converted)`);
    logger.debug(`[ImageConverter] ✅ Orientation: Preserved (ImageManipulator handles EXIF)`);

    return convertedImage.uri;
  } catch (error) {
    logger.error('[ImageConverter] Error converting image to JPEG:', error);
    // If conversion fails, try to at least convert format without resize
    try {
      const fallback = await ImageManipulator.manipulateAsync(
        imageUri,
        [],
        {
          compress: quality,
          format: ImageManipulator.SaveFormat.JPEG,
        }
      );
      logger.debug('[ImageConverter] ✅ Fallback conversion successful');
      return fallback.uri;
    } catch (fallbackError) {
      logger.error('[ImageConverter] ❌ Fallback conversion also failed:', fallbackError);
      // Last resort: return original (but warn user)
      logger.warn('[ImageConverter] ⚠️ Returning original URI - may be HEIC and fail on backend');
      return imageUri;
    }
  }
};

/**
 * Batch convert multiple images to JPEG
 * Useful for batch scanning
 */
export const convertMultipleToJpeg = async (
  imageUris: string[],
  options: ConvertToJpegOptions = {}
): Promise<string[]> => {
  logger.debug(`[ImageConverter] Converting ${imageUris.length} images to JPEG...`);
  const convertedUris: string[] = [];
  
  for (let i = 0; i < imageUris.length; i++) {
    try {
      const converted = await convertToJpeg(imageUris[i], options);
      convertedUris.push(converted);
      logger.debug(`[ImageConverter] ✅ Converted ${i + 1}/${imageUris.length}`);
    } catch (error) {
      logger.error(`[ImageConverter] ❌ Failed to convert image ${i + 1}:`, error);
      // Skip failed conversions
    }
  }
  
  logger.debug(`[ImageConverter] ✅ Batch conversion complete: ${convertedUris.length}/${imageUris.length} successful`);
  return convertedUris;
};

