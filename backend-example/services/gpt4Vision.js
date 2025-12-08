/**
 * GPT-4 Vision API Integration
 * 
 * Uses OpenAI's GPT-4 Vision API as an intelligent fallback when:
 * - OCR fails to extract text
 * - Vision API web detection is unclear
 * - Multiple conflicting candidates need reasoning
 * 
 * This provides Vinyl Vision-style intelligent reasoning over images.
 */

const OpenAI = require('openai');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ENABLE_GPT4_VISION = process.env.ENABLE_GPT4_VISION !== 'false';

// Initialize OpenAI client
let openaiClient = null;
if (OPENAI_API_KEY) {
  try {
    openaiClient = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
    console.log('[GPT-4 Vision] ✅ OpenAI client initialized');
  } catch (error) {
    console.error('[GPT-4 Vision] ❌ Failed to initialize OpenAI client:', error.message);
  }
}

/**
 * Identify album from image using GPT-4 Vision
 * 
 * @param {Buffer} imageBuffer - Image buffer
 * @param {string} base64Image - Base64 encoded image (optional, will be generated if not provided)
 * @param {Array} existingCandidates - Existing candidates from OCR/Vision (for context)
 * @returns {Promise<Object>} Identification result with artist, title, year, tracks
 */
async function identifyWithGPT4Vision(imageBuffer, base64Image = null, existingCandidates = []) {
  if (!ENABLE_GPT4_VISION || !OPENAI_API_KEY) {
    console.log('[GPT-4 Vision] ⚠️  Not enabled or API key missing');
    return null;
  }

  try {
    console.log('[GPT-4 Vision] 🧠 Starting intelligent image analysis...');
    
    // Convert image buffer to base64 if not provided
    if (!base64Image) {
      base64Image = imageBuffer.toString('base64');
    }
    
    const mimeType = 'image/jpeg'; // Assume JPEG (should be converted before this)
    
    // Build context from existing candidates if available
    let contextPrompt = '';
    if (existingCandidates.length > 0) {
      contextPrompt = `\n\nWe've already extracted these possible matches from OCR:\n${existingCandidates.slice(0, 3).map((c, i) => `${i + 1}. "${c.artist}" - "${c.title}"`).join('\n')}\n\nPlease verify or correct these, or provide a better match if these seem incorrect.`;
    }

    const prompt = `You are a music expert specializing in vinyl record identification. Analyze this album cover image and identify:

1. Artist name (exact spelling)
2. Album title (exact spelling)
3. Release year (if visible or inferable)
4. Track list (if visible on the cover)

${contextPrompt}

Return your response as a JSON object with this exact structure:
{
  "artist": "Artist Name",
  "title": "Album Title",
  "year": 1987,
  "tracks": [
    {"title": "Track 1", "trackNumber": 1},
    {"title": "Track 2", "trackNumber": 2}
  ],
  "confidence": 0.9,
  "reasoning": "Brief explanation of how you identified this"
}

If you cannot identify the album with confidence, set confidence to 0.3 or lower and explain why.
Be precise with artist and album names - use exact spelling from the cover.
If the image is unclear, do your best but lower the confidence score accordingly.`;

    if (!openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o', // Use gpt-4o (latest vision-capable model)
      messages: [
        {
          role: 'system',
          content: 'You are a music expert that identifies vinyl album covers from images. Always return valid JSON.'
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 1000,
      temperature: 0.3, // Lower temperature for more consistent results
    });

    const content = response.choices[0].message.content;
    console.log('[GPT-4 Vision] ✅ Received response from GPT-4 Vision');
    console.log('[GPT-4 Vision] Raw response:', content.substring(0, 200) + '...');

    // Parse JSON from response (may be wrapped in markdown code blocks)
    let jsonContent = content.trim();
    if (jsonContent.startsWith('```json')) {
      jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
    } else if (jsonContent.startsWith('```')) {
      jsonContent = jsonContent.replace(/```\n?/g, '');
    }

    const result = JSON.parse(jsonContent);
    
    console.log('[GPT-4 Vision] ✅ Parsed result:', {
      artist: result.artist,
      title: result.title,
      year: result.year,
      tracksCount: result.tracks?.length || 0,
      confidence: result.confidence
    });

    if (result.confidence < 0.3) {
      console.log('[GPT-4 Vision] ⚠️  Low confidence result, may not be reliable');
      return null;
    }

    return {
      artist: result.artist,
      title: result.title,
      year: result.year || null,
      tracks: result.tracks || [],
      confidence: result.confidence || 0.7,
      reasoning: result.reasoning,
      source: 'gpt4_vision'
    };

  } catch (error) {
    console.error('[GPT-4 Vision] ❌ Error:', error.message);
    if (error.response) {
      console.error('[GPT-4 Vision] Response status:', error.response.status);
      console.error('[GPT-4 Vision] Response data:', error.response.data);
    }
    return null;
  }
}

/**
 * Use GPT-4 Vision to reason about conflicting candidates
 * 
 * @param {Buffer} imageBuffer - Image buffer
 * @param {Array} candidates - Array of candidate matches
 * @returns {Promise<Object>} Best candidate with reasoning
 */
async function reasonAboutCandidates(imageBuffer, candidates) {
  if (!ENABLE_GPT4_VISION || !OPENAI_API_KEY || candidates.length === 0) {
    return null;
  }

  try {
    console.log('[GPT-4 Vision] 🧠 Reasoning about conflicting candidates...');
    
    const base64Image = imageBuffer.toString('base64');
    const candidatesText = candidates.map((c, i) => 
      `${i + 1}. "${c.artist}" - "${c.title}" (confidence: ${c.confidence.toFixed(2)})`
    ).join('\n');

    const prompt = `We've identified these possible album matches from the cover image:

${candidatesText}

Please analyze the image and determine which one is most likely correct, or provide a better match if none seem right. Return JSON:
{
  "bestMatch": {"artist": "...", "title": "..."},
  "confidence": 0.9,
  "reasoning": "Why this is the correct match"
}`;

    if (!openaiClient) {
      throw new Error('OpenAI client not initialized');
    }

    const response = await openaiClient.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 500,
      temperature: 0.2,
    });

    const content = response.choices[0].message.content;
    let jsonContent = content.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
    const result = JSON.parse(jsonContent);

    console.log('[GPT-4 Vision] ✅ Reasoning complete:', result.reasoning);
    return result;

  } catch (error) {
    console.error('[GPT-4 Vision] ❌ Reasoning error:', error.message);
    return null;
  }
}

module.exports = {
  identifyWithGPT4Vision,
  reasonAboutCandidates,
  isEnabled: () => ENABLE_GPT4_VISION && !!OPENAI_API_KEY && !!openaiClient
};

