/**
 * Text Processing Utilities
 * 
 * Pure utility functions for text normalization, cleaning, and candidate extraction.
 * These functions are extracted from server-hybrid.js to enable unit testing.
 */

/**
 * Clean e-commerce and product page text from OCR
 * Removes prices, shipping info, store names, UI elements, etc.
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
  
  // CRITICAL: Remove UI elements and short noise words (e.g., "T now Share")
  // These are often OCR artifacts from app UI elements on the screen
  const uiElementPatterns = [
    /\b(T|t)\s+now\s+Share\b/gi, // "T now Share" pattern
    /\b(T|t)\s+now\b/gi, // "T now" pattern
    /\bnow\s+Share\b/gi, // "now Share" pattern
    /\b(Tap|tap|Click|click|Press|press)\s+(to|now|here|this)\b/gi, // UI action words
    /\b(Share|share)\s+(this|now|album)\b/gi, // Share button text
  ];
  
  for (const pattern of uiElementPatterns) {
    cleaned = cleaned.replace(pattern, '');
  }
  
  // Remove standalone short noise words that are likely UI elements
  // Preserve newlines by splitting on spaces only (not newlines)
  const lines = cleaned.split('\n');
  const filteredLines = lines.map(line => {
    const words = line.split(/\s+/);
    const filteredWords = words.filter(w => {
      const lower = w.toLowerCase().trim();
      // Filter out single-letter words and common UI words
      if (w.length <= 1) return false;
      if (['t', 'now', 'share', 'tap', 'click', 'press', 'this', 'here'].includes(lower)) {
        return false;
      }
      return true;
    });
    return filteredWords.join(' ').trim();
  });
  
  return filteredLines.join('\n').trim();
}

/**
 * Advanced text normalization and cleaning
 * Removes OCR noise, normalizes whitespace, fixes common mistakes
 * Handles punctuation variations (B-52's vs B-52s, Party Mix! vs Party Mix)
 * CRITICAL: Also removes e-commerce text (prices, shipping info, etc.)
 */
function normalizeText(text) {
  if (!text || typeof text !== 'string') return '';

  // CRITICAL: Clean e-commerce text FIRST
  const cleaned = cleanEcommerceText(text);

  return cleaned
    // Remove control characters and special unicode (but preserve newlines)
    .replace(/[\x00-\x1F\x7F-\x9F]/g, (m) => m === '\n' ? '\n' : ' ')
    // Fix common OCR mistakes
    .replace(/[|]/g, 'I')
    .replace(/[0O]/g, (m, offset, str) => {
      // Context-aware: if surrounded by letters, likely 'O', else '0'
      const prev = str[offset - 1];
      const next = str[offset + 1];
      if (/[a-zA-Z]/.test(prev) && /[a-zA-Z]/.test(next)) return 'O';
      return m;
    })
    // Normalize whitespace (preserve newlines for line-based extraction)
    .replace(/[ \t]+/g, ' ') // Collapse spaces and tabs (but not newlines)
    .replace(/\n\s*\n/g, '\n') // Collapse multiple newlines to single
    // Remove leading/trailing punctuation that's likely noise
    .replace(/^[^\w\s]+|[^\w\s]+$/g, '')
    // Collapse multiple spaces (but preserve newlines)
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

/**
 * Clean noise tokens from text
 * Removes bracket fragments, noise words, single letters, etc.
 */
function cleanNoiseTokens(text) {
  if (!text || typeof text !== 'string') return text;
  
  // Remove bracket fragments like [ ], ( ), etc.
  let cleaned = text.replace(/\[[^\]]*\]/g, '').replace(/\([^)]*\)/g, '');
  
  // Remove common noise tokens (case-insensitive)
  // Handle multi-word tokens first (before splitting) - use word boundaries
  const multiWordNoiseTokens = [
    'side a', 'side b', 'side 1', 'side 2',
  ];
  
  for (const token of multiWordNoiseTokens) {
    // Match "Side A", "side a", "SIDE A", etc. with word boundaries
    const regex = new RegExp(`\\b${token.split(/\s+/).join('\\s+')}\\b`, 'gi');
    cleaned = cleaned.replace(regex, ' ');
  }
  
  // Single-word noise tokens
  const noiseTokens = [
    'tv', 'google', 'youtube', 'amazon', 'facebook', 'twitter', 'instagram',
    'ebay', 'discogs', 'reddit', 'pinterest', 'tumblr', 'wikipedia',
  ];
  
  // Split into words and filter out noise tokens
  // CRITICAL: Preserve numbers (they might be track numbers like "1", "2", etc.)
  const words = cleaned.split(/\s+/).filter(word => {
    const wordLower = word.toLowerCase().trim();
    if (!wordLower) return false; // Remove empty strings
    // Preserve numbers (track numbers like "1", "2", etc.)
    if (/^\d+$/.test(word)) {
      return true;
    }
    // Remove single letters (except 'a' and 'i' which might be valid)
    if (word.length === 1 && wordLower !== 'a' && wordLower !== 'i') {
      return false;
    }
    // Remove noise tokens
    if (noiseTokens.includes(wordLower)) {
      return false;
    }
    return true;
  });
  
  return words.join(' ').trim();
}

/**
 * Generate unique key for candidate
 */
function key(candidate) {
  return `${candidate.artist.toLowerCase()}|${candidate.title.toLowerCase()}`;
}

/**
 * Validate candidate
 */
function isValidCandidate(candidate) {
  if (!candidate.artist || !candidate.title) return false;
  
  // Clean noise tokens from artist and title
  const cleanedArtist = cleanNoiseTokens(candidate.artist);
  const cleanedTitle = cleanNoiseTokens(candidate.title);
  
  // After cleaning, check if we still have valid content
  if (!cleanedArtist || !cleanedTitle) return false;
  if (cleanedArtist.length < 2 || cleanedArtist.length > 100) return false;
  if (cleanedTitle.length < 2 || cleanedTitle.length > 100) return false;
  
  // Filter out common false positives
  const falsePositives = ['album', 'vinyl', 'record', 'lp', 'cd', 'the', 'a', 'an'];
  if (falsePositives.includes(cleanedArtist.toLowerCase()) ||
      falsePositives.includes(cleanedTitle.toLowerCase())) {
    return false;
  }
  
  // CRITICAL: Filter out e-commerce text patterns
  const artistLower = cleanedArtist.toLowerCase();
  const titleLower = cleanedTitle.toLowerCase();
  const ecommerceKeywords = [
    'price', 'shipping', 'returns', 'prime', 'amazon', 'ebay', 
    'advisory', 'explicit', 'parental', 'content', 'rating', 
    'review', 'stock', 'cart', 'buy', 'list price', 'get fast',
    'free shipping', 'add to', 'in stock', 'out of stock', '$'
  ];
  
  // Reject if artist or title contains e-commerce keywords
  if (ecommerceKeywords.some(keyword => artistLower.includes(keyword) || titleLower.includes(keyword))) {
    return false;
  }
  
  // Reject if title starts with price pattern
  if (cleanedTitle.match(/^\$[\d.,]+/)) {
    return false;
  }
  
  // Update candidate with cleaned values (for downstream use)
  candidate.artist = cleanedArtist;
  candidate.title = cleanedTitle;
  
  return true;
}

/**
 * Extract multiple artist/title candidates from text
 * Returns array of {artist, title, confidence, source} objects
 * 
 * NOTE: This is a simplified version focusing on the core extraction logic.
 * The full version in server-hybrid.js includes many edge cases and strategies.
 */
function extractCandidates(text) {
  if (!text || text.trim().length === 0) return [];

  // CRITICAL: Clean e-commerce text FIRST, before normalization
  const cleaned = cleanEcommerceText(text);
  const candidates = [];
  const seen = new Set();
  
  // Strategy 1: Newline-separated (most common for album covers)
  // Process cleaned text with newlines preserved
  const originalLines = cleaned
    .split(/\n/)
    .map(line => line.trim())
    .filter(line => {
      // Filter out lines that are clearly e-commerce text
      const lower = line.toLowerCase();
      const ecommerceKeywords = [
        'price', 'shipping', 'returns', 'prime', 'amazon', 'ebay', 
        'advisory', 'explicit', 'parental', 'content', 'rating', 
        'review', 'stock', 'cart', 'buy', 'list price', 'get fast',
        'free shipping', 'add to', 'in stock', 'out of stock'
      ];
      return !ecommerceKeywords.some(keyword => lower.includes(keyword)) && 
             !line.match(/^\$[\d.,]+/) && // Not a price
             line.length > 0;
    });
  
  if (originalLines.length >= 2) {
    // Try first two clean lines (most common: artist on first line, title on second)
    const line1 = originalLines[0].trim();
    const line2 = originalLines[1].trim();
    
    // Additional validation: lines shouldn't be too long (likely product descriptions)
    if (line1.length <= 50 && line2.length <= 50) {
      const candidate1 = {
        artist: line1,
        title: line2,
        confidence: 0.9,
        source: 'newline_split'
      };
      if (isValidCandidate(candidate1) && !seen.has(key(candidate1))) {
        candidates.push(candidate1);
        seen.add(key(candidate1));
      }
    }
  }
  
  // Now normalize for other strategies
  const normalized = normalizeText(cleaned);
  
  // Strategy 1.5: Try normalized lines if original didn't work
  const lines = normalized.split('\n').filter(line => line.trim().length > 0);
  if (lines.length >= 2 && candidates.length === 0) {
    // Try first two lines (most common: artist on first line, title on second)
    const candidate1 = {
      artist: lines[0].trim(),
      title: lines.slice(1, 3).join(' ').trim(),
      confidence: 0.85,
      source: 'newline_split_normalized'
    };
    if (isValidCandidate(candidate1) && !seen.has(key(candidate1))) {
      candidates.push(candidate1);
      seen.add(key(candidate1));
    }

    // Try reversed (title first, artist second - less common but possible)
    const candidate2 = {
      artist: lines[1].trim(),
      title: lines[0].trim(),
      confidence: 0.7,
      source: 'newline_split_reversed'
    };
    if (isValidCandidate(candidate2) && !seen.has(key(candidate2))) {
      candidates.push(candidate2);
      seen.add(key(candidate2));
    }
  }

  // Strategy 2: Dash/separator patterns
  const patterns = [
    { regex: /^(.+?)\s*[-–—]\s*(.+)$/, confidence: 0.85, name: 'dash' },
    { regex: /^(.+?)\s*:\s*(.+)$/, confidence: 0.8, name: 'colon' },
    { regex: /^(.+?)\s+by\s+(.+)$/i, confidence: 0.75, name: 'by', reverse: true },
    { regex: /^(.+?)\s*\/\s*(.+)$/, confidence: 0.7, name: 'slash' },
  ];

  for (const { regex, confidence, name, reverse } of patterns) {
    const match = normalized.match(regex);
    if (match) {
      const part1 = match[1].trim();
      const part2 = match[2].trim();
      const candidate = {
        artist: reverse ? part2 : part1,
        title: reverse ? part1 : part2,
        confidence,
        source: `pattern_${name}`
      };
      if (isValidCandidate(candidate) && !seen.has(key(candidate))) {
        candidates.push(candidate);
        seen.add(key(candidate));
      }
    }
  }

  // Strategy 3: All caps detection (common on album covers)
  const allCapsLines = normalized.split('\n').filter(line => {
    const upperCount = (line.match(/[A-Z]/g) || []).length;
    const lowerCount = (line.match(/[a-z]/g) || []).length;
    return upperCount > lowerCount && line.trim().length > 2;
  });
  
  if (allCapsLines.length >= 2) {
    // Two lines of uppercase text - likely artist and title
    const candidate = {
      artist: allCapsLines[0].trim(),
      title: allCapsLines.slice(1).join(' ').trim(),
      confidence: 0.95,
      source: 'all_caps_multiline'
    };
    if (isValidCandidate(candidate) && !seen.has(key(candidate))) {
      candidates.push(candidate);
      seen.add(key(candidate));
    }
  }
  
  // Sort by confidence (highest first)
  candidates.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  
  return candidates;
}

module.exports = {
  normalizeText,
  cleanEcommerceText,
  cleanNoiseTokens,
  extractCandidates,
  // Export helpers for testing
  isValidCandidate,
  key,
};

