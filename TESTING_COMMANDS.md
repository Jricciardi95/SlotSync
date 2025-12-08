# Testing Commands for Identification Pipeline

## Quick Start

### Terminal 1: Backend Server

```bash
cd /Users/jamesricciardi/SlotSync/backend-example
export DISCOGS_PERSONAL_ACCESS_TOKEN='gOQSOxYBRENZutcnwOQnAaYMxmePxboOxBfyAeHK'
export ENABLE_GOOGLE_VISION='true'
export CONFIDENCE_THRESHOLD='0.5'
npm start
```

**Expected Output:**
```
✅ Google Vision API client initialized
✅ Connected to local database
✅ Database table ready
[Config] ⚙️  Confidence threshold: 0.5 (set CONFIDENCE_THRESHOLD env var to change)
🚀 SlotSync API Server (Enhanced) running on port 3000
📍 Health check: http://localhost:3000/health
📍 API info: http://localhost:3000/api
📍 Identify endpoint: http://localhost:3000/api/identify-record
✅ Ready to identify records!
```

---

### Terminal 2: Frontend App (Expo)

```bash
cd /Users/jamesricciardi/SlotSync
npx expo start
```

Then:
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Scan QR code with Expo Go app on your phone

---

## What to Watch For in Backend Logs

### When Image is Received:
```
[API] 📸 Image received: cover.jpg
[API] 📸 Image size: 245.32KB (0.24MB)
[API] 📸 Image MIME type: image/jpeg
[API] ✅ Image size is reasonable (245.32KB)
```

### During Vision API Processing:
```
[API] 🔍 Starting Google Vision analysis...
[API] 🔍 Image buffer size: 245.32KB
[API] 🔍 Requesting: WEB_DETECTION, TEXT_DETECTION, LABEL_DETECTION
[Google Vision] 📊 Vision API Response Summary:
[Google Vision]   - Web entities: 12
[Google Vision]   - Page titles: 8
[Google Vision]   - Similar images: 5
[Google Vision]   - Labels: 10
[Google Vision]   - OCR text length: 45 chars
[Google Vision] 🎯 Candidate Extraction Summary:
[Google Vision]   Total candidates: 3
[Google Vision] 📋 All candidates (sorted by confidence):
  1. "Mick Jagger" - "Primitive Cool"
     Confidence: 0.950, Source: all_caps_multiline
```

### During Discogs Search:
```
[Discogs] 🔍 Starting Discogs search...
[Discogs] 🔍 Artist: "Mick Jagger"
[Discogs] 🔍 Title: "Primitive Cool"
[Discogs] 🔍 Generated 15 query variations
[Discogs]   Query 1/15: "Mick Jagger Primitive Cool"
[Discogs]     → Found 3 results
[Discogs]     ✅ Good match: "Mick Jagger" - "Primitive Cool"
[Discogs]        Similarity: 0.985 (artist: 1.000, title: 0.960)
[Discogs] 📊 Search Summary:
[Discogs]   Total results: 3
[Discogs]   🏆 Best similarity: 0.985
[Discogs] 📀 Processing tracklist: 12 entries
[Discogs] ✅ Extracted 12 valid tracks
```

### On Success:
```
[API] ✅ ✅ ✅ IDENTIFICATION SUCCESS ✅ ✅ ✅
[API]   Confidence: 0.923 (threshold: 0.5)
[API]   Source: discogs
[API]   Best match: "Mick Jagger" - "Primitive Cool"
[API]   Year: 1987
[API]   Tracks: 12
[API]   Processing time: 3245ms
```

### On Failure (with suggestions):
```
[API] ❌ ❌ ❌ IDENTIFICATION FAILED ❌ ❌ ❌
[API]   Best confidence: 0.420 (threshold: 0.5)
[API]   Candidates attempted: 3
[API]   Discogs searches: 3
[API] 💡 Suggestions available: 2 Discogs matches
[API] 💡 Top suggestions:
[API]   1. "Mick Jagger" - "Primitive Cool" (similarity: 0.850, confidence: 0.420)
```

---

## Optional: Test API Directly with curl

### Test with Image File:
```bash
curl -X POST http://localhost:3000/api/identify-record \
  -F 'image=@/path/to/album/cover.jpg' \
  -H 'Content-Type: multipart/form-data' \
  | jq '.'
```

### Test with Barcode:
```bash
curl -X POST http://localhost:3000/api/identify-record \
  -H 'Content-Type: application/json' \
  -d '{"barcode":"0123456789012"}' \
  | jq '.'
```

### Test with Text Search:
```bash
curl -X POST http://localhost:3000/api/identify-record \
  -H 'Content-Type: application/json' \
  -d '{"artist":"Mick Jagger","title":"Primitive Cool"}' \
  | jq '.'
```

---

## Testing Checklist

### ✅ Image Quality
- [ ] Image is resized to max 1024px (check logs)
- [ ] Image size is reasonable (< 2MB, ideally < 1MB)
- [ ] Image format is JPEG (check MIME type in logs)

### ✅ Vision API
- [ ] Vision API request is logged
- [ ] Vision response shows web entities, page titles, OCR text
- [ ] Candidates are extracted with confidence scores
- [ ] All-caps text is detected correctly

### ✅ Discogs Search
- [ ] Multiple query variations are tried
- [ ] Similarity scores are calculated (artist + title)
- [ ] Track list is extracted (if available)
- [ ] Best match is selected

### ✅ Success Cases
- [ ] Popular albums identify with confidence > 0.5
- [ ] Track lists are included in response
- [ ] Processing time is reasonable (< 10 seconds)

### ✅ Failure Cases
- [ ] Suggestions are always returned (even if below threshold)
- [ ] Extracted text is included in error response
- [ ] Debug information is comprehensive

---

## Troubleshooting

### Vision API Timeout:
- **Symptom**: "Vision API timeout after 45 seconds"
- **Fix**: Image may be too large, check image size in logs
- **Solution**: Frontend should resize to 1024px max (already implemented)

### No Candidates Extracted:
- **Symptom**: "No candidates extracted" in logs
- **Possible causes**:
  - Poor image quality
  - No text visible on cover
  - Vision API returned no useful data
- **Check**: Look at Vision response summary in logs

### Low Confidence:
- **Symptom**: Confidence below 0.5 threshold
- **Fix**: Lower `CONFIDENCE_THRESHOLD` to 0.4
- **Command**: `export CONFIDENCE_THRESHOLD='0.4'`

### No Suggestions:
- **Symptom**: Error response has no suggestions
- **Fix**: Check Discogs API token is set correctly
- **Check**: Look for "Discogs search" logs

---

## Configuration Options

### Confidence Threshold:
```bash
# More lenient (more matches, possible false positives)
export CONFIDENCE_THRESHOLD='0.4'

# Balanced (default)
export CONFIDENCE_THRESHOLD='0.5'

# Stricter (fewer matches, higher quality)
export CONFIDENCE_THRESHOLD='0.6'
```

### Disable Google Vision (for testing):
```bash
export ENABLE_GOOGLE_VISION='false'
```

---

## Expected Log Flow

1. **Image Received** → Image metadata logged
2. **Vision API** → Request sent, response received
3. **Candidate Extraction** → Candidates extracted with confidence
4. **Discogs Search** → Queries tried, results found
5. **Track Extraction** → Tracks extracted from Discogs
6. **Success/Failure** → Clear result with all details

All steps should be visible in logs with emoji indicators for easy scanning.
