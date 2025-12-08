# Album Cover Identification System - Complete Documentation

## Overview

SlotSync uses a **multi-layered identification pipeline** to identify vinyl album covers from photos. The system combines Google Vision API for image analysis, Discogs API for metadata resolution, and local database caching for performance.

---

## Complete Identification Flow

```
┌─────────────────────────────────────────────────────────────┐
│                   1. USER CAPTURES PHOTO                     │
│  (Using camera in ScanRecordScreen.tsx)                      │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│        2. FRONTEND PREPROCESSES IMAGE                       │
│  • Converts HEIC to JPEG (if needed)                        │
│  • Resizes to ~1024x1024                                    │
│  • Generates image hash for caching                         │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│        3. APP SENDS PHOTO TO BACKEND                        │
│  • Creates FormData with image file                        │
│  • POST to: /api/identify-record                            │
│  • Image sent as multipart/form-data                        │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│        4. BACKEND CHECKS LOCAL CACHE                        │
│  • Queries database by image hash                           │
│  • If found → return cached result (instant)                │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼ (if not cached)
┌─────────────────────────────────────────────────────────────┐
│    5. GOOGLE VISION API - IMAGE ANALYSIS                    │
│                                                              │
│  Uses THREE detection methods simultaneously:              │
│                                                              │
│  A. WEB DETECTION (Primary)                                 │
│     • Finds visually similar images on the web              │
│     • Extracts metadata from web pages                      │
│     • Looks for patterns like "Artist - Album"              │
│     • Checks web entities and page titles                    │
│                                                              │
│  B. LABEL DETECTION (Context)                               │
│     • Identifies objects/labels in image                    │
│     • Confirms it's music-related content                   │
│     • Helps validate it's an album cover                    │
│                                                              │
│  C. TEXT DETECTION / OCR (Fallback)                         │
│     • Extracts readable text from image                     │
│     • Reads artist name, album title                        │
│     • Parses text to find artist/title patterns             │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│        6. CANDIDATE EXTRACTION                              │
│  • Extracts 8-15 candidate {artist, title} pairs           │
│  • Filters out non-album content (Wikipedia, URLs, etc.)  │
│  • Cleans e-commerce text and UI elements                  │
│  • Applies OCR typo fixes                                   │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│        7. DISCOGS API SEARCH                                │
│  • For each candidate, generates multiple query variants    │
│  • Tries: "Artist Album", artist:"Artist" title:"Album"    │
│  • Stops early on high-confidence match                     │
│  • Only accepts actual album releases                       │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│        8. METADATA RESOLUTION                               │
│  • Extracts: artist, title, year, tracklist, Discogs ID     │
│  • Optionally: MusicBrainz ID, Cover Art Archive URL        │
│  • Calculates confidence score                              │
└───────────────────────┬─────────────────────────────────────┘
                        │
                        ▼
┌─────────────────────────────────────────────────────────────┐
│        9. CACHE & RETURN                                    │
│  • Saves result to local database with image hash          │
│  • Returns JSON response to frontend                         │
│  • Frontend displays album info and tracklist               │
└─────────────────────────────────────────────────────────────┘
```

---

## Key Files & Components

### Backend Files

#### 1. `backend-example/server-hybrid.js`
**Purpose**: Main Express.js backend server that handles identification requests

**Key Functions**:
- `initDatabase()` - Initializes SQLite database for caching
- `generateCandidatesFromInput(imageBuffer, imageHash)` - Main identification orchestrator
- `extractCandidates(webEntities, ocrText, labels)` - Extracts artist/title candidates from Vision results
- `normalizeText(text)` - Cleans and normalizes extracted text
- `cleanEcommerceText(text)` - Removes e-commerce noise (prices, shipping, etc.)
- `searchDiscogsByBarcode(barcode)` - Barcode scanning support
- `isValidCandidate(artist, title)` - Filters out non-album candidates

**API Endpoints**:
- `POST /api/identify-record` - Main identification endpoint
- `POST /api/identify-by-text` - Manual entry (artist + title)
- `GET /api/ping` - Health check

**Configuration**:
- `CONFIDENCE_THRESHOLD` - Global confidence threshold (default: 0.5)
- `DISCOGS_PERSONAL_ACCESS_TOKEN` - Discogs API token
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to Google Vision credentials JSON

---

### Frontend Service Files

#### 2. `src/services/RecordIdentificationService.ts`
**Purpose**: Legacy/compatibility layer for record identification

**Key Functions**:
- `identifyRecord(imageUri, abortSignal?)` - Main identification function (calls backend)
- `identifyRecordByText(artist, title, abortSignal?)` - Manual entry lookup
- `identifyRecordByBarcode(barcode, abortSignal?)` - Barcode scanning
- `normalizeScanResult(response)` - Normalizes backend response to frontend format

**Types**:
- `IdentificationMatch` - Album match with metadata
- `IdentificationResponse` - Complete identification response
- `ScanResult` - Normalized scan result for UI

---

#### 3. `src/services/identification/orchestrator.ts`
**Purpose**: High-level identification orchestrator (future use)

**Key Functions**:
- `identifyAlbumFromImage(imageUri, options?)` - Orchestrates full identification pipeline

**Note**: Currently, frontend calls backend directly via `RecordIdentificationService.ts`

---

#### 4. `src/services/vision/` (DEV-ONLY)
**Purpose**: Client-side Vision service (marked as DEV-ONLY, backend is source of truth)

**Files**:
- `visionService.ts` - Image preprocessing and Vision API calls
- `candidateExtractor.ts` - Candidate extraction from Vision results
- `types.ts` - TypeScript interfaces

**Note**: These are for development/testing only. Production uses backend.

---

#### 5. `src/services/metadata/` (DEV-ONLY)
**Purpose**: Client-side metadata resolution (marked as DEV-ONLY)

**Files**:
- `discogsClient.ts` - Discogs API client
- `musicbrainzClient.ts` - MusicBrainz API client
- `caaClient.ts` - Cover Art Archive client
- `metadataResolver.ts` - Orchestrates metadata resolution

**Note**: These are for development/testing only. Production uses backend.

---

### Configuration Files

#### 6. `src/config/api.ts`
**Purpose**: API endpoint configuration

**Key Configuration**:
- `EXPO_PUBLIC_API_BASE_URL` - Backend server URL (REQUIRED)
- `API_CONFIG.ENDPOINTS` - All API endpoint paths
- `API_CONFIG.TIMEOUT` - Request timeout (90 seconds)

**Important**: Physical devices need LAN IP address, not localhost!

---

### Utility Files

#### 7. `src/utils/imageHash.ts`
**Purpose**: Generates unique hash from image for caching

**Key Function**:
- `generateImageHash(imageUri)` - Generates FNV-1a hash from image buffer

---

#### 8. `src/utils/imageSelection.ts`
**Purpose**: Unified image selection logic (prioritizes HD covers over user photos)

**Key Functions**:
- `prepareImageFields(coverImageRemoteUrl, capturedUri)` - Prepares image fields for database
- `getCoverImageUri(coverImageRemoteUrl, coverImageLocalUri)` - Gets best available cover image

---

### Database Files

#### 9. `src/data/database.ts`
**Purpose**: SQLite database schema and initialization

**Key Tables**:
- `records` - Album records with metadata
- `image_hashes` - Maps image hashes to records (for caching)
- `tracks` - Track listings for albums
- `playlists` - User playlists
- `playlist_items` - Playlist items (albums and songs)

---

#### 10. `src/data/repository.ts`
**Purpose**: Database repository functions

**Key Functions**:
- `findRecordByImageHash(hash)` - Finds cached record by image hash
- `createRecord(recordData)` - Creates new record
- `getTracksByRecord(recordId)` - Gets tracks for an album
- `saveImageHash(hash, recordId, submittedImagePath)` - Saves image hash mapping

---

### UI Files

#### 11. `src/screens/ScanRecordScreen.tsx`
**Purpose**: Main scanning screen where users capture photos

**Key Features**:
- Camera integration (expo-camera)
- Image picker support
- Barcode scanning
- Manual entry option
- Displays identification results
- Handles "Looks Good" confirmation

---

#### 12. `src/screens/AddRecordScreen.tsx`
**Purpose**: Manual record entry screen

**Key Features**:
- Manual artist/title input
- Metadata lookup via `identifyRecordByText()`
- Track editing
- Cover image selection

---

## APIs Used

### 1. Google Cloud Vision API
**Purpose**: Image analysis and text extraction

**Features Used**:
- **Web Detection**: Finds visually similar images on the web
- **Text Detection (OCR)**: Extracts readable text from images
- **Label Detection**: Identifies objects/labels in images

**Setup Required**:
1. Google Cloud Project with Vision API enabled
2. Service account credentials JSON file
3. Set `GOOGLE_APPLICATION_CREDENTIALS` environment variable

**Documentation**: https://cloud.google.com/vision/docs

**Cost**: Pay-per-use (first 1,000 requests/month free)

---

### 2. Discogs API
**Purpose**: Primary source for vinyl record metadata

**Features Used**:
- **Search API**: Search releases by artist/title
- **Release API**: Get detailed release information
- **Barcode Search**: Direct lookup by UPC/EAN

**Setup Required**:
1. Discogs account
2. Personal Access Token (generate at https://www.discogs.com/settings/developers)
3. Set `DISCOGS_PERSONAL_ACCESS_TOKEN` environment variable

**Documentation**: https://www.discogs.com/developers

**Rate Limits**: 60 requests/minute (generous for normal use)

**Cost**: Free (with rate limits)

---

### 3. MusicBrainz API (Optional)
**Purpose**: Canonical music metadata and IDs

**Features Used**:
- **Release Search**: Find MusicBrainz release by artist/title
- **Release Details**: Get canonical metadata
- **Cover Art Archive**: Link to high-quality cover art

**Setup Required**: None (public API)

**Documentation**: https://musicbrainz.org/doc/MusicBrainz_API

**Rate Limits**: 1 request/second (respectful use)

**Cost**: Free

---

### 4. Cover Art Archive (CAA)
**Purpose**: High-quality album cover images

**Features Used**:
- **Release Images**: Get cover art by MusicBrainz Release ID
- **HD Images**: Front cover at various resolutions (500, 1200, etc.)

**Setup Required**: None (public API)

**Documentation**: https://musicbrainz.org/doc/Cover_Art_Archive/API

**Cost**: Free

---

## Configuration Requirements

### Backend Environment Variables

```bash
# Required
DISCOGS_PERSONAL_ACCESS_TOKEN=your_discogs_token_here
GOOGLE_APPLICATION_CREDENTIALS=/path/to/google-credentials.json

# Optional
CONFIDENCE_THRESHOLD=0.5  # Default: 0.5 (0.0-1.0)
PORT=3000                  # Default: 3000
```

### Frontend Configuration

**File**: `app.json` or `.env`

```json
{
  "extra": {
    "EXPO_PUBLIC_API_BASE_URL": "http://192.168.1.215:3000"
  }
}
```

**Important**: 
- Physical devices need LAN IP address (not localhost)
- Find your IP: `ifconfig | grep "inet " | grep -v 127.0.0.1`

---

## Key Algorithms & Strategies

### 1. Candidate Extraction Strategies

The system uses **multiple strategies** to extract artist/title pairs:

1. **Web Entity Patterns**: Extracts from web page titles/descriptions
2. **OCR Line-Based**: Parses text line by line
3. **Dash/Separator Patterns**: Looks for "Artist - Title" patterns
4. **Tracklist Extraction**: Extracts from tracklist text (e.g., "LANA DEL REY ... BORN TO DIE")
5. **Frequent Word Analysis**: Finds artist names that appear multiple times

### 2. Text Cleaning

**Functions**:
- `cleanEcommerceText()` - Removes prices, shipping info, store names
- `normalizeText()` - Fixes OCR typos, normalizes whitespace
- **OCR Typo Fixes**: "LANA DEL RET" → "LANA DEL REY", "TAYLOR" → "TAYLOR SWIFT"

### 3. Discogs Query Variants

For each candidate, generates multiple query formats:
- `"Artist Album"`
- `artist:"Artist" title:"Album"`
- `"Artist" "Album"`
- Catalog number search (if available)

### 4. Confidence Scoring

**Factors**:
- Google Vision entity scores
- Discogs match quality
- Text extraction confidence
- Multiple source agreement

**Threshold**: `CONFIDENCE_THRESHOLD` (default: 0.5)

---

## Error Handling

### Error Types

1. **NO_CANDIDATES_FROM_VISION**: No valid candidates extracted
   - **Logs**: Image hash, top OCR text
   - **User Action**: Try better photo or manual entry

2. **NO_DISCOGS_MATCH**: No Discogs match found
   - **Logs**: Candidate artist/title, query variants
   - **User Action**: Manual entry or check spelling

3. **LOW_CONFIDENCE_REJECTED**: Match found but below threshold
   - **Logs**: Best candidate, confidence score
   - **Response**: Returns `albumSuggestions` array for user review

4. **TIMEOUT**: Request took too long
   - **User Action**: Retry or check network

---

## Caching Strategy

### Image Hash Caching

1. **Generate Hash**: FNV-1a hash from image buffer
2. **Check Cache**: Query `image_hashes` table by hash
3. **If Found**: Return cached record immediately (instant)
4. **If Not Found**: Run full identification pipeline
5. **Save Result**: Store in database with image hash for future lookups

**Benefits**:
- Instant results for previously identified albums
- Reduces API calls (cost savings)
- Works offline for cached albums

---

## Performance Optimizations

1. **Early Exit**: Stops searching on high-confidence match
2. **Parallel Processing**: Multiple Vision features run simultaneously
3. **Caching**: Image hash lookup before API calls
4. **Query Limits**: Limits Discogs queries per candidate
5. **Timeout Handling**: 90-second timeout prevents hanging

---

## Testing & Debugging

### Debug Logging

**Backend**: Logs include:
- Image hash
- Top Vision web entities and OCR lines
- Generated candidates
- Top Discogs matches
- Final resolved album
- Confidence scores

**Frontend**: Console logs in `RecordIdentificationService.ts`

### Test Harness

**File**: `src/services/testHarness.ts` (DEV-ONLY)
- Allows testing with specific images
- Displays detailed debug output

---

## Common Issues & Solutions

### Issue: "Cannot identify album"
**Solutions**:
1. Ensure good lighting and clear photo
2. Check that album cover is fully visible
3. Try manual entry as fallback
4. Check backend logs for specific error

### Issue: "Network request failed"
**Solutions**:
1. Verify backend server is running
2. Check `EXPO_PUBLIC_API_BASE_URL` is set correctly
3. Ensure device and computer are on same Wi-Fi
4. Check firewall settings

### Issue: "Low confidence" / Wrong album
**Solutions**:
1. Review suggestions in UI
2. Select correct album from suggestions
3. Use manual entry if needed
4. Adjust `CONFIDENCE_THRESHOLD` if too strict/lenient

---

## Future Enhancements

1. **MusicBrainz Integration**: Full MusicBrainz release lookup
2. **Cover Art Archive**: HD cover art fetching
3. **Batch Processing**: Identify multiple albums at once
4. **Offline Mode**: Full offline identification (challenging)
5. **Machine Learning**: Direct image-to-album matching (future)

---

## File Structure Summary

```
SlotSync/
├── backend-example/
│   └── server-hybrid.js          # Main backend server
├── src/
│   ├── services/
│   │   ├── RecordIdentificationService.ts  # Frontend service
│   │   ├── identification/
│   │   │   └── orchestrator.ts   # High-level orchestrator
│   │   ├── vision/               # DEV-ONLY Vision service
│   │   └── metadata/            # DEV-ONLY Metadata resolvers
│   ├── config/
│   │   └── api.ts                # API configuration
│   ├── utils/
│   │   ├── imageHash.ts          # Image hashing
│   │   └── imageSelection.ts     # Image selection logic
│   ├── data/
│   │   ├── database.ts           # Database schema
│   │   └── repository.ts         # Database functions
│   └── screens/
│       ├── ScanRecordScreen.tsx  # Main scanning UI
│       └── AddRecordScreen.tsx   # Manual entry UI
└── Album_ID.md                   # This file
```

---

## Quick Reference

### Main Identification Function
```typescript
// Frontend
import { identifyRecord } from './services/RecordIdentificationService';
const result = await identifyRecord(imageUri);
```

### Backend Endpoint
```bash
POST /api/identify-record
Content-Type: multipart/form-data
Body: { image: File }
```

### Key Configuration
- `CONFIDENCE_THRESHOLD`: 0.5 (adjustable)
- `EXPO_PUBLIC_API_BASE_URL`: Required for frontend
- `DISCOGS_PERSONAL_ACCESS_TOKEN`: Required for backend
- `GOOGLE_APPLICATION_CREDENTIALS`: Required for backend

---

**Last Updated**: 2024
**Version**: 1.0

