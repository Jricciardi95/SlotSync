/**
 * Text Normalization Utilities
 * 
 * Normalizes text for identity keys (canonical record matching).
 * Used to prevent duplicates by normalizing artist/title before comparison.
 */

/**
 * Normalize text for identity keys
 * 
 * Performs:
 * - Trim whitespace
 * - Collapse multiple spaces to single space
 * - Normalize unicode punctuation (smart quotes, em dashes, etc.)
 * - Convert to lowercase
 * 
 * @param str - Text to normalize
 * @returns Normalized text for identity comparison
 */
export function normalizeText(str: string | null | undefined): string {
  if (!str || typeof str !== 'string') return '';
  
  return str
    .trim()
    // Collapse multiple whitespace characters to single space
    .replace(/\s+/g, ' ')
    // Normalize unicode punctuation
    .replace(/[""]/g, '"')  // Smart quotes to straight quotes
    .replace(/['']/g, "'")  // Smart apostrophes to straight apostrophes
    .replace(/[–—]/g, '-')  // Em/en dashes to hyphens
    .replace(/…/g, '...')   // Ellipsis to three dots
    .replace(/[^\w\s'-]/g, '') // Remove other special chars (keep word chars, spaces, hyphens, apostrophes)
    .toLowerCase();
}

/**
 * Generate normalized identity key from artist, title, and optional year
 * 
 * @param artist - Artist name
 * @param title - Album title
 * @param year - Optional year
 * @returns Normalized identity key
 */
export function generateIdentityKey(
  artist: string | null | undefined,
  title: string | null | undefined,
  year?: number | null
): string {
  const normalizedArtist = normalizeText(artist);
  const normalizedTitle = normalizeText(title);
  const yearPart = year ? String(year) : '';
  
  return `${normalizedArtist}|${normalizedTitle}${yearPart ? `|${yearPart}` : ''}`;
}


