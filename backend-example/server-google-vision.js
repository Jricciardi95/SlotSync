/**
 * SlotSync Backend API - Production Implementation with Google Vision API
 * 
 * This server integrates with Google Cloud Vision API for image recognition
 * and MusicBrainz API for metadata lookup.
 * 
 * Prerequisites:
 * 1. Google Cloud Project with Vision API enabled
 * 2. Service account credentials JSON file
 * 3. npm install @google-cloud/vision axios
 * 
 * To run:
 * 1. Set GOOGLE_APPLICATION_CREDENTIALS environment variable
 * 2. npm install @google-cloud/vision axios
 * 3. node server-google-vision.js
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const axios = require('axios');
const { ImageAnnotatorClient } = require('@google-cloud/vision');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for mobile app
app.use(cors());
app.use(express.json());

// Initialize Google Vision client
// Credentials can be provided via:
// 1. GOOGLE_APPLICATION_CREDENTIALS environment variable (path to JSON file)
// 2. Or credentials object passed directly
let visionClient;
try {
  visionClient = new ImageAnnotatorClient();
  console.log('✅ Google Vision API client initialized');
} catch (error) {
  console.error('❌ Failed to initialize Google Vision client:', error.message);
  console.error('Make sure GOOGLE_APPLICATION_CREDENTIALS is set or credentials are configured');
  process.exit(1);
}

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

/**
 * Extract text from image using Google Vision OCR
 */
async function extractTextFromImage(imageBuffer) {
  try {
    const [result] = await visionClient.textDetection({
      image: { content: imageBuffer },
    });

    const detections = result.textAnnotations;
    if (!detections || detections.length === 0) {
      return null;
    }

    // First detection contains all text, others are individual words
    const fullText = detections[0].description || '';
    return fullText;
  } catch (error) {
    console.error('Google Vision OCR error:', error);
    throw error;
  }
}

/**
 * Search MusicBrainz for release information
 */
async function searchMusicBrainz(artist, title) {
  try {
    const query = `artist:"${artist}" AND release:"${title}"`;
    const response = await axios.get('https://musicbrainz.org/ws/2/release/', {
      params: {
        query: query,
        fmt: 'json',
        limit: 10,
      },
      headers: {
        'User-Agent': 'SlotSync/1.0.0 (contact@slotsync.app)',
        Accept: 'application/json',
      },
    });

    const releases = response.data.releases || [];
    if (releases.length === 0) {
      return null;
    }

    // Get cover art from Cover Art Archive
    const getCoverArt = async (releaseId) => {
      try {
        const coverResponse = await axios.get(
          `https://coverartarchive.org/release/${releaseId}/front`,
          { maxRedirects: 0, validateStatus: (status) => status < 400 }
        );
        return coverResponse.request.res.responseUrl || null;
      } catch {
        return null;
      }
    };

    // Process primary release
    const primary = releases[0];
    const primaryId = primary.id;
    const coverArt = await getCoverArt(primaryId);

    const artistName =
      primary['artist-credit']?.[0]?.artist?.name ||
      primary['artist-credit']?.[0]?.name ||
      artist;

    const bestMatch = {
      artist: artistName,
      title: primary.title,
      year: primary.date ? new Date(primary.date).getFullYear() : null,
      coverImageRemoteUrl: coverArt,
    };

    // Process alternates (limit to 5)
    const alternates = [];
    for (let i = 1; i < Math.min(releases.length, 6); i++) {
      const alt = releases[i];
      const altId = alt.id;
      const altCoverArt = await getCoverArt(altId);
      const altArtistName =
        alt['artist-credit']?.[0]?.artist?.name ||
        alt['artist-credit']?.[0]?.name ||
        artist;

      alternates.push({
        artist: altArtistName,
        title: alt.title,
        year: alt.date ? new Date(alt.date).getFullYear() : null,
        coverImageRemoteUrl: altCoverArt,
      });
    }

    return {
      bestMatch,
      alternates,
    };
  } catch (error) {
    console.error('MusicBrainz search error:', error.message);
    return null;
  }
}

/**
 * Parse text to extract artist and album title
 * This is a simple parser - you may want to improve this with NLP
 */
function parseAlbumInfo(text) {
  if (!text) return null;

  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) return null;

  // Try to find artist and title patterns
  // Common patterns:
  // - "Artist Name\nAlbum Title"
  // - "ALBUM TITLE\nArtist Name"
  // - Text containing "by" or " - "

  let artist = null;
  let title = null;

  // Look for "by" pattern: "Title by Artist"
  const byPattern = /(.+?)\s+by\s+(.+)/i;
  const byMatch = text.match(byPattern);
  if (byMatch) {
    title = byMatch[1].trim();
    artist = byMatch[2].trim();
  }

  // Look for dash pattern: "Artist - Title" or "Title - Artist"
  if (!artist || !title) {
    const dashPattern = /(.+?)\s+-\s+(.+)/;
    const dashMatch = text.match(dashPattern);
    if (dashMatch) {
      // First part could be artist or title
      const part1 = dashMatch[1].trim();
      const part2 = dashMatch[2].trim();
      // Heuristic: shorter part is usually title
      if (part1.length < part2.length) {
        title = part1;
        artist = part2;
      } else {
        artist = part1;
        title = part2;
      }
    }
  }

  // If no pattern found, use first two lines
  if (!artist || !title) {
    if (lines.length >= 2) {
      // Assume first line is artist, second is title (common on album covers)
      artist = lines[0];
      title = lines[1];
    } else if (lines.length === 1) {
      // Single line - try to split
      const parts = lines[0].split(/\s+/);
      if (parts.length >= 2) {
        const mid = Math.floor(parts.length / 2);
        artist = parts.slice(0, mid).join(' ');
        title = parts.slice(mid).join(' ');
      } else {
        title = lines[0];
      }
    }
  }

  return {
    artist: artist || 'Unknown Artist',
    title: title || 'Unknown Album',
  };
}

/**
 * POST /api/identify-record
 * 
 * Identifies a vinyl record from an album cover image using:
 * 1. Google Vision API for OCR (text extraction)
 * 2. Text parsing to extract artist/title
 * 3. MusicBrainz API for metadata lookup
 */
app.post('/api/identify-record', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No image file provided',
      });
    }

    console.log(
      `[API] Processing image: ${req.file.originalname}, ${req.file.size} bytes`
    );

    const imageBuffer = req.file.buffer;

    // Step 1: Extract text from image using Google Vision OCR
    console.log('[API] Extracting text from image...');
    const extractedText = await extractTextFromImage(imageBuffer);

    if (!extractedText || extractedText.trim().length === 0) {
      return res.status(400).json({
        error: 'Could not extract text from image. Please ensure the album cover is clear and readable.',
      });
    }

    console.log('[API] Extracted text:', extractedText.substring(0, 100) + '...');

    // Step 2: Parse text to extract artist and title
    console.log('[API] Parsing album information...');
    const albumInfo = parseAlbumInfo(extractedText);

    if (!albumInfo) {
      return res.status(400).json({
        error: 'Could not parse album information from image text.',
      });
    }

    console.log('[API] Parsed:', albumInfo);

    // Step 3: Search MusicBrainz for metadata
    console.log('[API] Searching MusicBrainz...');
    const musicBrainzResult = await searchMusicBrainz(
      albumInfo.artist,
      albumInfo.title
    );

    // Step 4: Format response
    if (musicBrainzResult) {
      // Use MusicBrainz data if available
      const response = {
        confidence: 0.85, // High confidence if MusicBrainz found matches
        bestMatch: musicBrainzResult.bestMatch,
        alternates: musicBrainzResult.alternates,
      };

      console.log('[API] Success! Found match:', response.bestMatch);
      return res.json(response);
    } else {
      // Fallback to parsed text if MusicBrainz didn't find matches
      const response = {
        confidence: 0.6, // Lower confidence for parsed-only results
        bestMatch: {
          artist: albumInfo.artist,
          title: albumInfo.title,
          year: null,
          coverImageRemoteUrl: null,
        },
        alternates: [],
      };

      console.log('[API] Partial match (no MusicBrainz results):', response.bestMatch);
      return res.json(response);
    }
  } catch (error) {
    console.error('[API] Error identifying record:', error);

    // Handle Google Vision API errors
    if (error.code === 7 || error.message?.includes('PERMISSION_DENIED')) {
      return res.status(500).json({
        error: 'Google Vision API authentication failed. Check your credentials.',
      });
    }

    if (error.code === 8 || error.message?.includes('RESOURCE_EXHAUSTED')) {
      return res.status(500).json({
        error: 'Google Vision API quota exceeded. Please check your usage limits.',
      });
    }

    return res.status(500).json({
      error: 'Failed to identify record',
      message: error.message,
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      googleVision: visionClient ? 'configured' : 'not configured',
    },
  });
});

/**
 * API info endpoint
 */
app.get('/api', (req, res) => {
  res.json({
    name: 'SlotSync API',
    version: '1.0.0',
    features: ['Google Vision OCR', 'MusicBrainz Integration'],
    endpoints: {
      identifyRecord: {
        method: 'POST',
        path: '/api/identify-record',
        description: 'Identify a vinyl record from album cover image',
        contentType: 'multipart/form-data',
        field: 'image',
      },
    },
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 SlotSync API Server (Google Vision) running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📍 API info: http://localhost:${PORT}/api`);
  console.log(`📍 Identify endpoint: http://localhost:${PORT}/api/identify-record\n`);
  console.log('✅ Google Vision API integration enabled\n');
});

