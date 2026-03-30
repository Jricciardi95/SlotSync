# Fix: /api/identify-record HTTP Status Code Logic

## Problem
The `/api/identify-record` endpoint` was returning HTTP 400 even when it successfully identified plausible matches (e.g., Bob Seger - Live Bullet). This happened when:
- Google Vision found strong entities and pagesWithMatchingImages
- Discogs search returned results with release details
- But the confidence score was below the auto-accept threshold

## Solution
Refactored the response logic to:
1. **Only return HTTP 400 for invalid requests** (no file, unsupported mime, file too large, etc.)
2. **Return HTTP 200 with suggestions** when ANY plausible matches are found, even if low confidence
3. **Add status field** to distinguish between 'ok', 'low_confidence', and 'no_match'
4. **Include debug output** with score thresholds and reasons (when DEBUG_IDENTIFY=true)

## Changes Made

### 1. Updated "No Best Match" Path (lines ~4325-4443)
**Before:**
- Returned 400 if no best match found
- Status was 'ok' or 'error' (binary)

**After:**
- Returns 200 if ANY suggestions exist (even low confidence)
- Returns 400 only if NO suggestions at all
- Status field: 'ok', 'low_confidence', or 'no_match'
- Debug output includes:
  - `bestScore`: Best suggestion score
  - `autoAcceptThreshold`: AUTO_ACCEPT_THRESHOLD (default 0.8)
  - `suggestionsThreshold`: SUGGESTIONS_THRESHOLD (default 0.5)
  - `reasons`: Object explaining why status was set

### 2. Updated Success Path (lines ~4585-4650)
**Before:**
- Always returned status 'ok'
- No suggestions included for confirmed matches

**After:**
- Status can be 'ok' or 'low_confidence' based on actual confidence score
- Includes suggestions array even for confirmed matches (if available)
- Debug output includes thresholds and scoring reasons

### 3. Updated resolveBestAlbum (lines ~3898-3932)
**Before:**
- Didn't store responseType in debugInfo

**After:**
- Stores `responseType` in `debugInfo` for debug output
- Adds logging for better visibility of decision-making

## Response Structure

### Success (HTTP 200)
```json
{
  "status": "ok" | "low_confidence" | "no_match",
  "confidenceLevel": "high" | "medium" | "low",
  "best": {
    "artist": "...",
    "albumTitle": "...",
    "releaseYear": 1976,
    "discogsId": "...",
    "confidence": 0.85
  } | null,  // null if confidence < AUTO_ACCEPT_THRESHOLD
  "suggestions": [
    {
      "artist": "...",
      "albumTitle": "...",
      "releaseYear": 1976,
      "discogsId": "...",
      "confidence": 0.65,
      "source": "discogs_scored"
    }
  ],
  "debug": {
    // ... existing debug info ...
    "scoring": {  // Only if DEBUG_IDENTIFY=true
      "bestScore": 0.65,
      "autoAcceptThreshold": 0.8,
      "suggestionsThreshold": 0.5,
      "responseType": "low_confidence",
      "reasons": {
        "belowAutoAccept": true,
        "belowSuggestions": false,
        "hasSuggestions": true
      }
    }
  }
}
```

### Error (HTTP 400) - Only for Invalid Requests
```json
{
  "status": "no_match",
  "confidenceLevel": "low",
  "suggestions": [],
  "code": "NO_CANDIDATES" | "VISION_FAILED" | "DISCOGS_FAILED",
  "error": "Could not identify record",
  "message": "Please try manual entry or ensure the album cover is clear and well-lit",
  "debug": { ... }
}
```

## Status Field Values

- **`"ok"`**: High or medium confidence match (score >= SUGGESTIONS_THRESHOLD)
- **`"low_confidence"`**: Low confidence but still has suggestions (score < SUGGESTIONS_THRESHOLD but > 0)
- **`"no_match"`**: No suggestions found (score = 0 or no candidates)

## Confidence Level Values

- **`"high"`**: Score >= AUTO_ACCEPT_THRESHOLD (0.8)
- **`"medium"`**: Score >= SUGGESTIONS_THRESHOLD (0.5) but < AUTO_ACCEPT_THRESHOLD
- **`"low"`**: Score < SUGGESTIONS_THRESHOLD

## Testing

To test with Bob Seger Live Bullet case:
1. Set `DEBUG_IDENTIFY=true` in environment
2. Send image of Bob Seger - Live Bullet album cover
3. Verify response:
   - HTTP status: 200 (not 400)
   - `status`: "low_confidence" or "ok" (depending on score)
   - `suggestions`: Array with at least one suggestion
   - `debug.scoring`: Contains thresholds and reasons

## Backward Compatibility

All existing fields are preserved:
- `success`: Boolean (true if hasSuggestions)
- `albumSuggestions`: Alias for `suggestions`
- `bestMatch`: Legacy format (still included)
- `alternates`: Empty array (for compatibility)

Frontend should continue to work, but can now use:
- `status` field for more granular status
- `suggestions` array (preferred over `albumSuggestions`)
- `best` field for auto-accepted matches

## Environment Variables

- `DEBUG_IDENTIFY=true`: Enables detailed scoring debug output
- `AUTO_ACCEPT_THRESHOLD`: Default 0.8 (can be overridden)
- `SUGGESTIONS_THRESHOLD`: Default 0.5 (can be overridden)

