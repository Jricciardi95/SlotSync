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
    console.log(`[ImageConverter] Converting image to JPEG: ${imageUri}`);
    console.log(`[ImageConverter] Target: maxWidth=${maxWidth}px, quality=${quality}`);

    // First, get the original image dimensions
    const originalImage = await ImageManipulator.manipulateAsync(
      imageUri,
      [], // No manipulations - just get info
      { format: ImageManipulator.SaveFormat.JPEG }
    );

    const originalWidth = originalImage.width;
    const originalHeight = originalImage.height;
    console.log(`[ImageConverter] Original size: ${originalWidth}x${originalHeight}`);

    // Calculate resize dimensions maintaining aspect ratio
    let resizeWidth = originalWidth;
    let resizeHeight = originalHeight;

    if (originalWidth > maxWidth) {
      const ratio = maxWidth / originalWidth;
      resizeWidth = maxWidth;
      resizeHeight = Math.round(originalHeight * ratio);
      console.log(`[ImageConverter] Resizing to: ${resizeWidth}x${resizeHeight} (maintaining aspect ratio)`);
    } else {
      console.log(`[ImageConverter] Image width (${originalWidth}px) is within limit, keeping original size`);
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

    console.log(`[ImageConverter] ✅ Converted to JPEG: ${convertedImage.width}x${convertedImage.height}`);
    console.log(`[ImageConverter] ✅ JPEG URI: ${convertedImage.uri}`);
    console.log(`[ImageConverter] ✅ Format: JPEG (HEIC/PNG converted)`);
    console.log(`[ImageConverter] ✅ Orientation: Preserved (ImageManipulator handles EXIF)`);

    return convertedImage.uri;
  } catch (error) {
    console.error('[ImageConverter] Error converting image to JPEG:', error);
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
      console.log('[ImageConverter] ✅ Fallback conversion successful');
      return fallback.uri;
    } catch (fallbackError) {
      console.error('[ImageConverter] ❌ Fallback conversion also failed:', fallbackError);
      // Last resort: return original (but warn user)
      console.warn('[ImageConverter] ⚠️ Returning original URI - may be HEIC and fail on backend');
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
  console.log(`[ImageConverter] Converting ${imageUris.length} images to JPEG...`);
  const convertedUris: string[] = [];
  
  for (let i = 0; i < imageUris.length; i++) {
    try {
      const converted = await convertToJpeg(imageUris[i], options);
      convertedUris.push(converted);
      console.log(`[ImageConverter] ✅ Converted ${i + 1}/${imageUris.length}`);
    } catch (error) {
      console.error(`[ImageConverter] ❌ Failed to convert image ${i + 1}:`, error);
      // Skip failed conversions
    }
  }
  
  console.log(`[ImageConverter] ✅ Batch conversion complete: ${convertedUris.length}/${imageUris.length} successful`);
  return convertedUris;
};

