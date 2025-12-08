# Identification Service

High-level orchestrator for album identification from images.

## Overview

The identification service provides a single entry point (`identifyAlbumFromImage`) that orchestrates the entire identification pipeline:

```
Image
  ↓
Generate Image Hash
  ↓
Check Local DB Cache
  ↓ (Cache Miss)
Preprocess Image
  ↓
Vision API (OCR + Web Detection)
  ↓
Extract Candidates
  ↓
Metadata Resolver (Discogs → MusicBrainz → CAA)
  ↓
Save to Cache
  ↓
Return ResolvedAlbum
```

## Usage

```typescript
import { identifyAlbumFromImage } from '../services/identification';

const result = await identifyAlbumFromImage(imageUri, {
  minConfidence: 0.6,
  preferVinyl: true,
  fetchTracks: true,
  fetchCoverArt: true,
});

if (result) {
  console.log(`Found: ${result.album.artist} - ${result.album.albumTitle}`);
  console.log(`From cache: ${result.fromCache}`);
}
```

## Architecture

### Service Dependencies

- **Vision Service** (`../vision/`) - Image preprocessing and candidate extraction
- **Metadata Service** (`../metadata/`) - Discogs, MusicBrainz, CAA resolution
- **DB Service** (`../db/`) - Cache operations
- **Utils** (`../../utils/`) - Image hashing

### No UI Dependencies

This service:
- ✅ Does NOT import UI components
- ✅ Does NOT import navigation
- ✅ Does NOT import screens
- ✅ Works with pure data types

### Error Handling

The service throws `IdentificationError` with:
- `code` - Error type (NETWORK_ERROR, INVALID_IMAGE, etc.)
- `message` - User-friendly error message
- `candidates` - Available candidates (if any)
- `extractedText` - OCR text (if available)

## Flow Details

### 1. Cache Check
- Generates image hash
- Looks up in local database
- Returns instantly if found (< 10ms)

### 2. Vision Processing
- Preprocesses image (HEIC → JPEG, resize, normalize)
- Calls backend Vision API
- Gets structured VisionResult

### 3. Candidate Extraction
- Extracts 8-15 candidates from Vision result
- Filters non-album content
- Sorts by confidence

### 4. Metadata Resolution
- For each candidate, searches Discogs
- If found, looks up MusicBrainz
- Fetches HD cover art from CAA
- Returns best match

### 5. Cache Save
- Saves hash association (record saving happens in UI layer)
- Future scans are instant

## Types

See `types.ts` for:
- `IdentificationOptions` - Configuration options
- `IdentificationResult` - Success result
- `IdentificationError` - Error result

## Notes

- **Cache Strategy**: Hash lookup is instant, but full record saving happens in UI layer after user confirmation
- **Error Recovery**: Service provides candidates and extracted text for manual entry fallback
- **Microservice Ready**: Service can be easily extracted to a separate microservice in the future

