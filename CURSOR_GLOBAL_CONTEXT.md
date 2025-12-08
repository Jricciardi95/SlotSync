# 🧠 SlotSync Global Context Prompt

**Paste this first in Cursor when starting a new session**

---

## Prompt: SlotSync Global Context

You are working inside a React Native / Expo TypeScript project called **SlotSync**.

### Goal of SlotSync

SlotSync is an app for vinyl collectors. The main feature is:

1. A user takes a photo of a vinyl album cover with their phone
2. The app positively identifies the album and returns:
   - Artist
   - Album title
   - Release year
   - Genre
   - Track list (Side A / Side B separated when possible)
   - A high-quality HD cover image (never the user's raw photo unless absolutely necessary)

### Data Sources / APIs in the Overall Architecture

- **Google Vision API** (Web Detection + OCR + Labels)
- **Discogs API** (vinyl-focused metadata + tracklists)
- **MusicBrainz API** (canonical IDs + normalized metadata)
- **Cover Art Archive** (HD cover images by MusicBrainz release ID)
- **SlotSync's own local database & caching layer**

### Absolute Rules

1. **Suggestions / alternates must only be actual album titles, never:**
   - Wikipedia article titles
   - "Top 20 albums"-style lists
   - Editorial pages or reviews
   - URLs, social media posts, blog articles

2. **When a canonical HD cover is available from Cover Art Archive or Discogs, the app must show that instead of the user's uploaded photo.**

3. **Over time, SlotSync's own DB should make future recognitions instant based on image hash / previous matches.**

### Your Job as Cursor in This Repo

1. **Understand the current codebase structure** under `src/`
2. **Audit and improve the entire album identification flow:**
   ```
   Photo → Google Vision → candidate extraction → Discogs → MusicBrainz → CAA → SlotSync DB → UI
   ```
3. **Fix bugs, architecture issues, require cycles, and UI errors** (like spacing undefined)
4. **Make the pipeline:**
   - **Accurate** (robust identification, fewer bad suggestions)
   - **Fast** (caching, fewer unnecessary calls)
   - **Stable** (good error handling, no crashes)
   - **Scalable** (modular services / clean separation of concerns)

### Phase-Based Workflow

I will provide phase-based prompts (Phase 1 → Phase 5). For each phase, you should:

1. **Read and understand the existing files**
2. **Explain what you see**
3. **Propose improvements**
4. **Then actually edit/create the necessary code files in this repo**

---

## Key Files & Structure

### Frontend (`src/`)
- **`src/screens/`** - React Native screens (ScanRecordScreen, AddRecordScreen, etc.)
- **`src/services/`** - Business logic services
  - `RecordIdentificationService.ts` - API calls, retry logic, suggestion filtering
  - `BatchProcessingService.ts` - Background batch processing
  - `ShelfLightingClient.ts` - Shelf lighting control
- **`src/utils/`** - Utility functions
  - `imageSelection.ts` - **CRITICAL**: Unified image selection logic (remote > local > placeholder)
  - `imageConverter.ts` - HEIC to JPEG conversion
  - `imageResize.ts` - Image resizing for Vision API
- **`src/data/`** - Database layer (SQLite)
- **`src/components/`** - Reusable UI components
- **`src/theme/`** - Theme system (colors, spacing, typography)

### Backend (`backend-example/`)
- **`server-hybrid.js`** - Main Express server
- **`services/`** - Backend service modules
  - `metadata/unifiedMetadataResolver.js` - **CRITICAL**: Unified metadata fetching (MusicBrainz + Discogs + CAA)
  - `musicbrainzService.js` - MusicBrainz API client
  - `visionExtractor.js` - Google Vision result parsing
  - `analyzeAlbumCover.js` - GPT-4 Vision analysis
- **Endpoints:**
  - `POST /api/identify-record` - Image/barcode identification
  - `POST /api/identify-by-text` - Text-based lookup (uses unified resolver)
  - `GET /api/discogs/release/:id` - Discogs release details
  - `GET /api/metadata/resolve-by-text` - Unified metadata resolution

### Critical Implementation Details

1. **Image Selection Rule (ENFORCED EVERYWHERE):**
   - If `coverImageRemoteUrl` exists → use it, set `coverImageLocalUri` to `null`
   - If no `coverImageRemoteUrl` → use `coverImageLocalUri` if available
   - Helper: `src/utils/imageSelection.ts` → `prepareImageFields()`

2. **Suggestion Filtering (ENFORCED EVERYWHERE):**
   - Backend: `isAlbumNameOnlyCandidate()` in `server-hybrid.js`
   - Frontend: `looksLikeRealAlbumTitle()` in `RecordIdentificationService.ts`
   - Rejects: URLs, Wikipedia, reviews, social media, article titles

3. **Unified Metadata Resolver:**
   - Always uses MusicBrainz → Cover Art Archive → Discogs
   - Always returns HQ cover art from APIs
   - Never uses user photos as final artwork

4. **Navigation Fix:**
   - EditRecordScreen uses `navigation.navigate('RecordDetail', { recordId })` instead of `goBack()`
   - Prevents "Album not found" errors

---

## Recent Changes (Context)

### Image Selection Unified (Latest)
- Created `src/utils/imageSelection.ts` with unified helper functions
- Updated all record creation flows to use `prepareImageFields()`
- Updated all UI display logic to use `getCoverImageUri()`
- Rule: `coverImageRemoteUrl` > `coverImageLocalUri` > placeholder

### Suggestion Quality Fixed
- Enhanced backend filtering (`isAlbumNameOnlyCandidate`)
- Added frontend safety filter (`looksLikeRealAlbumTitle`)
- Applied filtering in all candidate generation paths

### Manual Lookup & CSV Import
- `/api/identify-by-text` uses unified resolver
- CSV import enriches metadata via unified resolver
- Auto-fills: year, tracks, HD cover art

### Navigation Fixed
- EditRecordScreen uses explicit navigation
- RecordDetailScreen has `hasLoadedOnce` logic
- Prevents "Album not found" after editing

---

## Environment Variables

### Frontend (`.env`)
- `EXPO_PUBLIC_API_BASE_URL` - Backend API URL (must be LAN IP, not localhost)

### Backend (`backend-example/.env`)
- `DISCOGS_PERSONAL_ACCESS_TOKEN` - Discogs API token
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to Google Vision credentials JSON
- `OPENAI_API_KEY` - OpenAI API key (for GPT-4 Vision)
- `ENABLE_GOOGLE_VISION` - Enable/disable Google Vision
- `ENABLE_GPT4_VISION` - Enable/disable GPT-4 Vision
- `ENABLE_VINYL_VISION` - Enable/disable Vinyl Vision analysis
- `CONFIDENCE_THRESHOLD` - Identification confidence threshold (default: 0.5)

---

## Testing

### Start Backend
```bash
cd backend-example
node server-hybrid.js
```

### Start Frontend
```bash
export EXPO_PUBLIC_API_BASE_URL='http://YOUR_LAN_IP:3000'
npx expo start --clear
```

### Test Image Selection
- Scan album → should use HD cover art (check backend logs for `[ImageSelection]` messages)
- Manual add → lookup metadata → should use HD cover art
- CSV import → should enrich with HD cover art

---

**Ready for Phase 1 prompt...**

