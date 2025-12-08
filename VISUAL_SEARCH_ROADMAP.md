# Visual Search Implementation Roadmap

## Current State vs. Ideal Architecture

### ✅ What We Have Now

1. **Embedding Infrastructure**
   - ✅ Embedding database table (`album_embeddings`)
   - ✅ Embedding generation service (workaround: GPT-4 Vision → text embedding)
   - ✅ Similarity search (cosine similarity)
   - ✅ Automatic storage after successful identification

2. **Metadata Sources**
   - ✅ Discogs API integration
   - ✅ Tracklist extraction
   - ✅ Cover image URLs

3. **Fallback Systems**
   - ✅ Barcode scanning
   - ✅ OCR/Google Vision
   - ✅ GPT-4 Vision fallback
   - ✅ Text-based search

4. **Image Processing**
   - ✅ HEIC → JPEG conversion
   - ✅ Image resizing/compression
   - ✅ Image preprocessing (contrast, sharpening)

### 🚧 What We Need to Add

1. **True CLIP Model Integration**
   - Current: Using GPT-4 Vision + text embedding (workaround)
   - Needed: Direct CLIP model (openai/clip-vit-base-patch32 or similar)
   - Options:
     - Self-hosted (Docker container with GPU/CPU)
     - Hosted inference (Replicate, Together.ai, HuggingFace Inference API)

2. **Proper Vector Database**
   - Current: SQLite with JSON blob embeddings
   - Needed: Dedicated vector DB for scale
   - Options:
     - **Pinecone** (managed, easiest)
     - **Weaviate** (self-hosted or cloud)
     - **Qdrant** (self-hosted or cloud)
     - **Postgres + pgvector** (good for mid-scale)

3. **Pre-computed Catalog**
   - Current: Embeddings generated on-the-fly after identification
   - Needed: Pre-computed embeddings for known albums
   - Process:
     - Fetch popular albums from Discogs
     - Generate embeddings for cover images
     - Store in vector DB
     - Enables instant matching for common albums

## Implementation Plan

### Phase 1: CLIP Model Integration

**Option A: Self-Hosted (Recommended for Production)**

```javascript
// backend-example/services/clipEmbedding.js
const { pipeline } = require('@xenova/transformers');

let clipModel = null;

async function initializeCLIP() {
  if (!clipModel) {
    clipModel = await pipeline('image-feature-extraction', 
      'Xenova/clip-vit-base-patch32'
    );
  }
  return clipModel;
}

async function generateImageEmbedding(imageBuffer) {
  const model = await initializeCLIP();
  const result = await model(imageBuffer);
  return result.data; // 512-dim vector
}
```

**Option B: Hosted Inference (Easier Setup)**

```javascript
// Use Replicate or Together.ai API
async function generateImageEmbedding(imageBuffer) {
  const response = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Token ${process.env.REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: 'clip-vit-base-patch32',
      input: { image: base64Image }
    })
  });
  // ... handle response
}
```

### Phase 2: Vector Database Migration

**Option A: Pinecone (Easiest)**

```javascript
const { Pinecone } = require('@pinecone-database/pinecone');

const pinecone = new Pinecone({
  apiKey: process.env.PINECONE_API_KEY,
});

const index = pinecone.index('album-covers');

// Store embedding
await index.upsert([{
  id: `album-${discogsId}`,
  values: embedding,
  metadata: { artist, title, year, discogsId }
}]);

// Search
const results = await index.query({
  vector: queryEmbedding,
  topK: 10,
  includeMetadata: true,
});
```

**Option B: Postgres + pgvector (Self-Hosted)**

```sql
-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create table
CREATE TABLE album_embeddings (
  id SERIAL PRIMARY KEY,
  artist TEXT NOT NULL,
  title TEXT NOT NULL,
  year INTEGER,
  discogs_id INTEGER,
  embedding vector(512),
  cover_image_url TEXT
);

-- Create index for fast similarity search
CREATE INDEX ON album_embeddings 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Search query
SELECT artist, title, year, discogs_id,
       1 - (embedding <=> $1) as similarity
FROM album_embeddings
ORDER BY embedding <=> $1
LIMIT 10;
```

### Phase 3: Catalog Pre-computation

**Script to Build Reference Catalog**

```javascript
// scripts/buildCatalog.js
const discogs = require('./discogsClient');
const clipEmbedding = require('./services/clipEmbedding');
const vectorDB = require('./services/vectorDB');

async function buildCatalog() {
  // 1. Fetch popular albums from Discogs
  const popularAlbums = await discogs.getPopularAlbums(10000);
  
  // 2. For each album:
  for (const album of popularAlbums) {
    // Download cover image
    const coverImage = await downloadImage(album.coverUrl);
    
    // Generate embedding
    const embedding = await clipEmbedding.generateImageEmbedding(coverImage);
    
    // Store in vector DB
    await vectorDB.store({
      id: `album-${album.discogsId}`,
      embedding,
      metadata: {
        artist: album.artist,
        title: album.title,
        year: album.year,
        discogsId: album.discogsId,
        coverUrl: album.coverUrl,
      }
    });
  }
}
```

## Recommended Tech Stack (2025)

### For Production Scale

1. **Image Encoder**: `Xenova/clip-vit-base-patch32` (self-hosted)
   - Fast, accurate, open-source
   - Can run on CPU (slower) or GPU (faster)

2. **Vector DB**: Pinecone (managed) or Postgres + pgvector (self-hosted)
   - Pinecone: Easiest, scales automatically
   - pgvector: More control, good up to ~1M vectors

3. **Metadata**: Discogs + MusicBrainz (already integrated)

4. **Fallbacks**: 
   - Barcode (already implemented)
   - OCR + text search (already implemented)
   - GPT-4 Vision (already implemented)

## Migration Path

### Step 1: Add CLIP Model (Keep Current Workaround)
- Add CLIP embedding service
- Use it alongside current GPT-4 workaround
- Compare results, gradually migrate

### Step 2: Set Up Vector DB
- Choose Pinecone or pgvector
- Migrate existing embeddings
- Update search logic

### Step 3: Build Catalog
- Fetch popular albums from Discogs
- Pre-compute embeddings
- Store in vector DB

### Step 4: Optimize
- Cache frequently searched albums
- Batch embedding generation
- Monitor performance

## Performance Targets

- **Visual Search**: < 500ms (with vector DB)
- **Barcode Scan**: < 200ms
- **OCR Fallback**: < 2s
- **Overall UX**: < 3s end-to-end

## Cost Considerations

### Current (GPT-4 Workaround)
- ~$0.01-0.05 per identification
- Only used as fallback

### With CLIP (Self-Hosted)
- One-time: GPU server (~$50-200/month) or CPU (free/slow)
- Per-request: Negligible (just compute)

### With CLIP (Hosted)
- Replicate: ~$0.001 per image
- Together.ai: Similar pricing

### Vector DB
- Pinecone: Free tier (1M vectors), then ~$70/month
- pgvector: Free (self-hosted Postgres)

## Next Steps

1. **Immediate**: Test current implementation with real album covers
2. **Short-term**: Add CLIP model integration
3. **Medium-term**: Migrate to proper vector DB
4. **Long-term**: Build pre-computed catalog

## References

- CLIP Paper: https://arxiv.org/abs/2103.00020
- Xenova Transformers: https://github.com/xenova/transformers.js
- Pinecone Docs: https://docs.pinecone.io
- pgvector: https://github.com/pgvector/pgvector

