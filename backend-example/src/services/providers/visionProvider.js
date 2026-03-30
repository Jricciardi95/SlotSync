/**
 * Vision Provider
 * 
 * Handles Google Vision API integration for OCR and image analysis.
 */

const path = require('path');
const { ImageAnnotatorClient } = require('@google-cloud/vision');
const logger = require('../../../services/logger');
const config = require('../../../config');
const { normalizeText, extractCandidates } = require('../../../utils/textUtils');

// Vision client state (lazy initialization)
let visionClient = null;
let visionClientInitialized = false;
let visionClientInitError = null;

/**
 * Get or initialize Google Vision client
 * @param {string|null} validatedCredentialsPath - Optional validated credentials path
 * @param {Object|null} credentialsValidationResult - Optional validation result
 * @returns {ImageAnnotatorClient|null} Vision client or null if unavailable
 */
function getVisionClient(validatedCredentialsPath = null, credentialsValidationResult = null) {
  if (visionClientInitialized) {
    return visionClient;
  }
  
  visionClientInitialized = true;
  
  if (!ImageAnnotatorClient) {
    visionClientInitError = '@google-cloud/vision library not available';
    logger.warn('[Vision] ⚠️  @google-cloud/vision not available');
    return null;
  }
  
  const credPath = validatedCredentialsPath || config.googleVision.credentialsPath;
  
  if (!credPath) {
    visionClientInitError = 'GOOGLE_APPLICATION_CREDENTIALS not set and no validated credentials found';
    logger.warn('[Vision] ⚠️  GOOGLE_APPLICATION_CREDENTIALS not set');
    return null;
  }
  
  // If we validated credentials earlier and they failed, log the reason
  if (credentialsValidationResult && !credentialsValidationResult.ok) {
    visionClientInitError = `Credentials validation failed: ${credentialsValidationResult.reason}`;
    logger.warn(`[Vision] ⚠️  Credentials validation failed earlier: ${credentialsValidationResult.reason}`);
    logger.warn('[Vision] ⚠️  Attempting to initialize anyway, but may fail');
  }
  
  try {
    // Use explicit keyFilename to avoid "default credentials" resolution issues
    const absPath = path.resolve(credPath);
    visionClient = new ImageAnnotatorClient({ keyFilename: absPath });
    logger.info('[Vision] ✅ Google Vision API client initialized');
    visionClientInitError = null; // Clear any previous errors on success
    return visionClient;
  } catch (error) {
    visionClientInitError = error.message;
    logger.warn('[Vision] ⚠️  Failed to initialize Google Vision client:', error.message);
    if (error.message.includes('default credentials') || error.message.includes('Could not load')) {
      logger.warn('[Vision] ⚠️  This error usually means the credentials file path is wrong or the file is invalid');
      logger.warn(`[Vision] ⚠️  Attempted path: ${credPath}`);
    }
    return null;
  }
}

/**
 * Process image with Google Vision API
 * Extracts OCR text, web entities, labels, and similar images
 * 
 * @param {Buffer} imageBuffer - Image buffer to process
 * @returns {Promise<Object>} Vision result with structured data
 */
async function processImageWithGoogleVision(imageBuffer) {
  const client = getVisionClient();
  if (!client) {
    throw new Error('Google Vision not configured');
  }

  // Structured result matching frontend VisionResult type
  const result = {
    webEntities: [],
    pageTitles: [],
    ocrTextBlocks: [],
    extractedText: null,
    labels: [],
    similarImageUrls: [],
    // Legacy fields for backward compatibility
    candidates: [],
    similarImages: [],
    rawVisionResponse: null // For debugging (sanitized)
  };

  try {
    logger.debug('[Google Vision] Performing comprehensive analysis...');

    // Request all features simultaneously
    const [batchResult] = await client.batchAnnotateImages({
      requests: [{
        image: { content: imageBuffer },
        features: [
          { type: 'WEB_DETECTION', maxResults: 20 },
          { type: 'LABEL_DETECTION', maxResults: 15 },
          { type: 'TEXT_DETECTION' },
        ],
      }],
    });

    const response = batchResult.responses?.[0];
    if (!response) {
      logger.warn('[Google Vision] No response from API');
      return result;
    }

    const webDetection = response.webDetection;
    const labelDetection = response.labelAnnotations;
    const textDetection = response.textAnnotations;

    // Log raw response (sanitized - no secrets)
    result.rawVisionResponse = {
      webDetection: webDetection ? {
        webEntities: (webDetection.webEntities || []).slice(0, 10).map(e => ({
          description: e.description,
          score: e.score
        })),
        pagesWithMatchingImages: (webDetection.pagesWithMatchingImages || []).slice(0, 5).map(p => ({
          url: p.url ? p.url.substring(0, 100) + '...' : null, // Truncate URLs
          pageTitle: p.pageTitle
        })),
        visuallySimilarImages: (webDetection.visuallySimilarImages || []).length
      } : null,
      labelDetection: labelDetection ? labelDetection.slice(0, 10).map(l => ({
        description: l.description,
        score: l.score
      })) : null,
      textDetection: textDetection ? {
        hasText: textDetection.length > 0,
        textLength: textDetection[0]?.description?.length || 0,
        preview: textDetection[0]?.description?.substring(0, 200) || null
      } : null
    };

    // Log comprehensive Vision response summary
    logger.debug(`[Google Vision] 📊 Vision API Response Summary:`);
    logger.debug(`[Google Vision]   - Web entities: ${result.webEntities?.length || 0}`);
    logger.debug(`[Google Vision]   - Page titles: ${result.pageTitles?.length || 0}`);
    logger.debug(`[Google Vision]   - Similar images: ${result.similarImageUrls?.length || 0}`);
    logger.debug(`[Google Vision]   - Labels: ${result.labels?.length || 0}`);
    logger.debug(`[Google Vision]   - OCR text length: ${result.extractedText?.length || 0} chars`);
    logger.debug(`[Google Vision]   - OCR text blocks: ${result.ocrTextBlocks?.length || 0}`);
    
    if (result.rawVisionResponse) {
      logger.debug(`[Google Vision] 📊 Detailed response:`, JSON.stringify(result.rawVisionResponse, null, 2));
    }

    // Extract text and split into blocks
    if (textDetection && textDetection.length > 0) {
      const rawText = textDetection[0].description || '';
      result.extractedText = normalizeText(rawText);
      
      // Split OCR text into blocks (lines or paragraphs)
      // This matches the frontend VisionResult.ocrTextBlocks structure
      const lines = result.extractedText.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      
      if (lines.length > 1) {
        result.ocrTextBlocks = lines;
      } else if (result.extractedText.length > 0) {
        // Single line - try to split by common separators
        const separators = [' - ', ' – ', ' — ', ' | ', ' / '];
        let split = false;
        for (const sep of separators) {
          if (result.extractedText.includes(sep)) {
            result.ocrTextBlocks = result.extractedText.split(sep)
              .map(s => s.trim())
              .filter(s => s.length > 0);
            split = true;
            break;
          }
        }
        if (!split) {
          result.ocrTextBlocks = [result.extractedText];
        }
      }
      
      logger.debug('[Google Vision] Raw OCR text (first 500 chars):', rawText.substring(0, 500));
      logger.debug('[Google Vision] Normalized text (first 300 chars):', result.extractedText.substring(0, 300));
      logger.debug('[Google Vision] OCR text blocks:', result.ocrTextBlocks.length);
      
      // Log if text appears to be all caps (common on album covers)
      const upperCount = (result.extractedText.match(/[A-Z]/g) || []).length;
      const lowerCount = (result.extractedText.match(/[a-z]/g) || []).length;
      if (upperCount > lowerCount * 2) {
        logger.debug('[Google Vision] ⚠️  Text appears to be ALL CAPS - will use enhanced all-caps detection');
      }
    }

    // Process web detection
    if (webDetection) {
      // Web entities
      const entities = webDetection.webEntities || [];
      result.webEntities = entities.map(e => ({
        description: e.description,
        score: e.score || 0
      }));

      // Pages with matching images
      const pages = webDetection.pagesWithMatchingImages || [];
      result.pageTitles = pages.map(p => ({
        url: p.url,
        pageTitle: p.pageTitle || ''
      }));

      // Similar images
      const similar = webDetection.visuallySimilarImages || [];
      result.similarImages = similar.map(img => ({
        url: img.url
      }));
      // Also store in structured format
      result.similarImageUrls = similar.map(img => img.url).filter(url => url);

      // Extract candidates from web entities
      for (const entity of entities.slice(0, 20)) {
        if (entity.score < 0.3) continue;
        const description = normalizeText(entity.description || '');
        if (description.length < 5) continue;

        // Try to extract artist/title from entity description
        const entityCandidates = extractCandidates(description);
        for (const candidate of entityCandidates) {
          candidate.confidence *= (entity.score || 0.5); // Weight by entity score
          candidate.source = `web_entity_${candidate.source}`;
          if (!result.candidates.find(c => {
            const key = (c) => `${(c.artist || '').toLowerCase()}|${(c.title || '').toLowerCase()}`;
            return key(c) === key(candidate);
          })) {
            result.candidates.push(candidate);
          }
        }
      }

      // Extract from page titles (often more accurate)
      for (const page of pages.slice(0, 15)) {
        const pageTitle = normalizeText(page.pageTitle || '');
        if (pageTitle.length < 5) continue;

        const pageCandidates = extractCandidates(pageTitle);
        for (const candidate of pageCandidates) {
          candidate.confidence *= 0.9; // Page titles are usually reliable
          candidate.source = `page_title_${candidate.source}`;
          if (!result.candidates.find(c => {
            const key = (c) => `${(c.artist || '').toLowerCase()}|${(c.title || '').toLowerCase()}`;
            return key(c) === key(candidate);
          })) {
            result.candidates.push(candidate);
          }
        }
      }
    }

    // Process labels for context
    if (labelDetection) {
      result.labels = labelDetection
        .filter(l => l.score > 0.5)
        .map(l => ({
          description: l.description,
          score: l.score
        }));
    }

    // Extract candidates from OCR text
    if (result.extractedText) {
      const ocrCandidates = extractCandidates(result.extractedText);
      for (const candidate of ocrCandidates) {
        candidate.source = `ocr_${candidate.source}`;
        if (!result.candidates.find(c => {
          const key = (c) => `${(c.artist || '').toLowerCase()}|${(c.title || '').toLowerCase()}`;
          return key(c) === key(candidate);
        })) {
          result.candidates.push(candidate);
        }
      }
    }

    // Sort all candidates by confidence
    result.candidates.sort((a, b) => b.confidence - a.confidence);

    // Log all extracted candidates with details
    logger.debug(`[Google Vision] 🎯 Candidate Extraction Summary:`);
    logger.debug(`[Google Vision]   Total candidates: ${result.candidates.length}`);
    
    if (result.candidates.length > 0) {
      logger.debug(`[Google Vision] 📋 All candidates (sorted by confidence):`);
      result.candidates.forEach((c, idx) => {
        logger.debug(`  ${idx + 1}. "${c.artist}" - "${c.title}"`);
        logger.debug(`     Confidence: ${c.confidence.toFixed(3)}, Source: ${c.source}`);
      });
      
      logger.debug(`[Google Vision] 🏆 Top 3 candidates:`);
      result.candidates.slice(0, 3).forEach((c, idx) => {
        logger.debug(`  ${idx + 1}. "${c.artist}" - "${c.title}" (${c.confidence.toFixed(3)}, ${c.source})`);
      });
    } else {
      logger.warn(`[Google Vision] ⚠️  No candidates extracted! This may indicate:`);
      logger.warn(`[Google Vision]   - Poor image quality`);
      logger.warn(`[Google Vision]   - No text visible on cover`);
      logger.warn(`[Google Vision]   - Vision API returned no useful data`);
    }

    return result;
  } catch (error) {
    logger.error('[Google Vision] Error:', error.message);
    throw error;
  }
}

module.exports = {
  getVisionClient,
  processImageWithGoogleVision,
};


