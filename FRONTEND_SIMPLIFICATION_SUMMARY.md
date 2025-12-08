# Frontend Simplification Summary

## Changes Made

### ✅ 1. Orchestrator Refactored to Use Backend as Single Source of Truth

**File**: `src/services/identification/orchestrator.ts`

**Before**: 
- Called Vision API, extracted candidates client-side
- Resolved metadata client-side using Discogs/MusicBrainz/CAA
- Duplicated backend logic

**After**:
- Only validates image, hashes it, calls backend `/api/identify-record`
- Backend performs all identification (Vision → Candidates → Discogs → MusicBrainz → CAA)
- Parses backend response → ResolvedAlbum
- Saves to cache

**Key Changes**:
- Removed `extractCandidates()` call
- Removed `resolveAlbumFromCandidates()` call
- Added `callBackendIdentification()` function
- Simplified flow to: validate → hash → cache check → backend call → cache save

### ✅ 2. Candidate Extractor & Metadata Resolver Marked as DEV-ONLY

**Files**:
- `src/services/vision/candidateExtractor.ts`
- `src/services/metadata/metadataResolver.ts`

**Changes**:
- Added clear `DEV-ONLY` warnings at top of files
- Marked as for testing/development only
- Not used in production user-facing flows
- Available for DevTestScreen and debugging

### ✅ 3. All Scan Flows Use Orchestrator

**Verified Screens**:
- ✅ `ScanRecordScreen.tsx` - Uses `identifyRecord()` from `RecordIdentificationService`
- ✅ `RecordDetailScreen.tsx` - Uses `identifyRecord()` for fetching tracks
- ✅ `BatchReviewScreen.tsx` - Uses `identifyRecord()` for batch processing

**Note**: `RecordIdentificationService.ts` is a legacy compatibility layer that:
- Internally calls `identifyAlbumFromImage()` from orchestrator
- Converts response to legacy format
- Maintains backward compatibility

**All flows correctly route through orchestrator** ✅

## Architecture

```
User Action (Scan Button)
    ↓
ScanRecordScreen.tsx
    ↓
RecordIdentificationService.identifyRecord() [Legacy wrapper]
    ↓
identification/orchestrator.identifyAlbumFromImage() [Core]
    ↓
Backend /api/identify-record [Single Source of Truth]
    ↓
Response: { success, artist, albumTitle, releaseYear, discogsId, coverImageUrl, tracks }
    ↓
Cache Save (image hash → record)
    ↓
UI Display
```

## Benefits

1. **Single Source of Truth**: All identification logic in backend
2. **Simpler Frontend**: Just validation, hashing, API call, caching
3. **Easier Maintenance**: Changes only needed in backend
4. **Better Performance**: No duplicate API calls
5. **Consistent Results**: Same logic for all users

## Dev Tools Preserved

- ✅ `DevTestScreen.tsx` - Still available for testing
- ✅ `candidateExtractor.ts` - Available for dev/testing
- ✅ `metadataResolver.ts` - Available for dev/testing
- ✅ Debug flags (`EXPO_PUBLIC_DEBUG_IDENTIFICATION`) - Still work

## Next Steps

1. ✅ Frontend simplified - **DONE**
2. ✅ Backend confidence centralized - **DONE**
3. ✅ Backend logging improved - **DONE**
4. ✅ Dev test harness added - **DONE**
5. ⏳ Test with real images to verify flow

