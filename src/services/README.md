# Services Architecture

## Overview

The services layer is organized into clear feature boundaries, friendly to future microservice backends.

## Service Modules

### `src/services/vision/`
**Purpose:** Vision + OCR + Candidate Extraction

**Responsibilities:**
- Image preprocessing (HEIC → JPEG, resizing, normalization)
- Google Vision API integration
- Candidate extraction from Vision results
- Text normalization and parsing

**Exports:**
- `preprocessImageForVision()` - Image preprocessing
- `validateImageForVision()` - Image validation
- `extractCandidates()` - Extract album candidates from Vision result

**No UI/Navigation Dependencies:** ✅

---

### `src/services/metadata/`
**Purpose:** Discogs + MusicBrainz + CAA Resolvers

**Responsibilities:**
- Discogs API client (search, release details)
- MusicBrainz API client (release lookup, MBID resolution)
- Cover Art Archive client (HD cover art)
- Metadata resolver (orchestrates Discogs → MB → CAA)

**Exports:**
- `resolveAlbumFromCandidates()` - Main resolver function
- `searchDiscogs()` - Discogs search
- `searchMusicBrainzRelease()` - MusicBrainz lookup
- `getCoverArtFromCAA()` - HD cover art

**No UI/Navigation Dependencies:** ✅

---

### `src/services/identification/`
**Purpose:** High-level Orchestrator

**Responsibilities:**
- Orchestrates the full identification pipeline
- Manages cache lookups
- Coordinates Vision → Candidates → Metadata → DB

**Main Function:**
```typescript
identifyAlbumFromImage(imageUri: string): Promise<IdentificationResult | null>
```

**Flow:**
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
Metadata Resolver (Discogs → MB → CAA)
  ↓
Save to Cache
  ↓
Return ResolvedAlbum
```

**No UI/Navigation Dependencies:** ✅

---

### `src/services/db/`
**Purpose:** Database Service Wrappers

**Responsibilities:**
- High-level wrappers around repository functions
- Convenience functions for common operations
- Abstracts database implementation details

**Exports:**
- All repository functions (re-exported)
- `saveResolvedAlbum()` - Save album with tracks and hash

**No UI/Navigation Dependencies:** ✅

---

## Shared Types

### Central Type Locations

1. **`src/data/types.ts`** - Database types (RecordModel, Track, etc.)
2. **`src/services/metadata/types.ts`** - Metadata types (ResolvedAlbum, TrackInfo)
3. **`src/services/vision/types.ts`** - Vision types (VisionResult, IdentificationCandidate)
4. **`src/services/identification/types.ts`** - Identification types (IdentificationResult, IdentificationError)

### Type Flow

```
Vision Types → Metadata Types → Identification Types
     ↓              ↓                    ↓
  Candidates → ResolvedAlbum → IdentificationResult
```

---

## Feature Layer Usage

### ✅ Correct (High-Level)

```typescript
// In screens/components
import { identifyAlbumFromImage } from '../services/identification';

const result = await identifyAlbumFromImage(imageUri);
if (result) {
  // Use result.album (ResolvedAlbum)
}
```

### ❌ Avoid (Low-Level)

```typescript
// Don't call individual services directly
import { searchDiscogs } from '../services/metadata/discogsClient'; // ❌
import { extractCandidates } from '../services/vision/candidateExtractor'; // ❌
```

---

## Service Dependencies

```
identification/
  ├── vision/ (preprocessing, candidate extraction)
  ├── metadata/ (Discogs, MB, CAA resolution)
  ├── db/ (cache operations)
  └── utils/ (image hashing)

metadata/
  ├── discogsClient.ts
  ├── musicbrainzClient.ts
  ├── caaClient.ts
  └── metadataResolver.ts

vision/
  ├── visionService.ts (preprocessing)
  ├── candidateExtractor.ts (candidate extraction)
  └── types.ts
```

**No Circular Dependencies:** ✅

---

## Migration Notes

### Legacy Code

**`src/services/RecordIdentificationService.ts`** is kept for backward compatibility:
- Wraps `identifyAlbumFromImage()` 
- Converts to legacy `IdentificationResponse` format
- Marked as `@deprecated`

**New code should use:**
```typescript
import { identifyAlbumFromImage } from '../services/identification';
```

---

## Microservice Ready

Each service module:
- ✅ Has clear responsibility
- ✅ No UI/navigation imports
- ✅ Uses shared types from central locations
- ✅ Can be extracted to separate microservice

**Future Microservice Structure:**
```
vision-service/     → src/services/vision/
metadata-service/   → src/services/metadata/
identification-api/ → src/services/identification/
db-service/         → src/services/db/
```

---

## Documentation

Each service module has a `README.md` explaining:
- Purpose and responsibilities
- Usage examples
- Architecture and flow
- Dependencies

