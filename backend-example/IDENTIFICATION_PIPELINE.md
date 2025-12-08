# Album Identification Pipeline

## Overview

The SlotSync identification pipeline uses a multi-layered approach to identify vinyl records from album cover photos:

1. **Image Preprocessing** (optional) - Enhances image quality
2. **Google Vision API** - Extracts text and web entities
3. **Artist/Title Extraction** - Multiple strategies to parse metadata
4. **Discogs Search** - Finds matching releases with fuzzy matching
5. **Confidence Scoring** - Selects best match based on similarity

## Pipeline Flow

```
Image Upload
    ↓
[Optional] Image Preprocessing (contrast, sharpening)
    ↓
Google Vision API (WEB_DETECTION, TEXT_DETECTION, LABEL_DETECTION)
    ↓
Extract Artist/Title (prioritize web detection → OCR)
    ↓
Generate Multiple Discogs Query Variations
    ↓
Search Discogs with Fuzzy Matching
    ↓
Score Results (similarity + confidence)
    ↓
Return Best Match (if confidence >= threshold)
```

## Configuration

### Environment Variables

- `CONFIDENCE_THRESHOLD` - Minimum confidence for positive match (default: 0.5)
  - Lower (0.4-0.5) = More lenient, catches more albums
  - Higher (0.6-0.7) = Stricter, fewer false positives

- `DEBUG_IDENTIFICATION` - Enable detailed logging (default: false)
  - Set to `'true'` for verbose debugging output

- `ENABLE_GOOGLE_VISION` - Enable/disable Vision API (default: true)
- `ENABLE_IMAGE_PREPROCESSING` - Enable image enhancement (default: false)
- `ENABLE_IMAGE_EMBEDDINGS` - Enable embedding-based matching (default: false)
- `ENABLE_GPT4_VISION` - Enable GPT-4 Vision fallback (default: false)

## Extraction Strategies

### Priority Order

1. **Web Detection Page Titles** (highest priority)
   - Most reliable source
   - Often contains "Artist - Title" format
   - Example: "Pink Floyd - The Dark Side Of The Moon"

2. **Web Entities Descriptions**
   - Entity descriptions from Google's knowledge graph
   - Example: "The Dark Side Of The Moon by Pink Floyd"

3. **OCR Text** (last resort)
   - Raw text extracted from image
   - Uses heuristics to split into artist/title

### Extraction Heuristics

- **Dash patterns**: `"Artist - Title"`, `"Artist: Title"`
- **"by" patterns**: `"Title by Artist"`
- **Line-based**: First two non-empty lines
- **Word splitting**: For single-line text (3-10 words)

## Discogs Search

### Query Variations

The system generates multiple query variations for robustness:

- Original: `"Artist Title"`
- Quoted: `"Artist" "Title"`
- Field-specific: `artist:"Artist" title:"Title"`
- Punctuation variants: Handles apostrophes, exclamation marks
- Cleaned versions: Removes "feat.", "and", etc.

### Fuzzy Matching

- **Similarity Score**: 0-1 based on text matching
  - Artist weight: 60%
  - Title weight: 40%
- **Confidence Score**: 0.6-0.95 based on similarity
  - Base: 0.6 + (similarity * 0.3)
  - Bonus: +0.05 for similarity > 0.8
  - Bonus: +0.05 for both artist and title matching well

## Response Format

### Success Response (200)

```json
{
  "success": true,
  "confidence": 0.82,
  "bestMatch": {
    "artist": "Pink Floyd",
    "title": "The Dark Side Of The Moon",
    "year": 1973,
    "discogsId": 249504,
    "coverImageRemoteUrl": "https://...",
    "tracks": [
      { "title": "Speak to Me", "trackNumber": 1 },
      ...
    ]
  },
  "alternates": [...],
  "source": "vision+discogs"
}
```

### Error Response (400)

```json
{
  "error": "Could not identify record with sufficient confidence",
  "message": "Found 3 possible matches. Please review suggestions...",
  "extractedText": "...",
  "candidates": [...],
  "discogsSuggestions": [
    {
      "artist": "Pink Floyd",
      "title": "The Dark Side Of The Moon",
      "confidence": 0.75,
      "similarity": 0.85
    }
  ],
  "debug": {
    "processingTime": 1234,
    "visionProcessing": 567,
    "discogsSearches": 3,
    ...
  }
}
```

## Debugging

### Enable Debug Mode

```bash
export DEBUG_IDENTIFICATION='true'
```

### What to Look For

1. **Vision API Results**
   - Check `[Google Vision]` logs for OCR text and web entities
   - Verify page titles are being extracted

2. **Extraction**
   - Check `[VisionExtractor]` logs for extraction source
   - Verify artist/title are being parsed correctly

3. **Discogs Search**
   - Check `[Discogs]` logs for query variations
   - Verify similarity scores are reasonable (>0.5 for good matches)

4. **Confidence**
   - Check final confidence vs. threshold
   - If close but below threshold, consider lowering it

### Common Issues

**No candidates extracted**
- Vision API might not be finding text/entities
- Check image quality and lighting
- Verify Vision API is enabled and configured

**Low similarity scores**
- Artist/title might be slightly different in Discogs
- Check query variations are being generated
- Verify Discogs token is valid

**Confidence just below threshold**
- Consider lowering `CONFIDENCE_THRESHOLD` slightly
- Check if similarity is high but confidence calculation is conservative

## Testing

### Manual Test

```bash
curl -X POST http://localhost:3000/api/identify-record \
  -F "image=@/path/to/album/cover.jpg" \
  -H "Content-Type: multipart/form-data"
```

### Expected Logs

```
[API] 📸 Image received: cover.jpg
[API] 🔍 Starting Google Vision analysis...
[Google Vision] ✅ Vision analysis complete
[API] ✅ Primary extraction: "Artist" - "Title" (source: web_page_title)
[Discogs] 🔍 Starting Discogs search...
[Discogs] ✅ Best match: "Artist" - "Title"
[API] ✅ ✅ ✅ IDENTIFICATION SUCCESS ✅ ✅ ✅
```

## Performance

- **Typical processing time**: 2-5 seconds
- **Vision API**: ~1-2 seconds
- **Discogs search**: ~0.5-1 second per query variation
- **Total queries**: Usually 3-5 variations tried

## Future Improvements

- [ ] Cache Vision API results by image hash
- [ ] Pre-filter Discogs queries by year (if available)
- [ ] Use machine learning for better artist/title splitting
- [ ] Support for non-English album covers

