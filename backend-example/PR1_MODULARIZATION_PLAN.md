# PR1: Backend Modularization Plan

## Overview
Refactor `server-hybrid.js` (4784 lines) into modular structure without changing behavior.

## Folder Structure Created
```
backend-example/src/
├── routes/           (route handlers)
├── services/
│   ├── identify/     (identification pipeline)
│   ├── providers/    (Discogs, Vision, etc.)
│   └── cache/        (cache management)
└── utils/            (shared utilities)
```

## Modules to Extract

### 1. Vision Provider ✅ COMPLETED
- **File**: `src/services/providers/visionProvider.js`
- **Functions**:
  - `getVisionClient()` - Lazy initialization of Vision client
  - `processImageWithGoogleVision()` - Process image and extract OCR/entities

### 2. Discogs Provider (IN PROGRESS)
- **File**: `src/services/providers/discogsProvider.js`
- **Functions**:
  - `searchDiscogsEnhanced()` - Enhanced search with query variations
  - `fetchDiscogsReleaseById()` - Fetch release details by ID
  - `searchDiscogsByBarcode()` - Barcode search
  - `generateDiscogsQueries()` - Generate query variations
  - `cleanDiscogsArtistName()` - Clean artist names

### 3. Cache Module (PENDING)
- **File**: `src/services/cache/discogsCache.js`
- **Functions**:
  - `cleanupCache()` - Cleanup old cache entries
  - Cache management (globalDiscogsCache, globalSearchCache)

### 4. Identification Pipeline (PENDING)
- **File**: `src/services/identify/identifyPipeline.js`
- **Functions**:
  - `generateCandidatesFromInput()` - Phase 1: Generate candidates
  - `resolveBestAlbum()` - Phase 2: Resolve best match
  - `enrichAlbumMetadata()` - Phase 3: Enrich metadata

### 5. Utils (PENDING)
- **File**: `src/utils/helpers.js`
- **Functions**:
  - `parseDuration()` - Parse duration strings
  - `safeToFixed()` - Safe number formatting
  - `isAlbumNameOnlyCandidate()` - Filter candidates

### 6. Route Updates (PENDING)
- **File**: `routes/identifyRecord.js` (already exists, needs updates)
- **Changes**:
  - Import from new modules
  - Add request-scoped logging with requestId
  - Add timings to response: `{ preprocessMs, visionMs, discogsMs, totalMs }`

## Implementation Status

- [x] Create folder structure
- [x] Extract Vision provider
- [ ] Extract Discogs provider
- [ ] Extract cache module
- [ ] Extract identification pipeline
- [ ] Extract utility functions
- [ ] Update route with timings
- [ ] Update server-hybrid.js to use new modules
- [ ] Test all endpoints

## Notes

- All behavior must be preserved
- No client changes required
- RequestId already exists, needs to be consistently used
- Timings should be added to response without breaking existing fields


