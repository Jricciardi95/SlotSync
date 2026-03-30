/**
 * Similarity Utilities
 * 
 * String similarity and normalization functions used across the identification pipeline.
 * Extracted to avoid circular dependencies.
 */

/**
 * Calculate similarity score between two strings (0-1)
 * Uses Levenshtein distance and exact/substring matching
 */
function similarityScore(str1, str2) {
  if (!str1 || !str2) return 0;
  
  // Try exact match first
  if (str1.toLowerCase() === str2.toLowerCase()) return 1.0;
  
  // Normalize strings
  const s1 = normalizeForSearch(str1);
  const s2 = normalizeForSearch(str2);
  
  // Substring match (one contains the other)
  if (s1.includes(s2) || s2.includes(s1)) {
    const longer = s1.length > s2.length ? s1 : s2;
    const shorter = s1.length > s2.length ? s2 : s1;
    return 0.7 + (shorter.length / longer.length) * 0.2; // 0.7-0.9 range
  }
  
  // Calculate Levenshtein distance
  const distance = levenshteinDistance(s1, s2);
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  
  const similarity = 1 - (distance / maxLen);
  return Math.max(0, similarity);
}

/**
 * Normalize text for search comparison
 * Matches the implementation from server-hybrid.js for consistency
 */
function normalizeForSearch(text) {
  if (!text || typeof text !== 'string') return '';
  
  return text
    .toLowerCase()
    // Remove apostrophes and handle possessives: "B-52's" -> "b-52s"
    .replace(/'s\b/g, 's')
    .replace(/'/g, '')
    // Remove trailing punctuation: "Party Mix!" -> "party mix"
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
 * Calculate Levenshtein distance for fuzzy matching
 */
function levenshteinDistance(str1, str2) {
  const m = str1.length;
  const n = str2.length;
  const dp = Array(m + 1).fill(null).map(() => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (str1[i - 1] === str2[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + 1
        );
      }
    }
  }

  return dp[m][n];
}

module.exports = {
  similarityScore,
  normalizeForSearch,
  levenshteinDistance,
};

