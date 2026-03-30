# Phase C: Implementation

**Date:** 2024-12-21  
**Based on:** Phase A Audit + Phase B Refactor Plan (updated)  
**Goal:** Implement all critical and high-priority fixes

---

## Implementation Checklist

### Phase 1: Critical Fixes (Must Do)

- [ ] **1.1 CSV Import: Add Concurrency Limit + Retry**
  - [ ] Create `createConcurrencyLimiter` helper (pLimit-style)
  - [ ] Add retry with exponential backoff
  - [ ] Update `CSVImportScreen.tsx`
  - [ ] Update `BatchScanScreen.tsx`
  - [ ] Test with 20+ albums

- [ ] **1.2 Manual Lookup: Cache Discogs Calls**
  - [ ] Add request-scoped cache for `fetchDiscogsReleaseById`
  - [ ] Add global TTL cache for `fetchDiscogsReleaseById` (with size limits)
  - [ ] Add optional global TTL cache for search results
  - [ ] Update `identifyRecordByText`
  - [ ] Update `fetchDiscogsReleaseById`
  - [ ] Test manual lookup

- [ ] **1.3 Photo Scan: Eliminate Duplicate Fetches**
  - [ ] Use shared caching from 1.2
  - [ ] Update `resolveBestAlbum` to pass request cache
  - [ ] Test photo scan with multiple candidates

### Phase 2: High Priority Fixes (Should Do)

- [ ] **2.1 Photo Scan: Skip Vision API When Not Needed**
  - [ ] Check embedding similarity first
  - [ ] Skip Vision if high similarity + discogsId
  - [ ] Skip web detection if OCR confidence ≥ 0.8
  - [ ] Test photo scans

- [ ] **2.2 Photo Scan: Skip Embedding If Cache Hits**
  - [ ] Check image hash cache first
  - [ ] Skip embedding/Vision on cache hit
  - [ ] Test cache hit path

- [ ] **2.3 Photo Scan: Batch Local DB Queries**
  - [ ] Create `batchSearchLocalDatabase` function
  - [ ] Update `resolveBestAlbum`
  - [ ] Test with multiple candidates

- [ ] **2.4 CSV Import: Better Error Handling**
  - [ ] Add error collection
  - [ ] Skip records with failed metadata fetch
  - [ ] Show clear error messages
  - [ ] Test with invalid data

---

## Implementation Order

1. **Backend caching** (1.2, 1.3) - Foundation for other fixes
2. **CSV concurrency** (1.1) - Immediate user impact
3. **Photo scan optimizations** (2.1, 2.2, 2.3) - Performance improvements
4. **Error handling** (2.4) - Polish

---

## Files to Create/Modify

### New Files
- None (all changes in existing files)

### Modified Files
1. `backend-example/server-hybrid.js`
   - `fetchDiscogsReleaseById` (add caching)
   - `identifyRecordByText` (use caches)
   - `resolveBestAlbum` (use caches)
   - `searchDiscogsEnhanced` (optional search caching)
   - `generateCandidatesFromInput` (skip Vision/embedding optimizations)

2. `src/screens/CSVImportScreen.tsx`
   - Add concurrency limiter
   - Add retry logic
   - Better error handling

3. `src/screens/BatchScanScreen.tsx`
   - Add concurrency limiter
   - Add retry logic
   - Better error handling

4. `src/data/repository.ts`
   - Add `batchSearchLocalDatabase` (optional)

---

## Testing Strategy

### Unit Tests (Manual)
1. Test concurrency limiter with various limits
2. Test cache hit/miss scenarios
3. Test retry logic with network failures

### Integration Tests
1. CSV import: 20+ albums, verify concurrency, retries, error handling
2. Manual lookup: Verify caching, performance improvement
3. Photo scan: Verify caching, Vision skipping, embedding skipping

### Performance Tests
1. Measure CSV import time (before/after)
2. Measure manual lookup time (before/after)
3. Measure photo scan time (before/after)
4. Monitor Discogs API call counts

---

## Success Criteria

- ✅ CSV import: 3-5x faster, handles errors gracefully
- ✅ Manual lookup: 30-50% faster, fewer API calls
- ✅ Photo scan: 10-20% faster, fewer API calls
- ✅ No regressions in existing functionality
- ✅ All tests pass

---

**Ready to implement!**

