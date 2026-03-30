/**
 * Vision Result Extractor
 * 
 * Extracts artist and title from Google Vision API results using multiple strategies.
 * Prioritizes web detection over OCR for better accuracy.
 */

/**
 * Extract artist and title from Vision API results
 * 
 * Strategy priority:
 * 1. Web detection page titles (most reliable)
 * 2. Web entities descriptions
 * 3. OCR text with heuristics
 * 
 * @param {Object} visionResult - Vision API response object
 * @returns {Object|null} { artist, title, source } or null if extraction fails
 */
function extractArtistTitleFromVision(visionResult) {
  if (!visionResult) {
    return null;
  }

  const config = require('../config');
  const DEBUG = config.logging.debugIdentification;
  
  // Strategy 1: Web Detection Page Titles (highest priority)
  if (visionResult.pageTitles && visionResult.pageTitles.length > 0) {
    for (const page of visionResult.pageTitles) {
      const pageTitle = page.pageTitle || '';
      if (!pageTitle || pageTitle.trim().length < 5) continue;
      
      const extracted = extractFromText(pageTitle, 'web_page_title');
      if (extracted) {
        if (DEBUG) {
          console.log(`[VisionExtractor] ✅ Extracted from page title: "${extracted.artist}" - "${extracted.title}"`);
        }
        return extracted;
      }
    }
  }

  // Strategy 2: Web Entities Descriptions
  if (visionResult.webEntities && visionResult.webEntities.length > 0) {
    // Sort by score (highest first)
    const sortedEntities = [...visionResult.webEntities].sort((a, b) => (b.score || 0) - (a.score || 0));
    
    for (const entity of sortedEntities.slice(0, 10)) {
      const description = entity.description || '';
      if (!description || description.trim().length < 5) continue;
      if ((entity.score || 0) < 0.3) continue; // Skip low-confidence entities
      
      const extracted = extractFromText(description, 'web_entity');
      if (extracted) {
        if (DEBUG) {
          console.log(`[VisionExtractor] ✅ Extracted from web entity (score: ${entity.score}): "${extracted.artist}" - "${extracted.title}"`);
        }
        return extracted;
      }
    }
  }

  // Strategy 3: OCR Full Text (last resort)
  if (visionResult.extractedText && visionResult.extractedText.trim().length > 0) {
    const extracted = extractFromText(visionResult.extractedText, 'ocr');
    if (extracted) {
      if (DEBUG) {
        console.log(`[VisionExtractor] ✅ Extracted from OCR: "${extracted.artist}" - "${extracted.title}"`);
      }
      return extracted;
    }
  }

  if (DEBUG) {
    console.log('[VisionExtractor] ❌ Failed to extract artist/title from any source');
  }
  return null;
}

/**
 * Extract artist and title from text using multiple heuristics
 * 
 * @param {string} text - Text to extract from
 * @param {string} source - Source identifier for logging
 * @returns {Object|null} { artist, title, source } or null
 */
function extractFromText(text, source) {
  if (!text || typeof text !== 'string' || text.trim().length < 5) {
    return null;
  }

  // CRITICAL: Clean e-commerce text FIRST, before any processing
  const cleaned = cleanEcommerceText(text);
  
  // Heuristic 1: Line-based extraction (BEST for album covers with artist/title on separate lines)
  // Process original text with newlines preserved for line-based extraction
  const originalLines = cleaned
    .split(/\n/)
    .map(line => line.trim())
    .filter(line => {
      // Filter out lines that are clearly e-commerce text
      const lower = line.toLowerCase();
      const ecommerceKeywords = [
        'price', 'shipping', 'returns', 'prime', 'amazon', 'ebay', 
        'advisory', 'explicit', 'parental', 'content', 'rating', 
        'review', 'stock', 'cart', 'buy', 'list price', 'get fast'
      ];
      return !ecommerceKeywords.some(keyword => lower.includes(keyword)) && line.length > 0;
    });
  
  // Try first two clean lines (most common pattern: artist on line 1, title on line 2)
  if (originalLines.length >= 2) {
    const line1 = originalLines[0].trim();
    const line2 = originalLines[1].trim();
    
    // Additional validation: lines shouldn't be too long (likely product descriptions)
    if (line1.length <= 50 && line2.length <= 50 && 
        isValidPart(line1) && isValidPart(line2) &&
        !line1.match(/^\$[\d.,]+/) && !line2.match(/^\$[\d.,]+/)) { // Not a price
      return {
        artist: line1,
        title: line2,
        source: `${source}_lines`,
      };
    }
  }
  
  // If line-based failed, try normalized text
  const normalized = normalizeText(cleaned);
  if (normalized.length < 5) return null;

  // Heuristic 2: Dash/separator patterns ("Artist - Title")
  const dashPatterns = [
    { regex: /^(.+?)\s*[-–—]\s*(.+)$/, reverse: false },
    { regex: /^(.+?)\s*:\s*(.+)$/, reverse: false },
    { regex: /^(.+?)\s+by\s+(.+)$/i, reverse: true },
    { regex: /^(.+?)\s*\/\s*(.+)$/, reverse: false },
    { regex: /^(.+?)\s*\|\s*(.+)$/, reverse: false },
  ];

  for (const { regex, reverse } of dashPatterns) {
    const match = normalized.match(regex);
    if (match) {
      const part1 = match[1].trim();
      const part2 = match[2].trim();
      
      // Additional validation: parts shouldn't contain e-commerce keywords
      const part1Lower = part1.toLowerCase();
      const part2Lower = part2.toLowerCase();
      const hasEcommerce = ['price', 'shipping', 'amazon', 'prime', 'returns', 'advisory', 'explicit']
        .some(keyword => part1Lower.includes(keyword) || part2Lower.includes(keyword));
      
      if (!hasEcommerce && isValidPart(part1) && isValidPart(part2)) {
        return {
          artist: reverse ? part2 : part1,
          title: reverse ? part1 : part2,
          source: `${source}_dash`,
        };
      }
    }
  }

  // Heuristic 3: Handle "TAYLOR'S VERSION 1989" style patterns
  // Pattern: "ARTIST'S VERSION" or "ARTIST VERSION" followed by album title/number
  const versionPattern = /^([A-Z][A-Z\s']+?)\s+(?:'S\s+)?VERSION\s+(.+)$/i;
  const versionMatch = normalized.match(versionPattern);
  if (versionMatch) {
    const artistPart = versionMatch[1].trim();
    const titlePart = versionMatch[2].trim();
    
    // Clean up artist (e.g., "TAYLOR'S" -> "Taylor Swift")
    let cleanArtist = artistPart;
    if (artistPart.toUpperCase().includes("TAYLOR")) {
      cleanArtist = "Taylor Swift";
    } else {
      // Capitalize properly
      cleanArtist = artistPart.split(/\s+/).map(w => 
        w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
      ).join(' ');
    }
    
    // Filter out UI elements from title (e.g., "T now Share")
    const cleanTitle = titlePart
      .split(/\s+/)
      .filter(w => {
        const lower = w.toLowerCase();
        // Filter out short words that look like UI elements
        return !['t', 'now', 'share', 'tap', 'click', 'press'].includes(lower) &&
               w.length > 1;
      })
      .join(' ')
      .trim();
    
    if (isValidPart(cleanArtist) && isValidPart(cleanTitle)) {
      return {
        artist: cleanArtist,
        title: cleanTitle,
        source: `${source}_version_pattern`,
      };
    }
  }
  
  // Heuristic 4: Single line with word count heuristic (only if no e-commerce text detected)
  const words = normalized.split(/\s+/).filter(w => {
    // Filter out UI elements and short noise words
    const lower = w.toLowerCase();
    return !['t', 'now', 'share', 'tap', 'click', 'press'].includes(lower) &&
           w.length > 1;
  });
  
  const hasEcommerceWords = words.some(w => {
    const lower = w.toLowerCase();
    return ['price', 'shipping', 'amazon', 'prime', 'returns', 'advisory', 'explicit', 'list'].includes(lower) ||
           /^\$[\d.,]+$/.test(w); // Price pattern
  });
  
  if (!hasEcommerceWords && words.length >= 3 && words.length <= 10) {
    // Try splitting at different points
    for (let splitPoint = 2; splitPoint <= Math.min(4, words.length - 1); splitPoint++) {
      const artistPart = words.slice(0, splitPoint).join(' ');
      const titlePart = words.slice(splitPoint).join(' ');
      
      if (isValidPart(artistPart) && isValidPart(titlePart)) {
        return {
          artist: artistPart,
          title: titlePart,
          source: `${source}_word_split`,
        };
      }
    }
  }

  return null;
}

/**
 * Clean e-commerce and product page text from OCR
 * Removes prices, shipping info, store names, etc.
 */
function cleanEcommerceText(text) {
  if (!text || typeof text !== 'string') return text;
  
  // Common e-commerce patterns to remove
  const ecommercePatterns = [
    /List Price:\s*\$?[\d.,]+/gi,
    /Get Fast,?\s*Free Shipping.*/gi,
    /FREE Returns.*/gi,
    /Amazon Prime.*/gi,
    /Prime.*/gi,
    /ADVISORY.*/gi,
    /EXPLICIT.*/gi,
    /PARENTAL ADVISORY.*/gi,
    /CONTENT.*/gi,
    /\$[\d.,]+/g, // Any price patterns
    /Price:\s*\$?[\d.,]+/gi,
    /Shipping.*/gi,
    /Returns.*/gi,
    /Add to Cart.*/gi,
    /Buy Now.*/gi,
    /In Stock.*/gi,
    /Out of Stock.*/gi,
    /Rating:.*/gi,
    /Reviews:.*/gi,
  ];
  
  let cleaned = text;
  for (const pattern of ecommercePatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  return cleaned;
}

/**
 * Normalize text for extraction
 */
function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';
  
  // First clean e-commerce text
  const cleaned = cleanEcommerceText(text);
  
  return cleaned
    .trim()
    // Normalize whitespace (but preserve newlines for line-based extraction)
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n') // Collapse multiple newlines to single
    // Remove leading/trailing punctuation
    .replace(/^[^\w\s]+|[^\w\s]+$/g, '')
    .trim();
}

/**
 * Validate that a part (artist or title) is reasonable
 */
function isValidPart(part) {
  if (!part || typeof part !== 'string') return false;
  const trimmed = part.trim();
  
  // Length checks
  if (trimmed.length < 2 || trimmed.length > 100) return false;
  
  // Filter out common false positives
  const falsePositives = ['album', 'vinyl', 'record', 'lp', 'cd', 'the', 'a', 'an', 'by'];
  const lower = trimmed.toLowerCase();
  if (falsePositives.includes(lower)) return false;
  
  // Must have at least one letter
  if (!/[a-zA-Z]/.test(trimmed)) return false;
  
  return true;
}

module.exports = {
  extractArtistTitleFromVision,
};

