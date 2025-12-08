# Phase 4 – Modularize Services and Clean Project Architecture

## ✅ Completed

Reorganized the codebase into clear service boundaries, friendly to future microservice backends.

---

## 📁 New Service Structure

### `src/services/vision/`
**Purpose:** Vision + OCR + Candidate Extraction

**Files:**
- `visionService.ts` - Image preprocessing, Vision API integration
- `candidateExtractor.ts` - Extract album candidates from Vision results
- `types.ts` - VisionResult, IdentificationCandidate types
- `index.ts` - Module exports
- `README.md` - Documentation

**Responsibilities:**
- Image preprocessing (HEIC → JPEG, resizing, normalization)
- Google Vision API integration
- Candidate extraction from Vision results
- Text normalization and parsing

**No UI/Navigation Dependencies:** ✅

---

### `src/services/metadata/`
**Purpose:** Discogs + MusicBrainz + CAA Resolvers

**Files:**
- `discogsClient.ts` - Discogs API client
- `musicbrainzClient.ts` - MusicBrainz API client
- `caaClient.ts` - Cover Art Archive client
- `metadataResolver.ts` - Main resolver (orchestrates Discogs → MB → CAA)
- `types.ts` - ResolvedAlbum, TrackInfo types
- `index.ts` - Module exports
- `README.md` - Documentation

**Responsibilities:**
- Discogs API client (search, release details)
- MusicBrainz API client (release lookup, MBID resolution)
- Cover Art Archive client (HD cover art)
- Metadata resolver (orchestrates Discogs → MB → CAA)

**No UI/Navigation Dependencies:** ✅

---

### `src/services/identification/`
**Purpose:** High-level Orchestrator

**Files:**
- `orchestrator.ts` - Main `identifyAlbumFromImage()` function
- `types.ts` - IdentificationResult, IdentificationError types
- `index.ts` - Module exports
- `README.md` - Documentation

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

**Files:**
- `index.ts` - Re-exports repository functions + convenience functions

**Responsibilities:**
- High-level wrappers around repository functions
- Convenience functions for common operations
- Abstracts database implementation details

**Exports:**
- All repository functions (re-exported)
- `saveResolvedAlbum()` - Save album with tracks and hash

**No UI/Navigation Dependencies:** ✅

---

## 🔄 Service Dependencies

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

## 📝 Shared Types

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

## 🗑️ Removed/Deprecated

### Removed Files
- `src/services/identificationCache.ts` - Functionality moved to `identification/orchestrator.ts`
- `src/services/identificationCache/` - Empty directory removed

### Deprecated Files
- `src/services/RecordIdentificationService.ts` - Marked as `@deprecated`
  - Wraps `identifyAlbumFromImage()` for backward compatibility
  - Converts to legacy `IdentificationResponse` format
  - New code should use `identifyAlbumFromImage()` directly

---

## 📚 Documentation

### Service READMEs

1. **`src/services/README.md`** - Overview of all services
2. **`src/services/vision/README.md`** - Vision service documentation
3. **`src/services/metadata/README.md`** - Metadata resolver documentation
4. **`src/services/identification/README.md`** - Identification orchestrator documentation

### High-Level Comments

- Each service module has clear JSDoc comments
- Flow diagrams in README files
- Usage examples provided

---

## 🎯 Feature Layer Usage

### ✅ Correct (High-Level)

```typescript
// In screens/components
import { identifyAlbumFromImage } from '../services/identification';

const result = await identifyAlbumFromImage(imageUri, {
  minConfidence: 0.6,
  preferVinyl: true,
  fetchTracks: true,
  fetchCoverArt: true,
});

if (result) {
  // Use result.album (ResolvedAlbum)
  console.log(result.album.artist, result.album.albumTitle);
}
```

### ❌ Avoid (Low-Level)

```typescript
// Don't call individual services directly
import { searchDiscogs } from '../services/metadata/discogsClient'; // ❌
import { extractCandidates } from '../services/vision/candidateExtractor'; // ❌
```

---

## 🔄 Migration Path

### Current State
- Screens use `identifyRecord()` from `RecordIdentificationService.ts`
- Legacy service wraps new orchestrator
- Backward compatible

### Future State
- Screens use `identifyAlbumFromImage()` directly
- Legacy service can be removed
- Cleaner, more maintainable code

---

## 🚀 Microservice Ready

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

## ✅ Verification

### No UI Dependencies
- ✅ Services don't import UI components
- ✅ Services don't import navigation
- ✅ Services don't import screens

### Clear Boundaries
- ✅ Each service has single responsibility
- ✅ Services communicate via well-defined types
- ✅ No circular dependencies

### Documentation
- ✅ README files for each service
- ✅ High-level comments explaining flows
- ✅ Usage examples provided

**Phase 4 Complete!** ✅

The codebase is now organized into clear service boundaries, ready for future microservice extraction.

