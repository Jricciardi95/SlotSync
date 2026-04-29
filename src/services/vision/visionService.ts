/**
 * Vision Service
 * 
 * Handles image preprocessing and structures Google Vision API requests.
 * 
 * Note: The actual Google Vision API calls happen on the backend.
 * This service prepares images and structures requests for the backend.
 * 
 * The backend will:
 * 1. Receive the preprocessed image
 * 2. Call Google Vision API with Web Detection, OCR, and Labels
 * 3. Return a structured VisionResult
 * 4. Frontend will extract candidates from VisionResult
 */

import { ImagePreprocessingOptions } from './types';
import { resizeImageForVision } from '../../utils/imageResize';
import { convertToJpeg } from '../../utils/imageConverter';
import { logger } from '../../utils/logger';

/**
 * Preprocesses an image for Google Vision API
 * 
 * Steps:
 * 1. Convert HEIC/PNG to JPEG (if needed)
 * 2. Resize to optimal size (~1024x1024 max)
 * 3. Normalize for Vision API
 * 
 * @param imageUri - Local file URI (can be HEIC, PNG, JPEG)
 * @param options - Preprocessing options
 * @returns Preprocessed JPEG image URI
 */
export async function preprocessImageForVision(
  imageUri: string,
  options: ImagePreprocessingOptions = {}
): Promise<string> {
  const {
    maxWidth = 1024,
    maxHeight = 1024,
    quality = 0.85,
    enhanceContrast = false,
    convertToGrayscale = false,
  } = options;

  logger.debug('[VisionService] Preprocessing image for Vision API...');
  logger.debug('[VisionService] Input URI:', imageUri);
  logger.debug('[VisionService] Target size:', `${maxWidth}x${maxHeight}, quality: ${quality}`);

  // Step 1: Convert to JPEG (handles HEIC → JPEG conversion)
  // This also resizes to 1200px max, so we'll resize again for Vision API
  const jpegUri = await convertToJpeg(imageUri, {
    maxWidth: 1200, // Initial conversion size
    quality: 0.8,
  });
  logger.debug('[VisionService] ✅ Converted to JPEG:', jpegUri);

  // Step 2: Resize to optimal size for Vision API
  // Vision API works well with ~1024px on long side
  // Larger images don't improve accuracy much but increase upload time
  const resizedUri = await resizeImageForVision(jpegUri, {
    maxWidth,
    maxHeight,
    quality,
    enhanceContrast,
    convertToGrayscale,
  });
  logger.debug('[VisionService] ✅ Resized for Vision API:', resizedUri);

  return resizedUri;
}

/**
 * Validates that an image is ready for Vision API
 * 
 * Checks:
 * - File exists
 * - Is JPEG format (or can be converted)
 * - Size is reasonable (< 10MB)
 * 
 * @param imageUri - Image URI to validate
 * @returns True if image is valid for Vision API
 */
export async function validateImageForVision(imageUri: string): Promise<boolean> {
  try {
    const { getInfoAsync } = require('expo-file-system/legacy');
    const fileInfo = await getInfoAsync(imageUri);
    
    if (!fileInfo.exists) {
      logger.warn('[VisionService] Image file does not exist:', imageUri);
      return false;
    }

    // Check file size (Vision API limit is 10MB)
    if ('size' in fileInfo && fileInfo.size) {
      const sizeMB = fileInfo.size / (1024 * 1024);
      if (sizeMB > 10) {
        logger.warn(`[VisionService] Image too large: ${sizeMB.toFixed(2)}MB (max 10MB)`);
        return false;
      }
    }

    return true;
  } catch (error) {
    logger.error('[VisionService] Error validating image:', error);
    return false;
  }
}

/**
 * Structures a Vision API request
 * 
 * This is used to document what features we request from Google Vision.
 * The actual API call happens on the backend.
 * 
 * @returns Vision API feature configuration
 */
export function getVisionApiFeatures() {
  return {
    features: [
      {
        type: 'WEB_DETECTION',
        maxResults: 20, // Get up to 20 web entities
      },
      {
        type: 'TEXT_DETECTION', // OCR - full text extraction
      },
      {
        type: 'LABEL_DETECTION',
        maxResults: 15, // Generic categories
      },
    ],
  };
}

/**
 * Normalizes OCR text for candidate extraction
 * 
 * Removes noise, normalizes whitespace, fixes common OCR mistakes.
 * 
 * @param text - Raw OCR text
 * @returns Normalized text
 */
export function normalizeOcrText(text: string): string {
  if (!text || typeof text !== 'string') return '';

  return text
    // Remove control characters
    .replace(/[\x00-\x1F\x7F-\x9F]/g, ' ')
    // Fix common OCR mistakes
    .replace(/[|]/g, 'I') // Pipe to I
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    // Remove leading/trailing punctuation
    .replace(/^[^\w\s]+|[^\w\s]+$/g, '')
    // Collapse multiple spaces
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/**
 * Splits OCR text into blocks (lines or paragraphs)
 * 
 * @param text - Full OCR text
 * @returns Array of text blocks
 */
export function splitOcrIntoBlocks(text: string): string[] {
  if (!text) return [];

  const normalized = normalizeOcrText(text);
  
  // Split by newlines first
  const lines = normalized.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  // If we have multiple lines, return them as blocks
  if (lines.length > 1) {
    return lines;
  }

  // Single line - try to split by common separators
  const separators = [' - ', ' – ', ' — ', ' | ', ' / '];
  for (const sep of separators) {
    if (normalized.includes(sep)) {
      return normalized.split(sep).map(s => s.trim()).filter(s => s.length > 0);
    }
  }

  // Return as single block
  return [normalized];
}

