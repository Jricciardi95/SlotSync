# Vision Service Module

This module provides image preprocessing and candidate extraction for Google Vision API integration.

## Overview

The Vision service handles:
1. **Image Preprocessing** - Converts HEIC to JPEG, resizes to optimal size (~1024x1024)
2. **Vision API Integration** - Structures requests for Google Vision (Web Detection, OCR, Labels)
3. **Candidate Extraction** - Extracts 8-15 album candidates from Vision results

## Architecture

```
Frontend (React Native)
  ↓
preprocessImageForVision() - HEIC→JPEG, resize, normalize
  ↓
POST /api/identify-record (multipart/form-data)
  ↓
Backend (Node.js)
  ↓
Google Vision API (Web Detection + OCR + Labels)
  ↓
Backend extracts candidates (using backend logic)
  ↓
Response: { bestMatch, alternates, candidates }
```

## Files

- **`types.ts`** - TypeScript type definitions
  - `VisionResult` - Structured Vision API response
  - `IdentificationCandidate` - Extracted candidate with artist/album
  - `ImagePreprocessingOptions` - Preprocessing configuration

- **`visionService.ts`** - Image preprocessing and Vision API utilities
  - `preprocessImageForVision()` - Main preprocessing function
  - `validateImageForVision()` - Image validation
  - `normalizeOcrText()` - OCR text normalization
  - `splitOcrIntoBlocks()` - Split OCR into text blocks

- **`candidateExtractor.ts`** - Candidate extraction from Vision results
  - `extractCandidates()` - Main extraction function
  - Filters out non-album content (Wikipedia, listicles, etc.)
  - Generates 8-15 candidates with confidence scores

## Usage

### Preprocessing an Image

```typescript
import { preprocessImageForVision } from './services/vision';

const preprocessedUri = await preprocessImageForVision(imageUri, {
  maxWidth: 1024,
  maxHeight: 1024,
  quality: 0.85,
});
```

### Extracting Candidates (if backend returns Vision results)

```typescript
import { extractCandidates } from './services/vision';
import type { VisionResult } from './services/vision';

const candidates = extractCandidates(visionResult, {
  maxCandidates: 15,
  minConfidence: 0.3,
  filterNonAlbums: true,
});
```

## Filtering Rules

The candidate extractor filters out:
- **URLs and file paths** - `http://`, `www.`, `.jpg`, etc.
- **Wikipedia pages** - `wikipedia.org`, `wiki/`, `(album)`, etc.
- **Social media** - `reddit.com`, `facebook.com`, `twitter.com`, etc.
- **Editorial content** - "best album covers", "top 20", "review", etc.
- **Generic words** - "discogs", "releases", "album", etc.

## Notes

- The backend currently processes Vision results server-side
- Frontend extractor is available for future client-side preview
- All candidates are validated before being passed to Discogs/MusicBrainz
- Image preprocessing ensures optimal Vision API performance

