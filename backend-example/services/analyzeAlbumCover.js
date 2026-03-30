/**
 * Vinyl Vision - GPT-4o Album Cover Analysis
 * 
 * Uses OpenAI's GPT-4o Vision API to analyze album covers and extract
 * comprehensive metadata including tracklist, genre, label, etc.
 * 
 * This provides detailed metadata analysis beyond basic identification.
 */

const OpenAI = require('openai');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const config = require('../config');
const OPENAI_API_KEY = config.openai.apiKey;
const GPT_MODEL = config.openai.model;
const ENABLE_VINYL_VISION = config.openai.enableVinylVision;
const DB_PATH = path.join(__dirname, '..', 'identified_records.db');

/**
 * Get database connection for caching
 */
function getDatabase() {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(DB_PATH, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve(db);
      }
    });
  });
}

/**
 * Generate a simple hash for an image (for caching)
 */
function getImageHash(imageBase64) {
  return crypto.createHash('md5').update(imageBase64).digest('hex');
}

// Initialize OpenAI client
let openaiClient = null;
if (OPENAI_API_KEY) {
  try {
    openaiClient = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
    console.log('[Vinyl Vision] ✅ OpenAI client initialized');
  } catch (error) {
    console.error('[Vinyl Vision] ❌ Failed to initialize OpenAI client:', error.message);
  }
}

/**
 * Analyze album cover using GPT-4o Vision
 * 
 * @param {Object} params - Analysis parameters
 * @param {string} params.imageBase64 - Base64 encoded image
 * @param {string} [params.artist] - Optional artist name (for context)
 * @param {string} [params.albumTitle] - Optional album title (for context)
 * @returns {Promise<Object|null>} Analysis result with metadata
 */
async function analyzeAlbumCover({ imageBase64, artist, albumTitle }) {
  if (!ENABLE_VINYL_VISION || !OPENAI_API_KEY) {
    console.log('[Vinyl Vision] ⚠️  Not enabled or API key missing');
    return null;
  }

  if (!openaiClient) {
    console.warn('[Vinyl Vision] ⚠️  OpenAI client not initialized');
    return null;
  }

  // Optional: Hash image to detect perfect matches
  const imageHash = getImageHash(imageBase64);

  // Step 1: Try cache lookup (if we have artist and album title)
  if (artist && albumTitle) {
    try {
      const db = await getDatabase();
      const cached = await new Promise((resolve, reject) => {
        db.get(
          `SELECT * FROM vinyl_metadata WHERE artist = ? AND albumTitle = ?`,
          [artist, albumTitle],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });
      // Don't close - reuse connection

      if (cached) {
        console.log('[Vinyl Vision] ✅ Found cached metadata');
        return {
          albumTitle: cached.albumTitle,
          artist: cached.artist,
          releaseYear: cached.releaseYear,
          tracklist: cached.tracklist ? JSON.parse(cached.tracklist) : [],
          genre: cached.genre,
          label: cached.label,
          confidence: cached.confidence,
          notes: cached.notes,
          source: 'cache',
        };
      }
    } catch (cacheError) {
      console.warn('[Vinyl Vision] ⚠️  Cache lookup failed:', cacheError.message);
      // Continue to GPT call
    }
  }

  // Step 2: GPT call
  try {
    console.log('[Vinyl Vision] 🧠 Starting album cover analysis...');
    
    const messages = [
      {
        role: "system",
        content: `You are Vinyl Vision, a music metadata analyst. You receive album cover images and optional artist/album input. Your job is to return the most accurate metadata.`,
      },
      {
        role: "user",
        content: [
          {
            type: "text",
            text: `
You are given an album cover and optional manual info.

Return JSON in this format:

{
  "albumTitle": "",
  "artist": "",
  "releaseYear": "",
  "tracklist": [],
  "genre": "",
  "label": "",
  "confidence": "High | Medium | Low",
  "notes": ""
}

Manual Input:
Artist: ${artist || "N/A"}
Album: ${albumTitle || "N/A"}

Now analyze the image.
            `.trim(),
          },
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${imageBase64}`,
            },
          },
        ],
      },
    ];

    const response = await openaiClient.chat.completions.create({
      model: GPT_MODEL,
      temperature: 0.4,
      messages: messages,
      max_tokens: 2000,
    });

    const content = response.choices?.[0]?.message?.content;

    if (!content) {
      console.warn('[Vinyl Vision] ⚠️  No content in response');
      return null;
    }

    // Extract JSON from response (may have markdown code blocks)
    let jsonString = content.trim();
    
    // Remove markdown code blocks if present
    if (jsonString.startsWith('```')) {
      const lines = jsonString.split('\n');
      lines.shift(); // Remove first line (```json or ```)
      if (lines[lines.length - 1].trim() === '```') {
        lines.pop(); // Remove last line (```)
      }
      jsonString = lines.join('\n');
    }

    // Find JSON object in response
    const jsonStart = jsonString.indexOf('{');
    if (jsonStart === -1) {
      console.warn('[Vinyl Vision] ⚠️  No JSON found in response');
      return null;
    }

    const json = jsonString.substring(jsonStart);
    const result = JSON.parse(json);

    console.log('[Vinyl Vision] ✅ Analysis complete:', {
      artist: result.artist,
      albumTitle: result.albumTitle,
      confidence: result.confidence,
      tracklistCount: result.tracklist?.length || 0,
    });

    // Step 3: Save to cache
    if (result.artist && result.albumTitle) {
      try {
        const cacheDb = await getDatabase();
        await new Promise((resolve, reject) => {
          cacheDb.run(
            `INSERT OR REPLACE INTO vinyl_metadata 
             (artist, albumTitle, releaseYear, tracklist, genre, label, confidence, notes, imageHash) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              result.artist,
              result.albumTitle,
              result.releaseYear || null,
              JSON.stringify(result.tracklist || []),
              result.genre || null,
              result.label || null,
              result.confidence || null,
              result.notes || null,
              imageHash,
            ],
            (err) => {
              if (err) reject(err);
              else resolve();
            }
          );
        });
        // Don't close - reuse connection
        console.log('[Vinyl Vision] ✅ Metadata cached');
      } catch (cacheError) {
        console.warn('[Vinyl Vision] ⚠️  Cache save failed:', cacheError.message);
        // Don't fail the request if caching fails
      }
    }

    return {
      ...result,
      source: 'gpt',
    };
  } catch (error) {
    console.error('[Vinyl Vision] ❌ Analysis failed:', error.message);
    return null;
  }
}

/**
 * Convert image buffer to base64
 * 
 * @param {Buffer} imageBuffer - Image buffer
 * @returns {string} Base64 encoded image
 */
function imageBufferToBase64(imageBuffer) {
  return imageBuffer.toString('base64');
}

module.exports = {
  analyzeAlbumCover,
  imageBufferToBase64,
  isEnabled: () => ENABLE_VINYL_VISION && !!OPENAI_API_KEY && !!openaiClient,
};

