/**
 * generateDiscogsQueries Function
 * 
 * Generate comprehensive search query variations for Discogs API
 * Handles punctuation variations (B-52's, Party Mix!, etc.)
 * 
 * This function is used by searchDiscogsEnhanced to create multiple
 * query variations to improve search recall.
 * 
 * @param {string} artist - Artist name
 * @param {string} title - Album title
 * @returns {Array<Object>} Array of query objects with {query, confidence}
 */

function generateDiscogsQueries(artist, title) {
  const queries = [];

  // Base variations
  const cleanArtist = artist.replace(/\s+(and|&|feat\.|featuring)\s+.*$/i, '').trim();
  const cleanTitle = title.replace(/\s*\(.*?\)\s*/g, '').trim();
  const firstWord = artist.split(/\s+/)[0];
  const noThe = artist.replace(/^the\s+/i, '').trim();

  // Punctuation-normalized versions (for fuzzy matching)
  // Remove trailing punctuation: "Party Mix!" -> "Party Mix"
  const titleNoPunct = title.replace(/[!?.]+$/g, '').trim();
  // Handle possessives: "B-52's" -> "B-52s" and "B-52s"
  const artistNoApos = artist.replace(/'s\b/g, 's').replace(/'/g, '');
  const artistWithApos = artist.replace(/\b([a-z0-9-]+)s\b/gi, "$1's"); // Try adding apostrophe

  // Query format variations
  const formats = [
    // Original with punctuation
    `${artist} ${title}`,
    `"${artist}" "${title}"`,
    `${artist} - ${title}`,
    
    // Without trailing punctuation
    `${artist} ${titleNoPunct}`,
    `"${artist}" "${titleNoPunct}"`,
    
    // Without apostrophes
    `${artistNoApos} ${title}`,
    `${artistNoApos} ${titleNoPunct}`,
    
    // Cleaned versions
    `${cleanArtist} ${cleanTitle}`,
    `"${cleanArtist}" "${cleanTitle}"`,
    
    // Field-specific searches
    `artist:"${artist}" title:"${title}"`,
    `artist:"${artist}" title:"${titleNoPunct}"`,
    `artist:"${artistNoApos}" title:"${title}"`,
    `artist:"${cleanArtist}" title:"${cleanTitle}"`,
    
    // Partial searches
    `${firstWord} ${title}`,
    `${firstWord} ${titleNoPunct}`,
    `${noThe} ${title}`,
    `${artist} ${cleanTitle}`,
    
    // Flexible searches
    `${artist} ${title} vinyl`,
    `${artistNoApos} ${titleNoPunct} lp`,
  ];

  for (const query of formats) {
    const trimmed = query.trim();
    if (trimmed && !queries.find(q => q.query === trimmed)) {
      queries.push({
        query: trimmed,
        confidence: 1.0
      });
    }
  }

  return queries;
}

module.exports = { generateDiscogsQueries };

