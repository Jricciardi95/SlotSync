# Console.log Usage Audit Report

**Date:** 2025-01-27  
**Scope:** Full codebase audit of all `console.log`, `console.warn`, `console.error`, `console.info` usage

---

## Summary

- **Backend:** ~1,506 instances across 35 files
- **Frontend:** ~351 instances across 42 files
- **Total:** ~1,857 instances

---

## Backend Console.log Usage

### Production Code (Should Use Logger)

#### `backend-example/server-hybrid.js`
- **Count:** ~154 instances
- **Status:** ⚠️ Should be replaced with `logger.debug/info/warn/error`
- **Examples:**
  - Line 3048: `console.log(\`[Phase2] 📋 Normalized ${candidates.length} candidates...\`)`
  - Line 3051: `console.log(\`[Phase2] 🔍 Processing ${normalizedCandidates.length} candidates...\`)`
  - Line 3260: `console.log(\`[REQ ${resolvedReqId}] Phase2 budget exceeded...\`)`
  - Many more throughout the file

#### `backend-example/services/vectorIndex.js`
- **Count:** 4 instances
- **Status:** ⚠️ Should be replaced with `logger.warn/info`
- **Lines:**
  - Line 51: `console.warn('[VectorIndex] ⚠️  No database provided...')`
  - Line 62: `console.warn('[VectorIndex] ⚠️  Failed to load embeddings...')`
  - Line 92: `console.warn(\`[VectorIndex] ⚠️  Failed to parse embedding...\`)`
  - Line 97: `console.log(\`[VectorIndex] ✅ Loaded ${loaded} embeddings...\`)`

#### `backend-example/middleware/cors.js`
- **Count:** 3 instances
- **Status:** ⚠️ Should be replaced with `logger.info/warn`
- **Lines:**
  - Line 40: `console.log(\`[Config] ✅ CORS configured...\`)`
  - Line 42: `console.log(\`[Config]   Origins: ${allowedOrigins.join(', ')}\`)`
  - Line 45: `console.warn('[Config] ⚠️  No CORS origins configured...')`

### Test/Dev Scripts (Acceptable)

#### `backend-example/scripts/*.js`
- **Status:** ✅ Acceptable (test scripts, not production code)
- Files: `smokeDiscogs.js`, `smokeIdentify.js`, etc.

#### `backend-example/test-*.js`
- **Status:** ✅ Acceptable (test files)
- Files: `test-api.js`, `test-google-vision.js`, `test-vinyl-vision.js`, etc.

#### `backend-example/devTest.js`
- **Status:** ✅ Acceptable (dev utility)

#### `backend-example/verify-*.js`
- **Status:** ✅ Acceptable (setup verification scripts)

---

## Frontend Console.log Usage

### Production Code (Should Use Logger)

#### `src/screens/ScanRecordScreen.tsx`
- **Count:** ~26 instances
- **Status:** ⚠️ Should be replaced with `logger.debug/info/warn/error`
- **Note:** Some already use `logger`, but many still use `console.log`

#### `src/services/RecordIdentificationService.ts`
- **Count:** ~11 instances
- **Status:** ⚠️ Should be replaced with `logger.debug/info`

#### `src/utils/logger.ts`
- **Count:** 4 instances
- **Status:** ✅ Acceptable (logger implementation itself uses console)

#### `src/utils/debug.ts`
- **Count:** 3 instances
- **Status:** ⚠️ Should use logger if available

#### `src/utils/csvImport.ts`
- **Count:** ~6 instances
- **Status:** ⚠️ Should be replaced with `logger.debug/info/warn/error`

#### `src/utils/imageResize.ts`
- **Count:** ~11 instances
- **Status:** ⚠️ Should be replaced with `logger.debug/info/warn/error`

#### `src/navigation/CustomNavigation.tsx`
- **Count:** ~5 instances
- **Status:** ⚠️ Should be replaced with `logger.debug`

#### `src/utils/testHarness.ts`
- **Count:** ~44 instances
- **Status:** ✅ Acceptable (test utility)

---

## Recommendations

### High Priority (Production Code)

1. **`backend-example/server-hybrid.js`** (154 instances)
   - Replace all `console.log` with `logger.debug` or `logger.info`
   - Replace all `console.warn` with `logger.warn`
   - Replace all `console.error` with `logger.error`

2. **`backend-example/services/vectorIndex.js`** (4 instances)
   - Replace with `logger.warn`/`logger.info`

3. **`backend-example/middleware/cors.js`** (3 instances)
   - Replace with `logger.info`/`logger.warn`

4. **Frontend production files** (~100+ instances in production code)
   - Replace with `logger.debug`/`logger.info`/`logger.warn`/`logger.error`
   - Focus on: `ScanRecordScreen.tsx`, `RecordIdentificationService.ts`, `csvImport.ts`, `imageResize.ts`

### Low Priority (Test/Dev Scripts)

- Test scripts and dev utilities can keep `console.log` (acceptable for one-off scripts)
- Logger implementation itself uses console (acceptable)

---

## Action Plan

### Phase 1: Backend Production Code
1. Replace `console.log` in `server-hybrid.js` (154 instances)
2. Replace `console.log` in `vectorIndex.js` (4 instances)
3. Replace `console.log` in `cors.js` (3 instances)
4. Replace in other service files as needed

### Phase 2: Frontend Production Code
1. Replace in `ScanRecordScreen.tsx` (26 instances)
2. Replace in `RecordIdentificationService.ts` (11 instances)
3. Replace in utility files (`csvImport.ts`, `imageResize.ts`, etc.)

### Phase 3: Verification
1. Run grep to verify no `console.log` in production code
2. Add ESLint rule to warn about `console.log` in production files
3. Update documentation

---

## Files to Update

### Backend (Production Code)
- `backend-example/server-hybrid.js` - 154 instances
- `backend-example/services/vectorIndex.js` - 4 instances
- `backend-example/middleware/cors.js` - 3 instances
- Other service files as needed

### Frontend (Production Code)
- `src/screens/ScanRecordScreen.tsx` - 26 instances
- `src/services/RecordIdentificationService.ts` - 11 instances
- `src/utils/csvImport.ts` - 6 instances
- `src/utils/imageResize.ts` - 11 instances
- `src/navigation/CustomNavigation.tsx` - 5 instances
- Other production files as needed

### Files to Keep (Test/Dev Scripts)
- `backend-example/scripts/*.js` - Test scripts
- `backend-example/test-*.js` - Test files
- `backend-example/devTest.js` - Dev utility
- `src/utils/testHarness.ts` - Test utility
- `src/utils/logger.ts` - Logger implementation

---

**Note:** This audit identified ~1,857 total console.log instances. The focus should be on production code (~200-300 instances), not test/dev scripts.

---

## Detailed Breakdown

### Backend Production Files (Priority)

#### `backend-example/server-hybrid.js`
- **Total:** ~154 instances
- **Breakdown:**
  - `console.log`: ~120 instances
  - `console.warn`: ~20 instances
  - `console.error`: ~14 instances
- **Key locations:**
  - Phase 2 candidate processing (lines 3048-3423)
  - Phase 3 enrichment (lines 3431-3618)
  - Main endpoint handler (lines 3641+)
  - Startup logging (lines 5400+)

#### `backend-example/services/vectorIndex.js`
- **Total:** 4 instances
- **Lines:** 51, 62, 92, 97
- **All should be:** `logger.warn` or `logger.info`

#### `backend-example/middleware/cors.js`
- **Total:** 3 instances
- **Lines:** 40, 42, 45
- **All should be:** `logger.info` or `logger.warn`

### Frontend Production Files (Priority)

#### `src/screens/ScanRecordScreen.tsx`
- **Total:** ~26 instances
- **Status:** Some already use `logger`, but many still use `console.log`

#### `src/services/RecordIdentificationService.ts`
- **Total:** ~11 instances
- **Status:** Should use `logger.debug`/`logger.info`

#### `src/utils/csvImport.ts`
- **Total:** ~6 instances
- **Status:** Should use `logger.debug`/`logger.info`/`logger.warn`/`logger.error`

#### `src/utils/imageResize.ts`
- **Total:** ~11 instances
- **Status:** Should use `logger.debug`/`logger.info`/`logger.warn`/`logger.error`

---

## Quick Reference: Replacement Guide

### Backend
- `console.log(...)` → `logger.debug(...)` or `logger.info(...)`
- `console.warn(...)` → `logger.warn(...)`
- `console.error(...)` → `logger.error(...)`
- `console.info(...)` → `logger.info(...)`

### Frontend
- `console.log(...)` → `logger.debug(...)` (if dev-only) or `logger.info(...)`
- `console.warn(...)` → `logger.warn(...)`
- `console.error(...)` → `logger.error(...)`
- `console.info(...)` → `logger.info(...)`

**Note:** Frontend logger automatically respects `__DEV__` for `debug`/`info` logs.

