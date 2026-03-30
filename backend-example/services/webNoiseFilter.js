/**
 * Web Noise Filter
 * 
 * Filters out noisy web entities and page titles that are not album names.
 * 
 * Hard-filters candidates that include:
 * - URLs (http, https, .com, .co.uk, etc.)
 * - E-commerce keywords (wikipedia, amazon, ebay, shipping, $, USD, % off, etc.)
 * - Article/blog patterns
 */

/**
 * Check if text contains web noise (URLs, e-commerce, etc.)
 * 
 * @param {string} text - Text to check
 * @returns {boolean} True if text contains web noise
 */
function isWebNoise(text) {
  if (!text || typeof text !== 'string') return true;

  const lower = text.toLowerCase();

  // URL patterns
  if (lower.includes('http://') || lower.includes('https://')) return true;
  if (lower.includes('www.') || lower.includes('.com') || lower.includes('.co.uk') || 
      lower.includes('.net') || lower.includes('.org') || lower.includes('.edu') || 
      lower.includes('.gov')) return true;

  // E-commerce keywords
  const ecommerceKeywords = [
    'wikipedia',
    'amazon',
    'ebay',
    'shipping',
    'returns',
    'prime',
    'cart',
    'buy now',
    'add to cart',
    'in stock',
    'out of stock',
    'list price',
    'price:',
    '$',
    'usd',
    '% off',
    'discount',
    'sale',
    'free shipping',
    'rating:',
    'reviews:',
    'review',
    'reviews',
  ];

  if (ecommerceKeywords.some(keyword => lower.includes(keyword))) return true;

  // Article/blog patterns
  const articlePatterns = [
    'best album covers',
    'top ',
    'the 10 best',
    'the 20 best',
    'album covers from',
    'cover art from',
    'facebook',
    'twitter',
    'pinterest',
    'instagram',
    'reddit',
    'tumblr',
    'blog',
    'article',
    'lyrics',
    'lyric',
    'ranked',
    'list of',
    'debut album cover',
    'see more',
    'view all',
    'wiki/',
    '(album)',
    '(band)',
    '(song)',
    '(music)',
  ];

  if (articlePatterns.some(pattern => lower.includes(pattern))) return true;

  // File path patterns
  if (lower.includes('/') && (lower.includes('.') || lower.includes('#'))) return true;
  if (lower.includes('media/file:') || lower.includes('file:')) return true;

  // Generic words that are not album names
  const genericWords = ['discogs', 'releases', 'release', 'album', 'albums', 'music'];
  if (genericWords.includes(lower.trim())) return true;

  // Too long (likely a sentence, not an album name)
  if (text.length > 80) return true;

  // Contains pipe character (common in web page titles)
  if (text.includes('|')) return true;

  return false;
}

/**
 * Filter out web noise from candidate list
 * 
 * @param {Array} candidates - Array of candidate objects
 * @returns {Array} Filtered candidates
 */
function filterWebNoise(candidates) {
  return candidates.filter(candidate => {
    const artist = candidate.artist || '';
    const title = candidate.title || '';
    
    // Filter if artist or title contains web noise
    if (isWebNoise(artist) || isWebNoise(title)) {
      return false;
    }
    
    // Filter if combined text contains web noise
    const combined = `${artist} ${title}`.toLowerCase();
    if (isWebNoise(combined)) {
      return false;
    }
    
    return true;
  });
}

/**
 * Filter web entities (used for Vision Web Detection)
 * 
 * @param {Array} entities - Array of web entities
 * @returns {Array} Filtered entities
 */
function filterWebEntities(entities) {
  return entities.filter(entity => {
    const description = entity.description || '';
    return !isWebNoise(description);
  });
}

module.exports = {
  isWebNoise,
  filterWebNoise,
  filterWebEntities,
};

