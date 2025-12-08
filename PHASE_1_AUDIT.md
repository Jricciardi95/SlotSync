# 🧩 PHASE 1 – CODEBASE AUDIT & MAP

**Date:** Generated during Phase 1 audit  
**Purpose:** Complete mapping of SlotSync identification pipeline, UI flow, data layer, and problem areas

---

## 📋 EXECUTIVE SUMMARY

SlotSync is a React Native/Expo app for vinyl collectors that identifies albums from photos using:
- **Google Vision API** (OCR, Web Detection, Labels)
- **Discogs API** (vinyl metadata + tracklists)
- **MusicBrainz API** (canonical IDs + normalized metadata)
- **Cover Art Archive** (HD cover images)

The app has a **hybrid architecture** with a Node.js/Express backend (`backend-example/`) and React Native frontend (`src/`).

---

## 🔄 CURRENT IDENTIFICATION FLOW

### Frontend → Backend Pipeline

```
Photo Capture (ScanRecordScreen)
  ↓
HEIC → JPEG Conversion (imageConverter.ts)
  ↓
Image Resize for Vision API (imageResize.ts: 1024x1024 max)
  ↓
POST /api/identify-record (multipart/form-data)
  ↓
Backend Processing (server-hybrid.js)
  ↓
Google Vision API (OCR + Web Detection + Labels)
  ↓
Candidate Extraction (extractCandidates, visionExtractor)
  ↓
Discogs Search (searchDiscogsEnhanced)
  ↓
MusicBrainz Enrichment (unifiedMetadataResolver)
  ↓
Cover Art Archive (HD cover art)
  ↓
Response: { bestMatch, alternates, confidence, tracks }
  ↓
Frontend Normalization (normalizeScanResult)
  ↓
UI Display (ScanRecordScreen → Confirm Match)
```

### Key Functions & Locations

#### **Frontend (`src/services/RecordIdentificationService.ts`)**
- `identifyRecord(imageUri, abortSignal)` - Main identification function
  - Converts HEIC → JPEG
  - Resizes to 1024x1024 for Vision API
  - POSTs to `/api/identify-record`
  - Retry logic (3 attempts, exponential backoff)
  - Error handling with `LOW_CONFIDENCE` special case
  
- `identifyRecordByBarcode(barcode)` - Barcode identification
  - POSTs to `/api/identify-record` with `{ barcode }`
  
- `normalizeScanResult(response)` - Converts API response to `{ current, alternates }`
  
- `looksLikeRealAlbumTitle(candidate)` - Frontend safety filter
  - Rejects URLs, Wikipedia, social media, article titles
  - Second-layer filter (backend also filters)

#### **Backend (`backend-example/server-hybrid.js`)**

**Candidate Generation (`generateCandidatesFromInput`):**
1. **Google Vision** (`processImageWithGoogleVision`)
   - OCR text extraction
   - Web entities (album names from web)
   - Page titles (from similar images)
   - Similar images URLs
   - Labels (generic categories)
   - Extracts candidates via `extractCandidates(text)`

2. **GPT-4 Vision** (optional, if `ENABLE_GPT4_VISION=true`)
   - Direct album identification from image
   - Returns structured `{ artist, title, year, tracks }`

3. **Image Embeddings** (optional, if `ENABLE_IMAGE_EMBEDDINGS=true`)
   - Visual similarity matching against stored embeddings
   - Finds previously identified albums

4. **Barcode** (if provided)
   - Direct Discogs barcode lookup

5. **OCR Fallback** (if no candidates)
   - MusicBrainz search using OCR text

**Best Match Resolution (`resolveBestAlbum`):**
1. **Local DB Check** - Check `identified_records` table by image hash
2. **Discogs Search** - For each candidate:
   - `searchDiscogsEnhanced(artist, title)`
   - Fuzzy matching with similarity scoring
   - Returns best match with confidence
3. **Confidence Threshold** - Default 0.5 (configurable via `CONFIDENCE_THRESHOLD`)
4. **Low Confidence Handling** - Returns candidates as suggestions if below threshold

**Metadata Enrichment (`enrichAlbumMetadata`):**
1. **Discogs Release Details** - Fetch full release with tracklist
2. **MusicBrainz** - Get canonical MBID via `unifiedMetadataResolver`
3. **Cover Art Archive** - HD cover art by MusicBrainz release ID
4. **Track Parsing** - Extract Side A/B, track numbers, durations

**Filtering (`isAlbumNameOnlyCandidate`):**
- Rejects URLs, file paths, Wikipedia, social media, article titles
- Applied to all candidates before returning

---

## 🎨 CURRENT UI / NAVIGATION FLOW FOR SCANNING

### Single Scan Flow

**Entry Point:** `LibraryScreen` → "Scan Record" button → `ScanRecordScreen`

**ScanRecordScreen States:**
1. **Camera View** (`scanning === true`)
   - Camera preview with scan frame overlay
   - Mode toggle: Image vs Barcode
   - Capture button (manual trigger)
   - Auto-barcode scan (if barcode mode)

2. **Processing** (`identifying === true`)
   - Loading spinner
   - "Analyzing album cover..." message
   - Cancel button

3. **Low Confidence Suggestions** (`suggestions !== null`)
   - List of candidate albums
   - Extracted text display
   - "Use This" or "None of These" buttons
   - Navigate to `AddRecord` if none match

4. **Confirm Match** (`result !== null`)
   - Best match display with cover art
   - Artist, title, year
   - "Looks Good", "Try Another Match", "Enter Details Manually" buttons
   - Uses `getCoverImageUri()` - prioritizes remote URL over local photo

5. **Error State**
   - Alert dialog
   - Option to enter manually or retry

**Navigation:**
- `ScanRecordScreen` → `AddRecordScreen` (manual entry)
- `ScanRecordScreen` → `LibraryHome` (after save)

### Batch Scan Flow

**Entry Point:** `LibraryScreen` → "Batch Scan" → `BatchScanScreen`

**BatchScanScreen:**
- Camera capture (adds to `BatchScanContext`)
- Pick from library (multiple images)
- Upload CSV file
- "Process All" button → `BatchReviewScreen`

**BatchReviewScreen:**
- Shows all pending photos
- Auto-starts processing if `autoStart` flag
- Background processing via `BatchProcessingService`
- Each photo shows:
  - Original photo
  - Identified image (HD cover art if available)
  - Artist, title, year, confidence
  - Action buttons: "Yes", "Try Another", "Edit Manually", "Cancel"
- Uses `prepareImageFields()` - prioritizes remote URL

**Context:** `BatchScanContext` (`src/contexts/BatchScanContext.tsx`)
- Stores `pendingPhotos: PendingPhoto[]`
- Functions: `addPhoto`, `removePhoto`, `clearPhotos`, `getPhotoById`

### Manual Entry Flow

**AddRecordScreen:**
- Form fields: title, artist, year, notes
- Cover image picker
- "Lookup Metadata" button → `/api/identify-by-text`
  - Uses `unifiedMetadataResolver` on backend
  - Auto-fills: year, tracks, HD cover art
- Uses `prepareImageFields()` when saving

---

## 💾 CURRENT DATA / DB SETUP

### Frontend Database (`src/data/database.ts`)

**SQLite Database:** `slotsync.db`

**Tables:**
1. **`records`**
   - `id`, `title`, `artist`, `artistLastName`, `year`, `genre`, `notes`
   - `coverImageLocalUri` (user photo)
   - `coverImageRemoteUrl` (HD from APIs)
   - `createdAt`, `updatedAt`

2. **`tracks`**
   - `id`, `recordId`, `title`, `trackNumber`, `discNumber`, `side`, `durationSeconds`
   - Foreign key: `recordId` → `records(id) ON DELETE CASCADE`

3. **`batch_jobs`** & **`batch_photos`**
   - Batch processing state tracking

4. **Other tables:** `rows`, `units`, `shelfSlotGroups`, `recordLocations`, `sessions`, `sessionRecords`

**Repository Functions (`src/data/repository.ts`):**
- `createRecord()`, `updateRecord()`, `getRecordById()`, `findDuplicateRecord()`
- `createTrack()`, `getTracksByRecord()`
- `createBatchJob()`, `getBatchPhotos()`, `updateBatchPhoto()`

### Backend Database (`backend-example/server-hybrid.js`)

**SQLite Database:** `identified_records.db`

**Tables:**
1. **`identified_records`**
   - `id`, `artist`, `title`, `year`, `cover_image_url`, `discogs_id`
   - `image_hash` (for duplicate detection)
   - `created_at`
   - **Purpose:** Cache previously identified albums by image hash

2. **`album_embeddings`** (if embeddings enabled)
   - Stores image embeddings for visual similarity matching
   - `embedding` (BLOB), `embedding_model`

3. **`vinyl_metadata`** (if GPT-4 Vision enabled)
   - Caches GPT-4o analysis results
   - `imageHash` for lookup

**Caching Strategy:**
- Image hash lookup before API calls
- Embedding similarity search (optional)
- GPT-4 Vision result caching (optional)

---

## ⚙️ CONFIGURATION

### Frontend (`src/config/api.ts`)

**Environment Variable:** `EXPO_PUBLIC_API_BASE_URL`
- **Required** - No fallback to localhost
- Must be LAN IP for physical devices (e.g., `http://192.168.1.100:3000`)
- Validates and warns if localhost detected

**Endpoints:**
- `IDENTIFY_RECORD: '/api/identify-record'`
- `PING: '/api/ping'`
- `TIMEOUT: 90000` (90 seconds)

### Backend (`backend-example/.env`)

**Required:**
- `DISCOGS_PERSONAL_ACCESS_TOKEN` - Discogs API token
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to Google Vision credentials JSON

**Optional:**
- `OPENAI_API_KEY` - For GPT-4 Vision
- `ENABLE_GOOGLE_VISION=true` - Enable/disable Google Vision
- `ENABLE_GPT4_VISION=true` - Enable GPT-4 Vision
- `ENABLE_VINYL_VISION=true` - Enable Vinyl Vision analysis
- `ENABLE_IMAGE_EMBEDDINGS=true` - Enable embedding-based matching
- `ENABLE_IMAGE_PREPROCESSING=true` - Enable image preprocessing
- `CONFIDENCE_THRESHOLD=0.5` - Identification confidence threshold

---

## 🐛 KNOWN PROBLEMS / WEAK SPOTS

### 1. **Image Selection Logic** ✅ FIXED
- **Status:** Implemented in `src/utils/imageSelection.ts`
- **Rule:** `coverImageRemoteUrl` > `coverImageLocalUri` > placeholder
- **Applied in:**
  - `ScanRecordScreen.saveRecord()`
  - `AddRecordScreen.handleSave()`
  - `BatchReviewScreen.saveRecord()`
  - All UI display via `getCoverImageUri()`

### 2. **Suggestion Quality** ✅ FIXED
- **Status:** Backend + frontend filtering implemented
- **Backend:** `isAlbumNameOnlyCandidate()` in `server-hybrid.js`
- **Frontend:** `looksLikeRealAlbumTitle()` in `RecordIdentificationService.ts`
- **Filters:** URLs, Wikipedia, social media, article titles, file paths

### 3. **Navigation Issues** ✅ FIXED
- **Status:** `EditRecordScreen` uses explicit navigation
- **Fix:** `navigation.navigate('RecordDetail', { recordId })` instead of `goBack()`
- **Result:** Prevents "Album not found" errors after editing

### 4. **HEIC Support** ✅ FIXED
- **Status:** `imageConverter.ts` handles HEIC → JPEG conversion
- **Applied:** All capture/selection paths convert before upload

### 5. **Spacing Undefined** ⚠️ POTENTIAL ISSUE
- **Status:** Found one instance in `AddRecordScreen.tsx:416`
- **Line 416:** `padding: 8, // Use theme spacing scale instead of undefined variable (spacing.sm = 8)`
- **Note:** Comment suggests this was already addressed, but hardcoded value remains
- **Impact:** Low - single instance, functional but not consistent

### 6. **Error Handling**
- **Status:** Comprehensive retry logic and error types
- **Areas for improvement:**
  - Network timeout handling (90s timeout, but may need user feedback)
  - Low confidence suggestions could be more prominent
  - Error messages could be more user-friendly

### 7. **Performance**
- **Status:** Image resizing and compression implemented
- **Areas for improvement:**
  - Batch processing could be optimized (currently 1s delay between photos)
  - Image hash caching could be more aggressive
  - Embedding database queries could be indexed

### 8. **Code Organization**
- **Status:** Well-structured with clear separation
- **Areas for improvement:**
  - Some duplicate filtering logic (backend + frontend)
  - Could extract candidate extraction to shared module
  - Backend `server-hybrid.js` is very large (2923 lines) - could be split

### 9. **Testing**
- **Status:** No automated tests found
- **Missing:**
  - Unit tests for candidate extraction
  - Integration tests for identification pipeline
  - E2E tests for scan flow

### 10. **Documentation**
- **Status:** Extensive markdown docs, but code comments could be improved
- **Missing:**
  - JSDoc comments on key functions
  - API endpoint documentation
  - Architecture diagrams

---

## 📁 FILES WE WILL MODIFY IN LATER PHASES

### Frontend Files

**Core Services:**
- `src/services/RecordIdentificationService.ts` - Main identification service
- `src/services/BatchProcessingService.ts` - Batch processing logic

**Utils:**
- `src/utils/imageSelection.ts` - Image selection logic (✅ already unified)
- `src/utils/imageConverter.ts` - HEIC conversion (✅ working)
- `src/utils/imageResize.ts` - Vision API resizing (✅ working)

**Screens:**
- `src/screens/ScanRecordScreen.tsx` - Single scan UI
- `src/screens/BatchScanScreen.tsx` - Batch capture UI
- `src/screens/BatchReviewScreen.tsx` - Batch review UI
- `src/screens/AddRecordScreen.tsx` - Manual entry UI

**Data:**
- `src/data/repository.ts` - Database operations
- `src/data/database.ts` - Schema definitions

**Config:**
- `src/config/api.ts` - API configuration

### Backend Files

**Main Server:**
- `backend-example/server-hybrid.js` - Main Express server (2923 lines - could be split)

**Services:**
- `backend-example/services/visionExtractor.js` - Google Vision result parsing
- `backend-example/services/metadata/unifiedMetadataResolver.js` - Unified metadata fetching
- `backend-example/services/musicbrainzService.js` - MusicBrainz API client
- `backend-example/services/analyzeAlbumCover.js` - GPT-4 Vision analysis
- `backend-example/services/imageEmbedding.js` - Embedding generation
- `backend-example/services/embeddingDatabase.js` - Embedding storage/query

**Utilities:**
- Candidate extraction functions (in `server-hybrid.js`)
- Discogs search functions (in `server-hybrid.js`)
- Text normalization functions (in `server-hybrid.js`)

---

## 🔍 SPECIFIC SEARCH RESULTS

### Helper Functions Found

**Text Cleaning:**
- `normalizeText(text)` - Removes OCR noise, normalizes whitespace
- `normalizeForSearch(text)` - Removes punctuation for fuzzy matching
- `similarityScore(str1, str2)` - Levenshtein distance-based similarity

**Candidate Building:**
- `extractCandidates(text)` - Multi-strategy candidate extraction
  - Dash-separated: "Artist - Title"
  - Newline-separated: "Artist\nTitle"
  - All-caps detection
  - Word boundary splitting
- `isValidCandidate(candidate)` - Basic validation
- `isAlbumNameOnlyCandidate(candidate)` - Strict filtering

**Vision Response Parsing:**
- `processImageWithGoogleVision(imageBuffer)` - Full Vision API processing
- `visionExtractor.js` - Extracts candidates from Vision results

**Discogs Queries:**
- `searchDiscogsEnhanced(artist, title)` - Fuzzy search with similarity scoring
- `searchDiscogsByBarcode(barcode)` - Direct barcode lookup
- `getReleaseDetailsWithTracks(discogsId)` - Full release with tracklist

**MusicBrainz:**
- `searchReleaseByArtistAndTitle(artist, title)` - MB search
- `getCoverArtUrlForRelease(mbid)` - Cover Art Archive lookup

### Error/Warning Patterns Found

**Comments:**
- `// TODO: Consider using react-native-image-filter-kit` (imageResize.ts:49)
- `// Use theme spacing scale instead of undefined variable` (AddRecordScreen.tsx:416)
- Multiple `@deprecated` markers for legacy functions

**Debug Logging:**
- Extensive `console.log` statements throughout (good for debugging)
- `debugInfo` object passed through pipeline (comprehensive)
- `DEBUG_IDENTIFICATION` env var for verbose logging

**Error Handling:**
- Retry logic with exponential backoff (3 attempts)
- AbortController for cancellation
- Structured error types: `NETWORK_ERROR`, `API_ERROR`, `TIMEOUT`, `LOW_CONFIDENCE`, `INVALID_IMAGE`

---

## ✅ ARCHITECTURE COMPLIANCE CHECK

### ✅ Compliant Areas

1. **Image Selection:** ✅ Uses unified `prepareImageFields()` everywhere
2. **Suggestion Filtering:** ✅ Backend + frontend filters in place
3. **Metadata Resolution:** ✅ Uses `unifiedMetadataResolver` (MusicBrainz → CAA → Discogs)
4. **HD Cover Art:** ✅ Always prefers `coverImageRemoteUrl` over user photos
5. **Error Handling:** ✅ Comprehensive retry logic and error types

### ⚠️ Areas Needing Attention

1. **Backend Code Size:** `server-hybrid.js` is 2923 lines - could be split into modules
2. **Duplicate Filtering:** Backend and frontend both filter - could be unified
3. **Testing:** No automated tests - should add unit/integration tests
4. **Documentation:** Code comments could be more comprehensive
5. **Performance:** Batch processing delay (1s) could be optimized

---

## 📊 METRICS

- **Frontend Services:** 3 files (`RecordIdentificationService`, `BatchProcessingService`, `ShelfLightingClient`)
- **Frontend Utils:** 4 files (`imageSelection`, `imageConverter`, `imageResize`, `id`)
- **Frontend Screens:** 21 files (scan-related: `ScanRecordScreen`, `BatchScanScreen`, `BatchReviewScreen`, `AddRecordScreen`)
- **Backend Services:** 8+ service modules
- **Backend Main File:** 2923 lines (`server-hybrid.js`)
- **Database Tables:** 3 frontend (records, tracks, batch_*), 3 backend (identified_records, album_embeddings, vinyl_metadata)

---

## 🎯 NEXT STEPS (Phase 2+)

1. **Refactor Backend:** Split `server-hybrid.js` into modules
2. **Unify Filtering:** Create shared candidate filtering module
3. **Add Tests:** Unit tests for candidate extraction, filtering, normalization
4. **Performance:** Optimize batch processing, add caching
5. **Documentation:** Add JSDoc comments, API docs
6. **Error UX:** Improve user-facing error messages
7. **Monitoring:** Add metrics/analytics for identification success rates

---

**End of Phase 1 Audit**

