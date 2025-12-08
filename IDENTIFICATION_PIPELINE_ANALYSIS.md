# SlotSync Album Cover Identification Pipeline - Detailed Analysis

## Overview

SlotSync uses a **multi-phase, multi-source identification pipeline** that combines:
- **Google Vision API** (OCR, Web Detection, Labels)
- **Discogs API** (Primary metadata source)
- **MusicBrainz API** (Fallback & enrichment)
- **Cover Art Archive (CAA)** (HD cover art)
- **Local SQLite Database** (Caching)

The system is designed to be **robust, fast, and accurate**, with strict filtering to ensure only real album releases are suggested (never Wikipedia pages, listicles, or editorial content).

---

## Architecture: Frontend + Backend

### Frontend (React Native/Expo)
- **Location**: `src/services/identification/orchestrator.ts`
- **Role**: High-level orchestration, caching, candidate extraction
- **Key Functions**:
  - Image hash generation & cache lookup
  - Image preprocessing
  - Candidate extraction from Vision results
  - Metadata resolution coordination

### Backend (Node.js/Express)
- **Location**: `backend-example/server-hybrid.js`
- **Role**: Google Vision API calls, Discogs/MusicBrainz integration
- **Key Functions**:
  - Google Vision API processing
  - Discogs search & release fetching
  - MusicBrainz enrichment
  - Cover Art Archive fetching

---

## Complete Identification Flow

### **PHASE 0: User Action & Image Capture**

1. **User takes photo** or selects image from library
2. **Image stored locally** (temporary file URI)
3. **Scan button pressed** → triggers identification

**Entry Point**: `src/screens/ScanRecordScreen.tsx` → calls `identifyRecord()` from `RecordIdentificationService.ts`

---

### **PHASE 1: Frontend Orchestration** (`orchestrator.ts`)

#### Step 1.1: Image Validation
```typescript
// File: src/services/identification/orchestrator.ts:169-184
- Check file exists
- Validate file size (< 10MB)
- Check file format (JPEG, PNG, HEIC supported)
```

#### Step 1.2: Generate Image Hash
```typescript
// File: src/utils/imageHash.ts
- Read image file buffer
- Generate FNV-1a hash (fast, deterministic)
- Used for cache lookups
```

#### Step 1.3: Check Local Cache
```typescript
// File: src/services/identification/orchestrator.ts:194-207
- Query database: SELECT * FROM records WHERE image_hash = ?
- If found: Return cached result immediately (confidence: 1.0)
- If not found: Continue to full pipeline
```

**Cache Hit**: Returns in ~10-50ms  
**Cache Miss**: Continues to Vision API

#### Step 1.4: Image Preprocessing
```typescript
// File: src/services/vision/visionService.ts:32-69
1. Convert HEIC/PNG → JPEG (if needed)
   - Uses expo-image-manipulator
   - Initial resize to 1200px max
   
2. Resize to optimal size
   - Target: 1024x1024 max
   - Quality: 0.85
   - Reduces upload time without losing accuracy
   
3. Optional enhancements (if enabled)
   - Contrast enhancement
   - Grayscale conversion
```

**Result**: Preprocessed JPEG ready for Vision API

---

### **PHASE 2: Backend Vision Processing** (`server-hybrid.js`)

#### Step 2.1: Receive Image
```javascript
// File: backend-example/server-hybrid.js:1969
- Endpoint: POST /api/identify-record
- Multer middleware handles file upload
- Image stored in memory buffer
```

#### Step 2.2: Google Vision API Call
```javascript
// File: backend-example/server-hybrid.js:1474-1485
- Calls: processImageWithGoogleVision(imageBuffer)
- Features requested:
  * TEXT_DETECTION (OCR)
  * WEB_DETECTION (web entities, similar images, page titles)
  * LABEL_DETECTION (object recognition)
```

**Google Vision Response Structure**:
```javascript
{
  textAnnotations: [...],        // OCR text blocks
  webDetection: {
    webEntities: [...],          // Detected entities (e.g., "The Beatles", "Abbey Road")
    pagesWithMatchingImages: [...], // Web pages with similar images
    visuallySimilarImages: [...]    // Similar image URLs
  },
  labelAnnotations: [...]         // Object labels (e.g., "Album Cover", "Vinyl Record")
}
```

#### Step 2.3: Extract Vision Data
```javascript
// File: backend-example/server-hybrid.js:750-850
- Extract OCR text (normalized, cleaned)
- Extract web entities (sorted by score)
- Extract page titles (often more accurate than entities)
- Extract similar image URLs
- Build structured VisionResult object
```

**VisionResult Structure**:
```javascript
{
  extractedText: "THE BEATLES\nABBEY ROAD",
  ocrTextBlocks: [
    { text: "THE BEATLES", confidence: 0.95 },
    { text: "ABBEY ROAD", confidence: 0.92 }
  ],
  webEntities: [
    { description: "Abbey Road", score: 0.98 },
    { description: "The Beatles", score: 0.95 }
  ],
  pageTitles: [
    { url: "https://...", pageTitle: "The Beatles - Abbey Road" }
  ],
  similarImageUrls: [...],
  labels: [...]
}
```

#### Step 2.4: Primary Candidate Extraction (Backend)
```javascript
// File: backend-example/server-hybrid.js:1495-1505
- Uses visionExtractor.extractArtistTitleFromVision()
- Extracts primary { artist, title } pair
- Confidence: 0.9
- Source: 'vision_primary'
```

#### Step 2.5: Secondary Candidate Extraction
```javascript
// File: backend-example/server-hybrid.js:1508-1532
- Extract from OCR text (if available)
- Extract from VisionResult.candidates
- Filter: confidence >= 0.3
- Filter: isAlbumNameOnlyCandidate() (removes URLs, Wikipedia, etc.)
- Limit: 5 candidates max
```

**Filtering Rules** (prevents non-album suggestions):
- ❌ Blocked hostnames: wikipedia.org, reddit.com, pinterest.com, etc.
- ❌ Non-album patterns: "best album covers", "top 10", "review", etc.
- ❌ URL patterns: http://, www., .com, etc.
- ❌ Wiki patterns: "wiki/", "(album)", "(band)", etc.

#### Step 2.6: MusicBrainz OCR Fallback (Last Resort)
```javascript
// File: backend-example/server-hybrid.js:1552-1588
- Only if: candidates.length === 0 AND OCR text exists
- Extract keywords from OCR
- Search MusicBrainz: searchReleaseByArtistAndTitle(null, words)
- If found: Add as candidate (confidence: 0.5)
```

---

### **PHASE 3: Candidate Resolution** (`server-hybrid.js`)

#### Step 3.1: Sort Candidates by Confidence
```javascript
// File: backend-example/server-hybrid.js:1649-1776
- Sort: highest confidence first
- Process candidates in order
```

#### Step 3.2: Discogs Search (Per Candidate)
```javascript
// File: backend-example/server-hybrid.js:1669-1752
For each candidate:
  1. Generate multiple query variants:
     - "Artist Album"
     - artist:"Artist" title:"Album"
     - Cleaned versions (remove "Remastered", "Deluxe", etc.)
     - Without "The" prefix
     - Without trailing punctuation
     - Handle possessives ("B-52's" → "B-52s")
  
  2. Search Discogs API (up to 5 queries per candidate)
     - Endpoint: https://api.discogs.com/database/search
     - Prefer vinyl releases (if preferVinyl = true)
     - Filter: isValidDiscogsRelease() (removes lists, articles)
  
  3. Calculate similarity score:
     - Fuzzy match: artist + title
     - Levenshtein distance
     - Confidence = 1.0 - (distance / maxLength)
  
  4. If confidence >= threshold (0.5):
     - Fetch full Discogs release details
     - Extract: artist, title, year, discogsId, tracks, coverImageUrl
     - Return as best match
```

**Discogs Query Variants Example**:
```
Candidate: "The B-52's" - "Party Mix!"
Queries:
  1. "The B-52's Party Mix!"
  2. artist:"The B-52's" title:"Party Mix!"
  3. "B-52's Party Mix!" (removed "The")
  4. "B-52s Party Mix" (removed apostrophe, exclamation)
  5. "B-52's Party Mix" (removed exclamation)
```

#### Step 3.3: MusicBrainz Enrichment (Optional)
```javascript
// File: backend-example/server-hybrid.js:1716-1730
- If candidate has no MusicBrainz MBID:
  - Search MusicBrainz: searchReleaseByArtistAndTitle(artist, title)
  - If found: Attach MBID to candidate
- Used later for CAA cover art fetching
```

#### Step 3.4: Select Best Match
```javascript
// File: backend-example/server-hybrid.js:1757-1776
- Check: bestConfidence >= CONFIDENCE_THRESHOLD (default: 0.5)
- If yes: Return bestAlbum
- If no: Return null (identification failed)
```

---

### **PHASE 4: Metadata Enrichment** (`server-hybrid.js`)

#### Step 4.1: Unified Resolver (Primary Path)
```javascript
// File: backend-example/server-hybrid.js:1786-1824
- Calls: resolveAlbumMetadata(artist, title)
- Returns: Complete metadata with HQ cover art
- Always uses API cover art (never user photo)
```

#### Step 4.2: Discogs Release Details (Fallback)
```javascript
// File: backend-example/server-hybrid.js:1847-1906
If unified resolver fails:
  1. Fetch full Discogs release:
     - Endpoint: GET https://api.discogs.com/releases/{discogsId}
     - Extract: year, genres, styles, tracklist, coverImageUrl
  
  2. Extract tracks:
     - Parse position: "A1", "B2", "1", "1-1"
     - Extract side (A/B) and track number
     - Extract duration (if available)
  
  3. Extract cover image:
     - Use Discogs image URL (HQ)
     - Never use user photo
```

#### Step 4.3: MusicBrainz Enrichment
```javascript
// File: backend-example/server-hybrid.js:1908-1937
If MusicBrainz MBID exists:
  1. Fetch release details: getReleaseDetailsWithTracks(mbid)
  2. Use MusicBrainz tracks if Discogs has none
  3. Use MusicBrainz year if missing
```

#### Step 4.4: Cover Art Archive (CAA) Fallback
```javascript
// File: backend-example/server-hybrid.js:1939-1952
If no cover art OR placeholder image:
  1. Fetch from CAA: getCoverArtUrlForRelease(mbid)
  2. Prefer front cover images
  3. Prefer 500px thumbnail (falls back to 250px, 1200px, or full)
  4. Update: primary.coverImageUrl = caaUrl
```

**Cover Art Priority**:
1. **Discogs cover art** (primary)
2. **Cover Art Archive** (fallback if Discogs missing/placeholder)
3. **MusicBrainz** (last resort)
4. **Never**: User photo (always rejected)

---

### **PHASE 5: Frontend Candidate Extraction** (`candidateExtractor.ts`)

**Note**: Currently, the backend does most candidate extraction. The frontend extractor is available for:
- Future client-side preview
- Re-extraction if backend returns raw Vision results
- Testing/development

```typescript
// File: src/services/vision/candidateExtractor.ts
- Extracts candidates from VisionResult
- Multiple strategies:
  * Web entities (high confidence)
  * OCR text blocks (pattern matching)
  * Page titles (often most accurate)
  * Combined patterns
- Strict filtering (same rules as backend)
```

---

### **PHASE 6: Metadata Resolution** (`metadataResolver.ts`)

**Note**: Currently, the backend does most metadata resolution. The frontend resolver is available for:
- Future client-side resolution
- Testing/development

```typescript
// File: src/services/metadata/metadataResolver.ts
- Takes candidates from frontend
- Searches Discogs (via backend proxy)
- Fetches MusicBrainz MBID
- Fetches CAA cover art
- Returns ResolvedAlbum
```

---

### **PHASE 7: Response & Caching**

#### Step 7.1: Format Response
```javascript
// File: backend-example/server-hybrid.js:2146-2177
Response structure:
{
  success: true,
  confidence: 0.95,
  artist: "The Beatles",
  albumTitle: "Abbey Road",
  releaseYear: 1969,
  discogsId: "12345",
  coverImageUrl: "https://...",
  tracks: [
    { position: 1, title: "Come Together", side: "A" },
    ...
  ],
  visionResult: { ... }  // For frontend candidate extraction
}
```

#### Step 7.2: Save to Cache
```typescript
// File: src/services/identification/orchestrator.ts:291-302
- Generate image hash
- Save to database:
  * records table: artist, title, year, discogsId, musicbrainzId, coverImageRemoteUrl
  * tracks table: track list with side/position
  * image_hashes table: hash → recordId mapping
```

**Cache Benefits**:
- **Instant results** for repeat scans (same image)
- **Offline support** (if image was previously identified)
- **Reduced API calls** (saves Discogs/MusicBrainz quota)

---

## Key Design Decisions

### 1. **Strict Filtering**
- **Why**: Prevents Wikipedia pages, listicles, and editorial content from being suggested
- **How**: Multiple filter layers (hostname blocking, pattern matching, URL detection)
- **Result**: Only real album releases are suggested

### 2. **Multi-Source Fallbacks**
- **Why**: No single source is 100% reliable
- **How**: Discogs → MusicBrainz → CAA chain
- **Result**: Higher success rate, better metadata coverage

### 3. **Query Variants**
- **Why**: Artist/album names have many variations
- **How**: Generate 5-8 query variants per candidate
- **Result**: Better matching for edge cases (possessives, punctuation, "The" prefix)

### 4. **Confidence Scoring**
- **Why**: Not all matches are equal
- **How**: Fuzzy matching + Levenshtein distance
- **Result**: Only high-confidence matches are returned

### 5. **Caching Strategy**
- **Why**: Speed + cost savings
- **How**: Image hash → database lookup
- **Result**: Instant results for repeat scans

### 6. **HQ Cover Art Priority**
- **Why**: User photos are low quality, API art is HD
- **How**: Always prefer Discogs/CAA cover art
- **Result**: Better visual quality in app

---

## Performance Characteristics

### **Cache Hit** (Best Case)
- **Time**: ~10-50ms
- **API Calls**: 0
- **User Experience**: Instant

### **Cache Miss** (Typical Case)
- **Time**: ~3-8 seconds
- **API Calls**:
  - Google Vision: 1
  - Discogs: 2-5 (search + release details)
  - MusicBrainz: 0-1 (optional)
  - CAA: 0-1 (optional)
- **User Experience**: Loading spinner, then result

### **Slow Case** (Network Issues)
- **Time**: ~10-30 seconds
- **API Calls**: Same as typical, but with retries
- **User Experience**: Longer loading, timeout possible

---

## Error Handling

### **No Candidates Extracted**
- **Error Code**: `NO_CANDIDENCES`
- **Message**: "Could not extract any album candidates from image"
- **User Action**: Try better lighting, clearer image, or manual entry

### **Low Confidence Match**
- **Error Code**: `LOW_CONFIDENCE`
- **Message**: "Could not identify album with sufficient confidence"
- **User Action**: Review suggested candidates or manual entry

### **API Errors**
- **Error Code**: `API_ERROR`
- **Message**: Specific API error message
- **User Action**: Check network, retry, or manual entry

### **Timeout**
- **Error Code**: `TIMEOUT`
- **Message**: "Request cancelled or timed out"
- **User Action**: Retry with smaller image or better connection

---

## Testing & Debugging

### **Debug Mode**
```bash
export EXPO_PUBLIC_DEBUG_IDENTIFICATION=true
```

**Logs**:
- Image hash
- Vision entities & OCR
- Generated candidates
- Discogs queries & matches
- Final resolved album

### **Test Harness**
- **Location**: `src/utils/testHarness.ts`
- **Dev Screen**: `src/screens/DevTestScreen.tsx`
- **Features**:
  - Test with specific images
  - View detailed debug output
  - Check candidate extraction
  - Verify metadata resolution

---

## Future Improvements

1. **Client-Side Candidate Extraction**: Move extraction to frontend for faster preview
2. **Batch Processing**: Identify multiple images in one request
3. **Offline Mode**: Cache Vision results for offline candidate extraction
4. **ML Model**: Train custom model for album cover recognition
5. **Barcode Scanning**: Direct Discogs lookup via barcode (already implemented, can be enhanced)

---

## Summary

SlotSync's identification pipeline is a **sophisticated, multi-phase system** that:

1. ✅ **Validates & preprocesses** images
2. ✅ **Extracts text/entities** via Google Vision
3. ✅ **Generates candidates** with strict filtering
4. ✅ **Searches Discogs** with multiple query variants
5. ✅ **Enriches metadata** from MusicBrainz & CAA
6. ✅ **Caches results** for instant repeat scans
7. ✅ **Returns clean JSON** with complete album data

The system is designed to be **fast, accurate, and user-friendly**, with robust error handling and fallback mechanisms to ensure the best possible identification experience.

