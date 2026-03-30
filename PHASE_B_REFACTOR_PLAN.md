# Phase B: Refactor Plan

**Date:** 2024-12-21  
**Based on:** Phase A Audit findings  
**Goal:** Fix bottlenecks, eliminate redundant work, improve efficiency

---

## Overview

This plan addresses the critical and high-priority issues identified in Phase A, while maintaining backward compatibility and existing functionality.

---

## 1. Critical Fixes

### 1.1 CSV Import: Add Concurrency Limit + Retry with Backoff

**Problem:** CSV import makes sequential API calls (one per row), very slow for large imports.

**Solution:**
- Add concurrency limit (max 3-5 parallel requests)
- Use `Promise.allSettled` to handle failures gracefully
- Add retry with exponential backoff for failed requests
- Optionally add server-side leaky bucket rate limiter only if actually hitting Discogs limits
- **Note:** Discogs limit is 60 req/min; with concurrency 4 and typical response times (1-2s), you'll usually be fine (~15-20 req/min naturally)

**Files to Modify:**
- `src/screens/CSVImportScreen.tsx:203` (for loop → batch processing)
- `src/screens/BatchScanScreen.tsx:223` (for loop → batch processing)

**Implementation:**
```typescript
// Simple concurrency limiter (pLimit-style)
function createConcurrencyLimiter(limit: number) {
  let running = 0;
  const queue: Array<() => void> = [];
  
  return <T>(fn: () => Promise<T>): Promise<T> => {
    return new Promise((resolve, reject) => {
      const run = async () => {
        running++;
        try {
          const result = await fn();
          resolve(result);
        } catch (error) {
          reject(error);
        } finally {
          running--;
          if (queue.length > 0) {
            const next = queue.shift()!;
            next();
          }
        }
      };
      
      if (running < limit) {
        run();
      } else {
        queue.push(run);
      }
    });
  };
}

// Retry with exponential backoff
async function fetchWithRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error: any) {
      if (attempt === maxRetries - 1) throw error;
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, attempt) * 1000;
      console.log(`[CSV Import] Retry ${attempt + 1}/${maxRetries} after ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Unreachable');
}

// Process single row with retry
const processRow = async (row: any, rowIndex: number, totalRows: number) => {
  try {
    console.log(`[CSV Import] Processing row ${rowIndex + 1}/${totalRows}...`);
    
    return await fetchWithRetry(async () => {
      // ... existing metadata fetch logic ...
      const metadata = await fetchMetadata(artist, title);
      // ... save record and tracks ...
      
      return { success: true, rowIndex };
    });
  } catch (error: any) {
    console.error(`[CSV Import] ❌ Row ${rowIndex + 1} failed:`, error.message);
    return { success: false, error: error.message, rowIndex };
  }
};

// Process all rows with concurrency limit
const CONCURRENCY_LIMIT = 4;
const limit = createConcurrencyLimiter(CONCURRENCY_LIMIT);

const results = await Promise.all(
  dataRows.map((row, index) => 
    limit(() => processRow(row, index, dataRows.length))
  )
);

// Collect successes and failures
const successful = results.filter(r => r.success);
const failed = results.filter(r => !r.success);
```

**Risk Level:** Low (isolated to CSV import, no impact on other flows)

**Rollback:** Revert to sequential processing if issues arise

**Test Steps:**
1. Import CSV with 20+ albums
2. Verify all albums get metadata
3. Verify retries work on network errors
4. Verify no rate limiting errors (with concurrency 4, should stay under 60 req/min)
5. Verify import completes faster than before

---

### 1.2 Manual Lookup: Eliminate Redundant Discogs Calls

**Problem:** `identifyRecordByText` calls `searchDiscogsEnhanced` (1 search per request, so no double-search issue here), then calls `fetchDiscogsReleaseById` to get full details including tracklist. The optimization needed is:
- Cache `fetchDiscogsReleaseById` to avoid repeated fetches of same releaseId
- Optionally cache search results across requests (helps CSV imports and repeated manual lookups)

**Solution:**
- Keep the search → fetch-by-ID flow (search gives releaseId, fetch gives full details including tracklist)
- Add request-scoped cache for `fetchDiscogsReleaseById` (for photo scans + any repeated fetch within a request)
- Add optional global TTL cache for `fetchDiscogsReleaseById` (5-15 minutes, max 1000 entries)
- Add optional global TTL cache for Discogs text search results (keyed by normalized `artist|title`, helps CSV imports)

**Files to Modify:**
- `backend-example/server-hybrid.js:3600` (`identifyRecordByText`)
- `backend-example/server-hybrid.js:2350` (`fetchDiscogsReleaseById`)
- `backend-example/server-hybrid.js:1447` (`searchDiscogsEnhanced`)

**Implementation:**
```javascript
// In identifyRecordByText:
const requestCache = new Map(); // Request-scoped cache for this request

// Search to get best releaseId (optionally use global cache)
const cacheKey = `${normalizeForSearch(artist)}|${normalizeForSearch(title)}`;
const cachedSearch = globalSearchCache.get(cacheKey);
let discogsResult;

if (cachedSearch && (Date.now() - cachedSearch.timestamp < SEARCH_CACHE_TTL)) {
  console.log(`[Discogs] ✅ Search cache hit for "${artist}" - "${title}"`);
  discogsResult = cachedSearch.data;
} else {
  discogsResult = await searchDiscogsEnhanced(artist, title, false, null);
  // Cache successful searches only
  if (discogsResult.bestMatch) {
    globalSearchCache.set(cacheKey, {
      data: discogsResult,
      timestamp: Date.now(),
    });
  }
}

if (!discogsResult.bestMatch || !discogsResult.bestMatch.discogsId) {
  return null;
}

// Fetch full details (uses request-scoped + global cache)
const fullDetails = await fetchDiscogsReleaseById(
  discogsResult.bestMatch.discogsId,
  requestCache  // Pass request cache to avoid duplicate fetches within same request
);

return fullDetails;
```

**Risk Level:** Medium (affects manual lookup flow)

**Rollback:** Revert to current behavior (always fetch by ID, no cache)

**Test Steps:**
1. Use "Lookup Metadata" button on a record
2. Verify metadata is populated correctly (tracks, genres, etc.)
3. Check backend logs - should see search once, fetch once (no duplicates)
4. Verify response time is faster (especially if same releaseId fetched multiple times in same request)

---

### 1.3 Photo Scan: Eliminate Duplicate Discogs Fetches

**Problem:** Same `discogsId` may be fetched multiple times in a single scan if multiple candidates share it.

**Solution:**
- Add request-scoped cache for `fetchDiscogsReleaseById` (shared with fix 1.2)
- Add optional global TTL cache (5-15 minutes, max 1000 entries) to avoid fetching same release across requests
- Cache key: `discogsId`
- Cache safety: Limit size, TTL expiration, only cache successful results, prevent unbounded growth

**Files to Modify:**
- `backend-example/server-hybrid.js:2350` (`fetchDiscogsReleaseById`)
- `backend-example/server-hybrid.js:2433` (`resolveBestAlbum`)

**Implementation:**
```javascript
// Global cache with TTL and size limits
const globalDiscogsCache = new Map(); // discogsId -> { data, timestamp }
const MAX_CACHE_SIZE = 1000;
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

// Cleanup old entries periodically
function cleanupCache() {
  const now = Date.now();
  for (const [key, value] of globalDiscogsCache.entries()) {
    if (now - value.timestamp > CACHE_TTL) {
      globalDiscogsCache.delete(key);
    }
  }
  
  // Enforce size limit (LRU: remove oldest if over limit)
  if (globalDiscogsCache.size > MAX_CACHE_SIZE) {
    const entries = Array.from(globalDiscogsCache.entries());
    entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
    const toRemove = entries.slice(0, globalDiscogsCache.size - MAX_CACHE_SIZE);
    for (const [key] of toRemove) {
      globalDiscogsCache.delete(key);
    }
  }
}

// Run cleanup every 5 minutes
setInterval(cleanupCache, 5 * 60 * 1000);

async function fetchDiscogsReleaseById(discogsId, requestCache = null) {
  // 1. Check request-scoped cache first (fastest)
  if (requestCache && requestCache.has(discogsId)) {
    console.log(`[Discogs] ✅ Request cache hit for release ${discogsId}`);
    return requestCache.get(discogsId);
  }
  
  // 2. Check global cache (if within TTL)
  const cached = globalDiscogsCache.get(discogsId);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) {
    console.log(`[Discogs] ✅ Global cache hit for release ${discogsId}`);
    // Store in request cache for this request too
    if (requestCache) {
      requestCache.set(discogsId, cached.data);
    }
    return cached.data;
  }
  
  // 3. Fetch from API
  console.log(`[Discogs] 🔍 Fetching release ${discogsId} from API...`);
  try {
    const release = await fetchFromDiscogsAPI(discogsId);
    
    // 4. Store in both caches (only cache successful results)
    if (requestCache) {
      requestCache.set(discogsId, release);
    }
    
    // Cleanup before adding to global cache
    cleanupCache();
    globalDiscogsCache.set(discogsId, {
      data: release,
      timestamp: Date.now(),
    });
    
    return release;
  } catch (error) {
    // Don't cache failures
    throw error;
  }
}

// In resolveBestAlbum:
const requestCache = new Map();
// Pass cache to all fetchDiscogsReleaseById calls
```

**Risk Level:** Low (additive change, doesn't break existing flow)

**Rollback:** Remove cache parameters (defaults to null, no caching)

**Test Steps:**
1. Scan album that triggers multiple candidates with same discogsId
2. Check backend logs - should see "Cache hit" messages
3. Verify only one Discogs API call per unique discogsId (within same request)
4. Scan same album again within 5 minutes - should see global cache hit
5. Verify response time is faster

---

## 2. High Priority Fixes

### 2.1 Photo Scan: Skip Vision API When Not Needed

**Problem:** Vision API called even when embedding similarity is very high (≥0.90) or when OCR confidence is high (≥0.8).

**Solution:**
- Check embedding similarity first
- If high similarity (≥0.90) + has discogsId → skip Vision API (fast path)
- If OCR confidence ≥ 0.8 → skip web detection (only need OCR)

**Files to Modify:**
- `backend-example/server-hybrid.js:2004` (`generateCandidatesFromInput`)

**Implementation:**
```javascript
// In generateCandidatesFromInput:
// 1. Compute embedding first
const queryEmbedding = await getScanEmbedding(imageBuffer, debugInfo);

// 2. Check for high similarity match
if (queryEmbedding) {
  const embeddingMatches = await findNearestCovers(queryEmbedding, 1, 0.90);
  if (embeddingMatches.length > 0 && embeddingMatches[0].discogsId) {
    // High confidence match - skip Vision API
    console.log('[Phase1] ⚡ High embedding similarity, skipping Vision API');
    // Use embedding match as candidate
    return [embeddingCandidate];
  }
}

// 3. If no high confidence match, call Vision API
const visionResult = await processImageWithGoogleVision(imageBuffer);

// 4. If OCR confidence ≥ 0.8, skip web detection
if (visionResult && ocrConfidence >= 0.8) {
  // Only use OCR, skip web detection
  visionResult.webEntities = [];
  visionResult.pageTitles = [];
}
```

**Risk Level:** Medium (changes Vision API usage pattern)

**Rollback:** Revert to always calling Vision API

**Test Steps:**
1. Scan album with high embedding similarity
2. Verify Vision API is skipped (check logs)
3. Verify identification still works correctly
4. Verify cost reduction (fewer Vision API calls)

---

### 2.2 Photo Scan: Skip Embedding If Image Hash Cache Hits

**Problem:** Embedding computed even when image hash cache hits (wasteful).

**Solution:**
- Check image hash cache first
- If cache hit → skip embedding computation
- Only compute embedding if cache miss

**Files to Modify:**
- `backend-example/server-hybrid.js:3091` (`app.post('/api/identify-record')`)
- `backend-example/server-hybrid.js:2004` (`generateCandidatesFromInput`)

**Implementation:**
```javascript
// In /api/identify-record endpoint:
// Check image hash cache FIRST
const imageHash = generateImageHash(imageBuffer);
const cachedResult = await getCachedResultByHash(imageHash);

if (cachedResult) {
  console.log('[API] ✅ Image hash cache hit - skipping embedding/Vision');
  return cachedResult;
}

// Only compute embedding if cache miss
const candidates = await generateCandidatesFromInput(req, imageBuffer, debugInfo);
```

**Risk Level:** Low (optimization, doesn't change behavior)

**Rollback:** Revert to computing embedding even on cache hit

**Test Steps:**
1. Scan same album twice
2. Verify second scan uses cache (check logs)
3. Verify embedding is NOT computed on second scan
4. Verify response time is much faster on second scan

---

### 2.3 Photo Scan: Batch Local DB Queries

**Problem:** N+1 query problem - each candidate triggers separate `searchLocalDatabase` call.

**Solution:**
- Batch query local DB for all candidates at once
- Use `IN` clause or multiple `OR` conditions

**Files to Modify:**
- `backend-example/server-hybrid.js:2433` (`resolveBestAlbum`)
- `backend-example/server-hybrid.js:1850` (`searchLocalDatabase`)

**Implementation:**
```javascript
// New function: batchSearchLocalDatabase
async function batchSearchLocalDatabase(candidates, imageHash, imageBuffer) {
  const artistTitlePairs = candidates
    .filter(c => c.artist && c.title)
    .map(c => [c.artist, c.title]);
  
  // Single query with multiple OR conditions
  const query = `
    SELECT * FROM identified_records 
    WHERE ${artistTitlePairs.map(() => '(artist = ? AND title = ?)').join(' OR ')}
  `;
  
  const params = artistTitlePairs.flat();
  return db.all(query, params);
}

// In resolveBestAlbum:
const localMatches = await batchSearchLocalDatabase(candidates, imageHash, imageBuffer);
// Map results to candidates...
```

**Risk Level:** Medium (changes DB query pattern)

**Rollback:** Revert to individual queries

**Test Steps:**
1. Scan album that generates multiple candidates
2. Verify single DB query (check logs)
3. Verify all candidates are checked correctly
4. Verify response time is faster

---

### 2.4 CSV Import: Better Error Handling

**Problem:** If API call fails, record is saved without metadata (no indication of failure).

**Solution:**
- Mark records as "needs review" if metadata fetch fails
- Add `metadataStatus` field to records table
- Skip record if metadata fetch fails (with clear error message)

**Files to Modify:**
- `src/screens/CSVImportScreen.tsx:264` (metadata fetch error handling)
- `src/screens/BatchScanScreen.tsx:264` (metadata fetch error handling)
- `src/data/database.ts` (add `metadataStatus` column)
- `src/data/types.ts` (add `metadataStatus` to RecordModel)

**Implementation:**
```typescript
// In CSV import:
try {
  const metadata = await fetchMetadata(artist, title);
  if (!metadata || !metadata.coverImageRemoteUrl) {
    console.warn(`[CSV Import] ⚠️  Incomplete metadata for "${artist}" - "${title}"`);
    // Mark as needs review
    await createRecord({
      ...recordData,
      metadataStatus: 'incomplete',
    });
    skipped += 1;
    continue;
  }
  // Save with metadata
} catch (error) {
  console.error(`[CSV Import] ❌ Metadata fetch failed: ${error.message}`);
  // Skip record or mark as needs review
  skipped += 1;
  continue;
}
```

**Risk Level:** Low (additive change, doesn't break existing flow)

**Rollback:** Remove `metadataStatus` field, revert to current behavior

**Test Steps:**
1. Import CSV with invalid artist/title (will fail lookup)
2. Verify record is NOT saved (or marked as needs review)
3. Verify error message is clear
4. Verify successful imports still work

---

## 3. Medium Priority Improvements

### 3.1 Add Comprehensive Metrics Logging

**Problem:** No comprehensive timing/cache hit rate logging.

**Solution:**
- Add detailed timing metrics per phase
- Add cache hit/miss tracking
- Add Discogs API call counts
- Log metrics in structured format (JSON)

**Files to Modify:**
- `backend-example/server-hybrid.js:3128` (`debugInfo` object)
- All phase functions (add timing)

**Implementation:**
```javascript
const debugInfo = {
  // ... existing fields ...
  metrics: {
    cacheHits: {
      imageHash: 0,
      embedding: 0,
      discogsRelease: 0,
      localDb: 0,
    },
    cacheMisses: {
      imageHash: 0,
      embedding: 0,
      discogsRelease: 0,
      localDb: 0,
    },
    timings: {
      phase1: null,
      phase2: null,
      phase3: null,
      embedding: null,
      vision: null,
      discogsSearch: [],
      discogsFetch: [],
      total: null,
    },
    apiCalls: {
      discogsSearches: 0,
      discogsFetches: 0,
      visionApi: 0,
    },
  },
};

// Log at end of request:
if (process.env.DEBUG_METRICS === 'true') {
  console.log('[Metrics]', JSON.stringify(debugInfo.metrics, null, 2));
}
```

**Risk Level:** Low (additive, doesn't change behavior)

**Rollback:** Remove metrics logging

**Test Steps:**
1. Enable `DEBUG_METRICS=true`
2. Run photo scan, manual lookup, CSV import
3. Verify metrics are logged correctly
4. Verify metrics are useful for debugging

---

### 3.2 Batch Track Inserts

**Problem:** CSV import creates tracks one-by-one (slow for albums with many tracks).

**Solution:**
- Use batch INSERT for tracks
- Insert all tracks for an album in single query

**Files to Modify:**
- `src/data/repository.ts:773` (`createTrack`)
- `src/screens/CSVImportScreen.tsx:350` (track creation)
- `src/screens/BatchScanScreen.tsx:350` (track creation)

**Implementation:**
```typescript
// New function: createTracksBatch
export const createTracksBatch = async (
  tracks: Array<CreateTrackInput>
): Promise<Track[]> => {
  if (tracks.length === 0) return [];
  
  const db = await getDatabase();
  const values = tracks.map(t => 
    `(?, ?, ?, ?, ?, ?, ?, ?)`
  ).join(', ');
  
  const params = tracks.flatMap(t => [
    generateId('track'),
    t.recordId,
    t.title,
    t.trackNumber ?? null,
    t.discNumber ?? null,
    t.side ?? null,
    t.durationSeconds ?? null,
    t.bpm ?? null,
  ]);
  
  await db.runAsync(
    `INSERT INTO tracks (id, recordId, title, trackNumber, discNumber, side, durationSeconds, bpm)
     VALUES ${values}`,
    ...params
  );
  
  // Return created tracks (would need to query back or construct)
  return tracks.map(t => ({ ...t, id: generateId('track') }));
};
```

**Risk Level:** Low (optimization, doesn't change behavior)

**Rollback:** Revert to individual inserts

**Test Steps:**
1. Import CSV with album that has 20+ tracks
2. Verify all tracks are created correctly
3. Verify import is faster
4. Verify track order is preserved

---

## 4. Implementation Order

### Phase 1: Critical Fixes (Must Do)
1. ✅ CSV Import: Add concurrency limit
2. ✅ Manual Lookup: Eliminate redundant Discogs calls
3. ✅ Photo Scan: Eliminate duplicate Discogs fetches

### Phase 2: High Priority Fixes (Should Do)
4. ✅ Photo Scan: Skip Vision API when not needed
5. ✅ Photo Scan: Skip embedding if image hash cache hits
6. ✅ Photo Scan: Batch local DB queries
7. ✅ CSV Import: Better error handling

### Phase 3: Medium Priority (Nice to Have)
8. 📊 Add comprehensive metrics logging
9. 📊 Batch track inserts

---

## 5. Testing Strategy

### 5.1 Unit Tests (Manual)
- Test each fix individually
- Verify backward compatibility
- Check logs for expected behavior

### 5.2 Integration Tests
1. **Photo Scan:**
   - Scan album with high embedding similarity → verify Vision API skipped
   - Scan same album twice → verify cache hit, embedding skipped
   - Scan album with multiple candidates → verify no duplicate Discogs fetches

2. **Manual Lookup:**
   - Use "Lookup Metadata" button → verify metadata populated
   - Check logs → verify fewer Discogs calls
   - Verify response time is faster

3. **CSV Import:**
   - Import CSV with 20+ albums → verify concurrency limit works
   - Verify all albums get metadata
   - Verify no rate limiting errors
   - Verify import completes faster

### 5.3 Regression Tests
- Verify photo scan still works correctly
- Verify manual lookup still works correctly
- Verify CSV import still works correctly
- Verify all existing features unchanged

---

## 6. Risk Assessment

| Fix | Risk Level | Impact if Broken | Rollback Difficulty |
|-----|------------|------------------|---------------------|
| CSV concurrency | Low | CSV import fails | Easy (revert loop) |
| Manual lookup | Medium | Manual lookup fails | Medium (revert function) |
| Duplicate fetches | Low | Slightly slower | Easy (remove cache) |
| Skip Vision API | Medium | Lower accuracy | Medium (revert condition) |
| Skip embedding | Low | Slightly slower | Easy (revert condition) |
| Batch DB queries | Medium | DB errors | Medium (revert query) |
| Error handling | Low | Records saved incorrectly | Easy (revert logic) |
| Metrics logging | Low | No metrics | Easy (remove logging) |
| Batch inserts | Low | Tracks not saved | Easy (revert to individual) |

---

## 7. Rollback Plan

For each fix:
1. **Git commit** before making changes
2. **Test thoroughly** after changes
3. **If issues arise:** Revert specific commit
4. **Document** any issues found

**Git Workflow:**
```bash
# Before starting
git checkout -b refactor/efficiency-improvements
git commit -m "Phase A audit complete"

# After each fix
git add .
git commit -m "Fix: [description]"
git push

# If rollback needed
git revert <commit-hash>
```

---

## 8. Success Criteria

### Performance Improvements
- ✅ CSV import: 3-5x faster (with concurrency)
- ✅ Manual lookup: 30-50% faster (fewer API calls)
- ✅ Photo scan: 10-20% faster (cache hits, fewer API calls)

### Reliability Improvements
- ✅ CSV import: No rate limiting errors
- ✅ Manual lookup: Always populates metadata
- ✅ Photo scan: No duplicate API calls

### Code Quality
- ✅ Better error handling
- ✅ Comprehensive metrics
- ✅ Cleaner code structure

---

## 9. Timeline Estimate

- **Phase 1 (Critical):** 2-3 hours
- **Phase 2 (High Priority):** 3-4 hours
- **Phase 3 (Medium Priority):** 2-3 hours
- **Testing:** 2-3 hours
- **Total:** 9-13 hours

---

## 10. Next Steps

1. **Review this plan** with team/user
2. **Get approval** to proceed
3. **Start Phase 1** (Critical fixes)
4. **Test after each fix**
5. **Move to Phase 2** (High priority)
6. **Final testing** and verification
7. **Documentation** update

---

**End of Phase B Refactor Plan**

