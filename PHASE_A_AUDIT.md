# Phase A: Full Codebase Efficiency Audit

**Date:** 2024-12-21  
**Scope:** Photo identification, manual lookup, CSV import flows  
**Goal:** Identify bottlenecks, redundant work, bugs, and optimization opportunities

---

## 1. Current Flow Diagrams

### 1.1 Photo Scan Flow (`/api/identify-record`)

```
User Photo → server-hybrid.js:3091
  ↓
[Phase 0] Image Hash Cache Check (server-hybrid.js:3195)
  ├─ Hit → Return cached (instant)
  └─ Miss → Continue
  ↓
[Phase 1] generateCandidatesFromInput() (server-hybrid.js:2004)
  ├─ Parallel: Embedding (CLIP) + Vision API (OCR)
  ├─ Vector search (findNearestCovers)
  ├─ OCR parsing (parseArtistAndAlbum)
  ├─ Web entity filtering (filterWebEntities)
  └─ Output: candidates[]
  ↓
[Phase 2] resolveBestAlbum() (server-hybrid.js:2433)
  ├─ Fast Path 1: Barcode match → fetchDiscogsReleaseById()
  ├─ Fast Path 2: High embedding (≥0.90) + discogsId → fetchDiscogsReleaseById()
  ├─ Fast Path 3: Local DB match + discogsId → fetchDiscogsReleaseById()
  ├─ Normal Path: For each candidate:
  │   ├─ Check local DB
  │   ├─ If discogsId exists → fetchDiscogsReleaseById()
  │   └─ Else → searchDiscogsEnhanced() (up to MAX_DISCOGS_SEARCHES=5)
  ├─ Score all releases (scoreAndSortReleases)
  ├─ Group variants (selectBestFromGroups)
  └─ Determine response type (auto-accept vs suggestions)
  ↓
[Phase 3] Metadata Enrichment
  ├─ Fetch full release details (if not already fetched)
  ├─ Get tracks, genres, styles
  └─ Return to frontend
```

**Key Files:**
- Entry: `backend-example/server-hybrid.js:3091` (`app.post('/api/identify-record')`)
- Phase 1: `server-hybrid.js:2004` (`generateCandidatesFromInput`)
- Phase 2: `server-hybrid.js:2433` (`resolveBestAlbum`)
- Scoring: `backend-example/services/discogsScoring.js`
- Embeddings: `backend-example/services/embeddingService.js`
- Vector Index: `backend-example/services/vectorIndex.js`

---

### 1.2 Manual Text Lookup Flow (`/api/identify-by-text`)

```
User Input (artist + title) → server-hybrid.js:3951
  ↓
identifyRecordByText() (server-hybrid.js:3600)
  ├─ Search Discogs (searchDiscogsEnhanced)
  ├─ Score results (text-based similarity)
  ├─ Sort by score + prefer earlier years
  ├─ Fetch full release details (fetchDiscogsReleaseById)
  └─ Return bestMatch + alternates
```

**Key Files:**
- Entry: `backend-example/server-hybrid.js:3951` (`app.post('/api/identify-by-text')`)
- Function: `server-hybrid.js:3600` (`identifyRecordByText`)

**⚠️ ISSUE:** `identifyRecordByText` calls `searchDiscogsEnhanced` which may do multiple Discogs searches, then calls `fetchDiscogsReleaseById` again. This is redundant if the search already returned full details.

---

### 1.3 CSV Import Flow

**Path 1: CSVImportScreen.tsx**
```
CSV File → CSVImportScreen.tsx:137 (handleImport)
  ↓
For each row:
  ├─ Parse artist, title, year (reject 2025)
  ├─ If releaseId exists:
  │   └─ GET /api/discogs/release/:id
  ├─ Else or if fetch fails:
  │   └─ POST /api/identify-by-text (artist, title)
  ├─ Extract: coverImageRemoteUrl, tracks, year, discogsId
  ├─ Create record (createRecord)
  └─ Create tracks (createTrack) for each track
```

**Path 2: BatchScanScreen.tsx**
```
CSV File → BatchScanScreen.tsx:178 (handleUploadCSV)
  ↓
For each row:
  ├─ Parse artist, title, year (reject 2025)
  ├─ POST /api/identify-by-text (artist, title)
  ├─ Extract: coverImageRemoteUrl, tracks, year, discogsId
  ├─ Create record (createRecord)
  └─ Create tracks (createTrack) for each track
```

**Key Files:**
- `src/screens/CSVImportScreen.tsx:137` (`handleImport`)
- `src/screens/BatchScanScreen.tsx:178` (`handleUploadCSV`)
- `src/data/repository.ts` (`createRecord`, `createTrack`)

**⚠️ ISSUE:** Two separate CSV import paths with slightly different logic. Both call `/api/identify-by-text` for each row sequentially (no concurrency limit).

---

## 2. Bottlenecks Analysis

### 2.1 Network Bottlenecks

| Operation | Current Behavior | Impact | Location |
|-----------|------------------|--------|----------|
| **Discogs Search** | Up to 5 searches per photo scan | High latency (2-5s each) | `server-hybrid.js:2686` |
| **Discogs Direct Fetch** | Called multiple times for same ID | Redundant network calls | Multiple locations |
| **Vision API** | 30s timeout, runs even if OCR weak | Cost + latency | `server-hybrid.js:2027` |
| **CSV Import** | Sequential API calls (no concurrency limit) | Very slow for large imports | `CSVImportScreen.tsx:264` |

**Specific Issues:**
1. **Photo Scan:** `resolveBestAlbum` may call `fetchDiscogsReleaseById` multiple times for the same `discogsId` if multiple candidates share it.
2. **Manual Lookup:** `identifyRecordByText` calls `searchDiscogsEnhanced` (which may do multiple searches), then calls `fetchDiscogsReleaseById` again even though search results may already have full details.
3. **CSV Import:** No concurrency limit - if importing 100 albums, makes 100 sequential API calls (could take 5-10 minutes).

### 2.2 CPU Bottlenecks

| Operation | Current Behavior | Impact | Location |
|-----------|------------------|--------|----------|
| **CLIP Embedding** | Computed every time (even if image hash cached) | 1-3s per scan | `embeddingService.js` |
| **OCR Parsing** | Multiple parsing passes on same text | Redundant computation | `server-hybrid.js:2126, 2151` |
| **Scoring** | Scores all releases even if fast path used | Unnecessary computation | `server-hybrid.js:2767` |

**Specific Issues:**
1. **Embedding Cache Miss:** Even if image hash cache hits, embedding is still computed (wasteful).
2. **OCR Double Parsing:** `parseArtistAndAlbum` is called, then `extractCandidates` is called on the same text (redundant).

### 2.3 Database Bottlenecks

| Operation | Current Behavior | Impact | Location |
|-----------|------------------|--------|----------|
| **Local DB Checks** | Multiple queries per candidate | N+1 query problem | `server-hybrid.js:2666` |
| **Track Creation** | Individual INSERT per track | Slow for albums with many tracks | `repository.ts:773` |

**Specific Issues:**
1. **N+1 Queries:** In `resolveBestAlbum`, each candidate triggers a separate `searchLocalDatabase` call.
2. **No Batch Inserts:** CSV import creates tracks one-by-one instead of batching.

---

## 3. Redundant Work

### 3.1 Duplicate Discogs Calls

**Issue:** Same `discogsId` may be fetched multiple times in a single scan.

**Locations:**
1. `resolveBestAlbum` fast paths may fetch by ID
2. Normal path may fetch same ID again for different candidates
3. `identifyRecordByText` searches, then fetches again

**Example Flow:**
```
Candidate 1: discogsId=123 → fetchDiscogsReleaseById(123)
Candidate 2: discogsId=123 → fetchDiscogsReleaseById(123)  // DUPLICATE!
```

**Fix:** Add in-memory cache for `fetchDiscogsReleaseById` within a single request.

---

### 3.2 Redundant OCR Parsing

**Issue:** OCR text is parsed multiple times with different parsers.

**Locations:**
- `server-hybrid.js:2128` → `parseArtistAndAlbum(visionResult.extractedText)`
- `server-hybrid.js:2151` → `extractCandidates(visionResult.extractedText)`

**Fix:** Parse once, reuse results.

---

### 3.3 Redundant Embedding Computation

**Issue:** Embedding computed even when image hash cache hits.

**Location:** `server-hybrid.js:2021` (embedding computed before checking if we can skip it)

**Fix:** Check image hash cache first, skip embedding if cache hit.

---

### 3.4 Redundant Vision API Calls

**Issue:** Vision API called even when OCR confidence is very high (no need for web detection).

**Location:** `server-hybrid.js:2027` (Vision always called if enabled)

**Fix:** Skip web detection if OCR confidence ≥ 0.8 (only need OCR, not web entities).

---

## 4. Bugs & Regressions

### 4.1 CSV Import: Year Defaults to 2025

**Status:** ✅ FIXED (recently)
- `CSVImportScreen.tsx:224-252` - Validates year, rejects 2025
- `BatchScanScreen.tsx:241-252` - Same validation

**Remaining Risk:** If Discogs returns year=2025, it may still be saved. Need to validate year from API responses too.

---

### 4.2 CSV Import: Missing Cover Art/Tracklists

**Status:** ✅ FIXED (recently)
- Both CSV import paths now call `/api/identify-by-text` to fetch metadata
- `CSVImportScreen.tsx:264-350` - Fetches metadata before saving
- `BatchScanScreen.tsx:264-350` - Same logic

**Remaining Risk:** If API call fails, record is saved without metadata. Should mark as "needs review" or skip.

---

### 4.3 Manual Lookup: Redundant Discogs Calls

**Status:** ❌ NOT FIXED
- `identifyRecordByText` calls `searchDiscogsEnhanced` (may do multiple searches)
- Then calls `fetchDiscogsReleaseById` even if search already returned full details
- **Location:** `server-hybrid.js:3600` (`identifyRecordByText`)

**Impact:** Slower manual lookup, unnecessary API calls.

---

### 4.4 Photo Scan: Vision API Always Called

**Status:** ⚠️ PARTIAL
- Vision API is called even if embedding similarity is very high (≥0.90)
- Web detection is filtered but still costs money/time
- **Location:** `server-hybrid.js:2027`

**Impact:** Unnecessary Vision API costs, slower scans.

---

### 4.5 CSV Import: No Concurrency Limit

**Status:** ❌ NOT FIXED
- CSV import makes sequential API calls (one per row)
- No rate limiting or concurrency control
- **Location:** `CSVImportScreen.tsx:203` (for loop), `BatchScanScreen.tsx:223` (for loop)

**Impact:** Very slow for large imports, risk of rate limiting.

---

## 5. Cache Effectiveness

### 5.1 Image Hash Cache

**Current:** ✅ Working
- Location: `server-hybrid.js:3195`
- Hit rate: Unknown (no metrics)
- **Issue:** No logging to track hit rate

**Recommendation:** Add metrics to track cache hit rate.

---

### 5.2 Embedding Cache

**Current:** ✅ Working (LRU cache, max 100)
- Location: `embeddingService.js`
- **Issue:** Computed even if image hash cache hits (wasteful)

**Recommendation:** Skip embedding if image hash cache hits.

---

### 5.3 Discogs Release Cache

**Current:** ❌ NOT IMPLEMENTED
- `fetchDiscogsReleaseById` has no caching
- Same release may be fetched multiple times in one request

**Recommendation:** Add request-scoped cache for `fetchDiscogsReleaseById`.

---

### 5.4 Local DB Cache

**Current:** ✅ Working
- Location: `server-hybrid.js:2666` (`searchLocalDatabase`)
- **Issue:** N+1 queries (one per candidate)

**Recommendation:** Batch query local DB for all candidates at once.

---

## 6. Performance Metrics (Missing)

**Current State:** No comprehensive timing metrics.

**What We Need:**
- Phase 1 time (candidate generation)
- Phase 2 time (resolve best album)
- Phase 3 time (metadata enrichment)
- Embedding computation time
- Vision API time
- Discogs search time (per search)
- Discogs direct fetch time (per fetch)
- Total request time
- Cache hit rates

**Current:** Basic timing exists in `debugInfo.performanceMetrics` but not consistently logged.

---

## 7. Rate Limiting Risks

### 7.1 Discogs API

**Current Limits:**
- `MAX_DISCOGS_SEARCHES = 5` per photo scan ✅
- No limit for direct fetches (fast paths) ⚠️
- No limit for CSV import ❌

**Risk:** CSV import of 100 albums = 100+ Discogs API calls (sequential, no throttling).

**Recommendation:** Add concurrency limit (max 3-5 parallel) and rate limiting (max 20 requests/minute).

---

### 7.2 Vision API

**Current:** No rate limiting
- Vision API called for every photo scan
- No cost tracking

**Recommendation:** Add rate limiting and cost tracking.

---

## 8. Summary of Issues

### Critical (Must Fix)
1. ❌ **CSV Import:** No concurrency limit (very slow, rate limit risk)
2. ❌ **Manual Lookup:** Redundant Discogs calls (search then fetch again)
3. ❌ **Photo Scan:** Duplicate `fetchDiscogsReleaseById` calls for same ID

### High Priority (Should Fix)
4. ⚠️ **Photo Scan:** Vision API always called (even when not needed)
5. ⚠️ **Photo Scan:** Embedding computed even if image hash cache hits
6. ⚠️ **Photo Scan:** N+1 local DB queries
7. ⚠️ **CSV Import:** No error handling (saves records without metadata if API fails)

### Medium Priority (Nice to Have)
8. 📊 **Metrics:** No comprehensive timing/cache hit rate logging
9. 📊 **Cache:** No request-scoped cache for Discogs releases
10. 📊 **Batch Operations:** No batch inserts for tracks

### Low Priority (Optimization)
11. 🔧 **OCR Parsing:** Double parsing (parseArtistAndAlbum + extractCandidates)
12. 🔧 **Scoring:** Scores all releases even if fast path used

---

## 9. Debug Logging Gaps

**Current:** Some debug logging exists but inconsistent.

**Missing:**
- Cache hit/miss rates
- Timing breakdown per phase
- Discogs API call counts (per request)
- Vision API call counts
- Error rates per operation

**Recommendation:** Add comprehensive debug logging (behind `DEBUG=true` flag) to track:
- Which endpoints are called
- How many Discogs calls per scan/import
- Cache hit rates
- Timing of each phase

---

## 10. Architecture Issues

### 10.1 Pipeline Separation

**Current:** ✅ Mostly separated
- Photo pipeline: `/api/identify-record` (uses embeddings + Vision)
- Manual pipeline: `/api/identify-by-text` (text-only, no Vision)

**Issue:** Manual pipeline still calls `searchDiscogsEnhanced` which may do multiple searches (inefficient for simple text lookup).

---

### 10.2 Fast Paths

**Current:** ✅ Implemented
- Barcode match → direct fetch
- High embedding similarity (≥0.90) + discogsId → direct fetch
- Local DB match + discogsId → direct fetch

**Issue:** Fast paths may still trigger redundant fetches if multiple candidates share same discogsId.

---

## Next Steps

1. **Phase B:** Create detailed refactor plan
2. **Phase C:** Implement improvements
3. **Testing:** Verify all flows work correctly
4. **Metrics:** Add comprehensive logging

---

**End of Phase A Audit**

