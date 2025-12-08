# Phase 5 – Debug Hooks, Logs, and Hard-Case Testing

## ✅ Completed

Added comprehensive debug logging, test harness, and dev-only testing screen for the identification pipeline.

---

## 🔍 Debug Logging

### Debug Utility (`src/utils/debug.ts`)

**Features:**
- Centralized debug logging behind `DEBUG_IDENTIFICATION` flag
- Automatic sanitization of sensitive data (API keys, tokens, etc.)
- Category-based logging (VISION, CANDIDATES, DISCOGS, etc.)
- Timing information for performance analysis

**Enable Debug Mode:**
```bash
# Set environment variable
EXPO_PUBLIC_DEBUG_IDENTIFICATION=true

# Or in code (dev mode only)
export const DEBUG_IDENTIFICATION = __DEV__ && true;
```

**What Gets Logged:**
- ✅ Image hash (first 16 chars)
- ✅ Top Vision web entities (top 5)
- ✅ OCR text and lines (first 200 chars, top 5 lines)
- ✅ Generated candidates (top 10)
- ✅ Discogs query variations
- ✅ Top Discogs matches (top 5)
- ✅ Final ResolvedAlbum (summary)
- ✅ Cache hits/misses
- ✅ Errors at each stage
- ✅ Timing for each stage

**Security:**
- ✅ All sensitive fields automatically redacted
- ✅ API keys, tokens, secrets never logged
- ✅ Only safe, sanitized data in logs

---

## 🧪 Test Harness

### Test Utility (`src/utils/testHarness.ts`)

**Functions:**
- `testIdentification(imageUri, testName)` - Test single image
- `runAllTests(testImages)` - Run all test cases
- `TEST_CASES` - Hard case definitions

**Hard Cases Defined:**
1. **"Mick Jagger – Primitive Cool"**
   - Apostrophe in artist name
   - Special characters
   
2. **"The B-52's – Party Mix!"**
   - Apostrophe in artist name
   - Exclamation mark in album title
   - "The" prefix handling

**Test Output:**
```
🧪 TEST HARNESS: Manual Test
============================================================
Image: file:///...
Debug mode: ON

[DEBUG:IDENTIFICATION] Image hash: abc123...
[DEBUG:VISION] Top 5 web entities: [...]
[DEBUG:CANDIDATES] Generated 12 candidates...
[DEBUG:DISCOGS] Generated 8 query variations: [...]
[DEBUG:DISCOGS] Top 5 Discogs matches: [...]
[DEBUG:RESOLVED] Final ResolvedAlbum: {...}

============================================================
📊 TEST RESULTS
============================================================
✅ Success: YES
Artist: The B-52's
Album: Party Mix!
Year: 1986
Confidence: 0.850
From Cache: NO
Candidates Used: 12
Tracks: 6
Discogs ID: 12345
MusicBrainz ID: abc-def-...
Cover Art: SET
Total Time: 3456ms
============================================================
```

---

## 📱 Dev Test Screen

### Dev-Only Screen (`src/screens/DevTestScreen.tsx`)

**Features:**
- ✅ Only available in `__DEV__` mode
- ✅ Image picker for selecting test images
- ✅ Run identification test with detailed results
- ✅ View candidates, final album, confidence scores
- ✅ Timing information
- ✅ Debug mode indicator

**Navigation:**
- Added to `LibraryStackParamList` as `DevTest`
- Accessible from Library tab (dev mode only)
- Can be added to Settings screen or hidden menu

**UI:**
- Shows test case descriptions
- Image preview
- Detailed test results
- Candidate list
- Error messages if test fails

---

## 🔒 Security

### No Secrets in Logs

**Sanitization:**
- ✅ Automatic field detection (apiKey, token, secret, etc.)
- ✅ Recursive sanitization of nested objects
- ✅ Safe logging of URLs and metadata
- ✅ Only user-facing data logged

**Example:**
```typescript
// Before sanitization
{
  apiKey: 'sk-1234567890',
  artist: 'The B-52\'s',
  discogsId: '12345'
}

// After sanitization
{
  apiKey: '[REDACTED]',
  artist: 'The B-52\'s',
  discogsId: '12345'
}
```

---

## 📊 Debug Log Locations

### Identification Orchestrator
- Image hash generation
- Cache lookup (hit/miss)
- Vision API call timing
- Candidate extraction
- Metadata resolution timing
- Final result

### Metadata Resolver
- Discogs query generation
- Discogs match results
- MusicBrainz lookup
- Cover art fetch

### Vision Service
- Image preprocessing
- Vision API response
- OCR text extraction
- Web entities

---

## 🎯 Hard Case Testing

### Test Cases

**1. Mick Jagger – Primitive Cool**
- **Challenge:** Apostrophe in artist name
- **Expected:** Correct parsing and Discogs match
- **Debug Points:**
  - Candidate extraction handles apostrophe
  - Discogs queries include apostrophe variations
  - Similarity matching accounts for punctuation

**2. The B-52's – Party Mix!**
- **Challenge:** Apostrophe, exclamation, "The" prefix
- **Expected:** Correct identification despite special characters
- **Debug Points:**
  - "The" prefix removal in queries
  - Apostrophe handling (B-52's vs B-52s)
  - Exclamation mark in album title
  - Multiple query variations generated

---

## 🚀 Usage

### Enable Debug Logging

**Option 1: Environment Variable**
```bash
export EXPO_PUBLIC_DEBUG_IDENTIFICATION=true
npx expo start
```

**Option 2: Code (Dev Only)**
```typescript
// src/utils/debug.ts
export const DEBUG_IDENTIFICATION = __DEV__ && true;
```

### Run Test Harness

**From Code:**
```typescript
import { testIdentification } from '../utils/testHarness';

const result = await testIdentification('file:///path/to/image.jpg', 'Test Name');
console.log('Success:', result.success);
console.log('Album:', result.finalAlbum);
```

**From Dev Screen:**
1. Navigate to Dev Test screen (dev mode only)
2. Pick image from library
3. Tap "Run Test"
4. View detailed results

---

## ✅ Verification

### Debug Logging
- ✅ All stages logged with appropriate detail
- ✅ Sensitive data sanitized
- ✅ Timing information included
- ✅ Error details captured

### Test Harness
- ✅ Works with local images
- ✅ Provides detailed output
- ✅ Handles errors gracefully
- ✅ Shows candidates and final result

### Dev Screen
- ✅ Only available in dev mode
- ✅ Clean UI for testing
- ✅ Detailed results display
- ✅ Easy image selection

### Security
- ✅ No API keys in logs
- ✅ No tokens in logs
- ✅ No secrets in logs
- ✅ Safe for production (when disabled)

---

## 📝 Production Notes

**Debug Mode:**
- Automatically disabled in production builds
- Only active when `__DEV__` is true AND flag is set
- No performance impact when disabled
- Can be toggled without code changes

**Test Screen:**
- Only compiled in dev builds
- Not accessible in production
- No impact on production bundle size

**Logs:**
- All debug logs use `console.log` (can be filtered)
- No external logging service
- Safe to leave enabled in dev

**Phase 5 Complete!** ✅

The identification engine is now fully debuggable with comprehensive logging and testing tools for hard cases.

