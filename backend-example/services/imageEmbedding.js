/**
 * Image Embedding Service
 * 
 * Creates vector embeddings of album covers for visual similarity matching.
 * Uses OpenAI's vision models to generate embeddings for known album covers.
 * 
 * This enables Vinyl Vision-style visual similarity matching.
 */

const OpenAI = require('openai');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const ENABLE_EMBEDDINGS = process.env.ENABLE_IMAGE_EMBEDDINGS !== 'false';
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../identified_records.db');

// Initialize OpenAI client
let openaiClient = null;
if (OPENAI_API_KEY) {
  try {
    openaiClient = new OpenAI({
      apiKey: OPENAI_API_KEY,
    });
    console.log('[Image Embedding] ✅ OpenAI client initialized');
  } catch (error) {
    console.error('[Image Embedding] ❌ Failed to initialize OpenAI client:', error.message);
  }
}

/**
 * Generate embedding for an image using OpenAI Vision API
 * 
 * Uses GPT-4 Vision to generate a text description, then embeds that description.
 * This is a practical workaround until OpenAI provides direct image embeddings.
 * 
 * Alternative: Use a local CLIP model or service like HuggingFace Transformers.
 * 
 * @param {Buffer} imageBuffer - Image buffer
 * @param {string} base64Image - Base64 encoded image (optional)
 * @returns {Promise<Array<number>>} Embedding vector
 */
async function generateImageEmbedding(imageBuffer, base64Image = null) {
  if (!ENABLE_EMBEDDINGS || !openaiClient) {
    console.log('[Image Embedding] ⚠️  Not enabled or API key missing');
    return null;
  }

  try {
    console.log('[Image Embedding] 🎨 Generating image embedding...');
    
    if (!base64Image) {
      base64Image = imageBuffer.toString('base64');
    }

    // Strategy: Use GPT-4 Vision to describe the image, then embed the description
    // This creates a semantic embedding that captures visual content
    const visionResponse = await openaiClient.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'Describe this album cover in detail, including artist name, album title, visual style, colors, and any text visible. Be specific and concise.'
            },
            {
              type: 'image_url',
              image_url: {
                url: `data:image/jpeg;base64,${base64Image}`
              }
            }
          ]
        }
      ],
      max_tokens: 200,
      temperature: 0.3,
    });

    const description = visionResponse.choices[0].message.content;
    console.log('[Image Embedding] ✅ Generated description:', description.substring(0, 100) + '...');

    // Now embed the description using text embedding model
    const embeddingResponse = await openaiClient.embeddings.create({
      model: 'text-embedding-3-large',
      input: description,
    });

    const embedding = embeddingResponse.data[0].embedding;
    console.log(`[Image Embedding] ✅ Generated embedding: ${embedding.length} dimensions`);
    
    return embedding;

  } catch (error) {
    console.error('[Image Embedding] ❌ Error:', error.message);
    return null;
  }
}

/**
 * Calculate cosine similarity between two embeddings
 * 
 * @param {Array<number>} embedding1 
 * @param {Array<number>} embedding2 
 * @returns {number} Similarity score (0-1)
 */
function cosineSimilarity(embedding1, embedding2) {
  if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
    return 0;
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Search for similar album covers using embeddings
 * 
 * @param {Array<number>} queryEmbedding - Embedding of the query image
 * @param {Array} knownAlbums - Array of {embedding, artist, title, discogsId}
 * @param {number} threshold - Minimum similarity threshold (default 0.85)
 * @returns {Array} Similar albums sorted by similarity
 */
function findSimilarCovers(queryEmbedding, knownAlbums, threshold = 0.85) {
  if (!queryEmbedding || !knownAlbums || knownAlbums.length === 0) {
    return [];
  }

  const results = knownAlbums
    .map(album => ({
      ...album,
      similarity: cosineSimilarity(queryEmbedding, album.embedding)
    }))
    .filter(album => album.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity);

  console.log(`[Image Embedding] 🔍 Found ${results.length} similar covers (threshold: ${threshold})`);
  
  return results;
}

module.exports = {
  generateImageEmbedding,
  cosineSimilarity,
  findSimilarCovers,
  isEnabled: () => ENABLE_EMBEDDINGS && !!OPENAI_API_KEY && !!openaiClient
};

