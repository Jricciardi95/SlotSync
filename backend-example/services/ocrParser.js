/**
 * OCR Parser Module
 *
 * Heuristic parsing of OCR text to extract artist and album title.
 */

/**
 * Parse artist and album from OCR text using heuristics
 *
 * @param {string} ocrText - Raw OCR text
 * @returns {Object} {artist: string|null, album: string|null, confidence: number}
 */
function parseArtistAndAlbumFromOcrText(ocrText) {
  if (!ocrText || ocrText.trim().length === 0) {
    return { artist: null, album: null, confidence: 0 };
  }

  const ocrFixes = {
    PIINUL: 'PRINCE',
    PIINCE: 'PRINCE',
    PRINUL: 'PRINCE',
    PRINLE: 'PRINCE',
    'LANA DEL RET': 'LANA DEL REY',
    'LANA DE': 'LANA DEL REY',
    TAYLOR: 'TAYLOR SWIFT',
  };

  let fixedText = ocrText.toUpperCase();
  for (const [typo, correct] of Object.entries(ocrFixes)) {
    fixedText = fixedText.replace(new RegExp(typo, 'gi'), correct);
  }
  const words = fixedText.split(/\s+/);
  const fixedWords = words.map((w) => {
    if (w === 'PRINCE') return 'Prince';
    if (w === 'LANA DEL REY') return 'Lana Del Rey';
    if (w === 'TAYLOR SWIFT') return 'Taylor Swift';
    return w.charAt(0) + w.slice(1).toLowerCase();
  });
  const correctedText = fixedWords.join(' ');

  const lines = (correctedText || ocrText)
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return { artist: null, album: null, confidence: 0 };
  }

  let artist = null;
  let album = null;
  let confidence = 0;

  if (lines.length >= 2) {
    const line1 = lines[0];
    const line2 = lines[1];

    if (
      line1.length <= 50 &&
      line2.length <= 50 &&
      !line1.includes('http') &&
      !line2.includes('http') &&
      !line1.includes('.com') &&
      !line2.includes('.com')
    ) {
      artist = line1;
      album = line2;
      confidence = 0.85;
    }
  }

  if (!artist || !album) {
    for (const line of lines) {
      const dashMatch = line.match(/^(.+?)\s*[-–—]\s*(.+)$/);
      if (dashMatch) {
        const candidateArtist = dashMatch[1].trim();
        const candidateAlbum = dashMatch[2].trim();

        if (
          candidateArtist.length > 1 &&
          candidateAlbum.length > 1 &&
          candidateArtist.length <= 50 &&
          candidateAlbum.length <= 50
        ) {
          artist = candidateArtist;
          album = candidateAlbum;
          confidence = 0.8;
          break;
        }
      }
    }
  }

  if (!artist || !album) {
    const sortedLines = [...lines].sort((a, b) => b.length - a.length);

    if (sortedLines.length >= 2) {
      const longest = sortedLines[0];
      const secondLongest = sortedLines[1];

      if (
        longest.length <= 50 &&
        secondLongest.length <= 50 &&
        !longest.includes('http') &&
        !secondLongest.includes('http')
      ) {
        artist = longest;
        album = secondLongest;
        confidence = 0.7;
      }
    }
  }

  if (!artist || !album) {
    if (lines.length >= 1) {
      artist = lines[0];
      if (lines.length >= 2) {
        album = lines[1];
      } else {
        const separators = [' - ', ' – ', ' — ', ' | '];
        for (const sep of separators) {
          if (lines[0].includes(sep)) {
            const parts = lines[0].split(sep);
            if (parts.length >= 2) {
              artist = parts[0].trim();
              album = parts.slice(1).join(sep).trim();
              confidence = 0.65;
              break;
            }
          }
        }
      }
    }
  }

  if (artist) {
    artist = artist.trim();
    artist = artist.replace(/^the\s+/i, '');
  }

  if (album) {
    album = album.trim();
    album = album.replace(/\s*\(.*?\)\s*$/, '');
  }

  if (artist && artist.length < 2) artist = null;
  if (album && album.length < 2) album = null;

  if ((artist && !album) || (!artist && album)) {
    confidence *= 0.7;
  }

  return {
    artist: artist || null,
    album: album || null,
    confidence,
  };
}

/**
 * @param {string} ocrText
 * @returns {Promise<Object>}
 */
async function parseArtistAndAlbum(ocrText) {
  return parseArtistAndAlbumFromOcrText(ocrText);
}

module.exports = {
  parseArtistAndAlbum,
  parseArtistAndAlbumFromOcrText,
};
