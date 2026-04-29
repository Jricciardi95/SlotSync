/**
 * Candidate Extractor
 * 
 * DEV-ONLY: This module is for development and testing purposes only.
 * 
 * ⚠️  PRODUCTION NOTE: The backend is the single source of truth for identification.
 * All candidate extraction happens server-side in /api/identify-record.
 * 
 * This frontend extractor is available for:
 * - DevTestScreen testing and debugging
 * - Re-extraction if backend returns raw Vision results (fallback)
 * - Development/testing scenarios
 * 
 * DO NOT use this in production user-facing flows.
 * Always use the backend /api/identify-record endpoint.
 * 
 * Extracts identification candidates from Google Vision API results.
 * Generates 8-15 candidate { artist, album, source, confidence } pairs
 * from Vision results (web entities, OCR text, labels).
 */

import {
  VisionResult,
  IdentificationCandidate,
  CandidateExtractionOptions,
} from './types';
import { normalizeOcrText, splitOcrIntoBlocks } from './visionService';
import { logger } from '../../utils/logger';

/**
 * Hostname patterns to block (non-album content)
 */
const BLOCKED_HOSTNAMES = [
  'wikipedia.org',
  'wikimedia.org',
  'reddit.com',
  'facebook.com',
  'twitter.com',
  'pinterest.com',
  'instagram.com',
  'tumblr.com',
  'blogspot.com',
  'wordpress.com',
  'medium.com',
  'creative-bloq.com',
  'pitchfork.com', // Reviews, not album pages
  'allmusic.com', // Reviews
  'rateyourmusic.com', // Reviews
];

/**
 * Non-album phrase patterns to filter out
 */
const NON_ALBUM_PATTERNS = [
  // Editorial/list content
  /best\s+album\s+covers?/i,
  /top\s+\d+/i,
  /the\s+\d+\s+best/i,
  /album\s+covers?\s+from/i,
  /album\s+covers?\s+i\s+find/i,
  /album\s+art\s+by/i,
  /debut\s+album\s+cover/i,
  /see\s+more/i,
  /view\s+all/i,
  /image\s+result/i,
  /stock\s+(photo|image)/i,
  
  // Review/editorial content
  /review/i,
  /reviews/i,
  /lyrics?/i,
  /ranked/i,
  /list\s+of/i,
  /soundtrack\s+review/i,
  
  // Social media
  /r\/musicsuggestions/i,
  /r\//i,
  
  // Generic words
  /^(discogs|releases?|album|albums|music|reddit)$/i,
];

/**
 * URL/file path patterns to filter out
 */
const URL_PATTERNS = [
  /https?:\/\//i,
  /www\./i,
  /\.(com|net|org|edu|gov|jpg|jpeg|png|gif|webp|php|html|htm)/i,
  /media\/file:/i,
  /file:/i,
  /#\/media\//i,
];

/**
 * Wiki/article patterns
 */
const WIKI_PATTERNS = [
  /wiki\//i,
  /wikipedia/i,
  /\(album\)/i,
  /\(band\)/i,
  /\(song\)/i,
  /\(music\)/i,
];

/**
 * Cleans album title text
 * 
 * Removes common suffixes like "(Remastered)", "(Deluxe Edition)", etc.
 * 
 * @param text - Text to clean
 * @returns Cleaned text
 */
function cleanAlbumTitle(text: string): string {
  if (!text) return '';

  return text
    // Remove parenthetical suffixes
    .replace(/\s*\([^)]*remaster[^)]*\)/gi, '')
    .replace(/\s*\([^)]*deluxe[^)]*\)/gi, '')
    .replace(/\s*\([^)]*edition[^)]*\)/gi, '')
    .replace(/\s*\([^)]*version[^)]*\)/gi, '')
    // Remove trailing punctuation
    .replace(/[!?.]+$/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes text for fuzzy matching
 * 
 * Removes punctuation, handles possessives, etc.
 * 
 * @param text - Text to normalize
 * @returns Normalized text
 */
function normalizeForMatching(text: string): string {
  if (!text) return '';

  return text
    .toLowerCase()
    // Handle possessives: "B-52's" -> "b-52s"
    .replace(/'s\b/g, 's')
    .replace(/'/g, '')
    // Remove trailing punctuation
    .replace(/[!?.]+$/g, '')
    // Normalize hyphens and dashes
    .replace(/[-–—]/g, '-')
    // Remove other punctuation except hyphens
    .replace(/[^\w\s-]/g, '')
    // Normalize whitespace
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Checks if a URL should be blocked
 * 
 * @param url - URL to check
 * @returns True if URL should be blocked
 */
function isBlockedUrl(url: string | undefined): boolean {
  if (!url) return false;

  const lowerUrl = url.toLowerCase();
  
  // Check hostname patterns
  if (BLOCKED_HOSTNAMES.some(host => lowerUrl.includes(host))) {
    return true;
  }

  // Check for URL patterns
  if (URL_PATTERNS.some(pattern => pattern.test(lowerUrl))) {
    return true;
  }

  return false;
}

/**
 * Checks if text looks like a real album title (not editorial content)
 * 
 * @param text - Text to check
 * @returns True if text looks like an album title
 */
function isValidAlbumText(text: string): boolean {
  if (!text || text.length < 2) return false;
  if (text.length > 80) return false; // Too long for album title

  const lower = text.toLowerCase();

  // Check non-album patterns
  if (NON_ALBUM_PATTERNS.some(pattern => pattern.test(lower))) {
    return false;
  }

  // Check wiki patterns
  if (WIKI_PATTERNS.some(pattern => pattern.test(lower))) {
    return false;
  }

  // Check for pipe character (common in web page titles: "Artist | Releases")
  if (text.includes('|')) {
    return false;
  }

  // Check for URL-like patterns (contains / and . or #)
  if (text.includes('/') && (text.includes('.') || text.includes('#'))) {
    return false;
  }

  // Must have at least one letter
  if (!/[a-zA-Z]/.test(text)) {
    return false;
  }

  return true;
}

/**
 * Extracts artist and album from text using multiple heuristics
 * 
 * @param text - Text to extract from
 * @param source - Source identifier
 * @returns Array of candidate objects
 */
function extractFromText(
  text: string,
  source: IdentificationCandidate['source']
): IdentificationCandidate[] {
  const candidates: IdentificationCandidate[] = [];
  const normalized = normalizeOcrText(text);
  
  if (normalized.length < 5) return candidates;

  // Strategy 1: Dash/separator patterns ("Artist - Album")
  const dashPatterns = [
    { regex: /^(.+?)\s*[-–—]\s*(.+)$/, reverse: false },
    { regex: /^(.+?)\s*:\s*(.+)$/, reverse: false },
    { regex: /^(.+?)\s+by\s+(.+)$/i, reverse: true },
    { regex: /^(.+?)\s*\/\s*(.+)$/, reverse: false },
  ];

  for (const { regex, reverse } of dashPatterns) {
    const match = normalized.match(regex);
    if (match) {
      const part1 = match[1].trim();
      const part2 = match[2].trim();
      
      if (isValidAlbumText(part1) && isValidAlbumText(part2)) {
        const artist = reverse ? part2 : part1;
        const album = reverse ? part1 : part2;
        
        candidates.push({
          artist: cleanAlbumTitle(artist),
          album: cleanAlbumTitle(album),
          rawText: text,
          source,
          confidence: 0.85,
        });
      }
    }
  }

  // Strategy 2: Line-based extraction (first two non-empty lines)
  const lines = normalized.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  if (lines.length >= 2) {
    const line1 = lines[0];
    const line2 = lines[1];
    
    if (isValidAlbumText(line1) && isValidAlbumText(line2)) {
      candidates.push({
        artist: cleanAlbumTitle(line1),
        album: cleanAlbumTitle(line2),
        rawText: text,
        source,
        confidence: 0.80,
      });
    }
  }

  // Strategy 3: All-caps detection (common on album covers)
  const allCapsLines = lines.filter(line => {
    const upperCount = (line.match(/[A-Z]/g) || []).length;
    const lowerCount = (line.match(/[a-z]/g) || []).length;
    return upperCount > lowerCount * 2 && line.trim().length > 2;
  });
  
  if (allCapsLines.length >= 2) {
    const artist = allCapsLines[0].trim();
    const title = allCapsLines.slice(1).join(' ').trim();
    
    if (isValidAlbumText(artist) && isValidAlbumText(title)) {
      candidates.push({
        artist: cleanAlbumTitle(artist),
        album: cleanAlbumTitle(title),
        rawText: text,
        source: source === 'ocr' ? 'ocr' : source,
        confidence: 0.90, // High confidence for all-caps (common on covers)
      });
    }
  }

  // Strategy 4: Word boundary splitting (for single-line text)
  if (lines.length === 1 || normalized.split(/\s+/).length >= 3) {
    const words = normalized.split(/\s+/).filter(w => w.length > 0);
    
    if (words.length >= 3 && words.length <= 10) {
      // Try splitting at different points
      for (let splitPoint = 2; splitPoint <= Math.min(4, words.length - 1); splitPoint++) {
        const artistPart = words.slice(0, splitPoint).join(' ');
        const titlePart = words.slice(splitPoint).join(' ');
        
        if (isValidAlbumText(artistPart) && isValidAlbumText(titlePart)) {
          candidates.push({
            artist: cleanAlbumTitle(artistPart),
            album: cleanAlbumTitle(titlePart),
            rawText: text,
            source,
            confidence: 0.70 - (splitPoint - 2) * 0.05, // Lower confidence for later splits
          });
        }
      }
    }
  }

  // Strategy 5: Single album title (no artist)
  // Only if we haven't found artist+album pairs
  if (candidates.length === 0 && isValidAlbumText(normalized)) {
    // Check if it's likely an album title (not just a word)
    if (normalized.split(/\s+/).length >= 2) {
      candidates.push({
        album: cleanAlbumTitle(normalized),
        rawText: text,
        source,
        confidence: 0.60, // Lower confidence without artist
      });
    }
  }

  return candidates;
}

/**
 * Extracts candidates from Vision results
 * 
 * Generates 8-15 candidate { artist, album, source, confidence } pairs
 * from web entities, OCR text, and labels.
 * 
 * @param visionResult - Vision API results
 * @param options - Extraction options
 * @returns Array of identification candidates
 */
export function extractCandidates(
  visionResult: VisionResult,
  options: CandidateExtractionOptions = {}
): IdentificationCandidate[] {
  const {
    maxCandidates = 15,
    minConfidence = 0.3,
    filterNonAlbums = true,
  } = options;

  const candidates: IdentificationCandidate[] = [];
  const seen = new Set<string>();

  // Helper to create unique key
  const key = (c: IdentificationCandidate) => {
    const artist = (c.artist || '').toLowerCase().trim();
    const album = c.album.toLowerCase().trim();
    return `${artist}|${album}`;
  };

  // Strategy 1: Extract from page titles (highest priority)
  // Page titles are often more accurate than web entities
  for (const page of visionResult.pageTitles) {
    if (isBlockedUrl(page.url)) continue;
    
    const pageTitle = page.pageTitle?.trim();
    if (!pageTitle || pageTitle.length < 5) continue;

    const extracted = extractFromText(pageTitle, 'page_title');
    for (const candidate of extracted) {
      const k = key(candidate);
      if (!seen.has(k) && candidate.confidence >= minConfidence) {
        candidates.push(candidate);
        seen.add(k);
      }
    }
  }

  // Strategy 2: Extract from web entities
  // Sort by score (highest first)
  const sortedEntities = [...visionResult.webEntities]
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  for (const entity of sortedEntities) {
    if (entity.score < 0.3) continue; // Skip low-confidence entities
    if (isBlockedUrl(entity.url)) continue;

    const description = entity.description?.trim();
    if (!description || description.length < 5) continue;

    const extracted = extractFromText(description, 'web_entity');
    for (const candidate of extracted) {
      // Weight confidence by entity score
      candidate.confidence *= (entity.score || 0.5);
      candidate.metadata = { entityScore: entity.score };

      const k = key(candidate);
      if (!seen.has(k) && candidate.confidence >= minConfidence) {
        candidates.push(candidate);
        seen.add(k);
      }
    }
  }

  // Strategy 3: Extract from OCR text blocks
  for (let i = 0; i < visionResult.ocrTextBlocks.length; i++) {
    const block = visionResult.ocrTextBlocks[i];
    if (!block || block.trim().length < 5) continue;

    const extracted = extractFromText(block, 'ocr');
    for (const candidate of extracted) {
      candidate.metadata = { lineNumber: i };
      
      const k = key(candidate);
      if (!seen.has(k) && candidate.confidence >= minConfidence) {
        candidates.push(candidate);
        seen.add(k);
      }
    }
  }

  // Strategy 4: Extract from full OCR text (if not already extracted)
  if (visionResult.extractedText && visionResult.extractedText.trim().length > 0) {
    const extracted = extractFromText(visionResult.extractedText, 'ocr');
    for (const candidate of extracted) {
      const k = key(candidate);
      if (!seen.has(k) && candidate.confidence >= minConfidence) {
        candidates.push(candidate);
        seen.add(k);
      }
    }
  }

  // Strategy 5: Use labels as context (low priority)
  // Labels like "Album Cover" can help validate other candidates
  // but we don't extract candidates directly from labels

  // Sort by confidence (highest first)
  candidates.sort((a, b) => b.confidence - a.confidence);

  // Filter out non-album content if requested
  let filtered = candidates;
  if (filterNonAlbums) {
    filtered = candidates.filter(c => {
      // Check artist if present
      if (c.artist && !isValidAlbumText(c.artist)) {
        return false;
      }
      // Check album
      if (!isValidAlbumText(c.album)) {
        return false;
      }
      return true;
    });
  }

  // Limit to maxCandidates
  const limited = filtered.slice(0, maxCandidates);

  logger.debug(`[CandidateExtractor] Extracted ${limited.length} candidates from Vision results`);
  logger.debug(`[CandidateExtractor] Sources: ${[...new Set(limited.map(c => c.source))].join(', ')}`);

  return limited;
}

