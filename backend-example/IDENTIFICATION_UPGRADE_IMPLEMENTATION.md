# Identification System Upgrade - Implementation Guide

This document describes the implementation of the enhanced identification system.

## Key Changes

### 1. OCR-First Approach
- OCR text parsing is now PRIMARY (not web detection)
- New `parseArtistAndAlbumFromOcrText()` function in `services/ocrParser.js`
- Web detection is now SECONDARY (only used for confidence boosting)

### 2. Image Embeddings + Vector Search
- New `embeddingService.js` for computing image embeddings
- New `vectorIndex.js` for storing and searching embeddings
- Embeddings computed after preprocessing, before Discogs search
- Top k similar covers used as additional candidates

### 3. Explicit Per-Release Scoring
- New `discogsScoring.js` module
- Each Discogs release scored using multiple features:
  - artist_similarity
  - title_similarity
  - barcode_match
  - catalog_number_match
  - vision_entity_overlap
  - embedding_similarity
- Dual thresholds: AUTO_ACCEPT (0.8) and SUGGESTIONS (0.5)

### 4. Variant Release Grouping
- Releases grouped by canonical album key
- Best release selected from each group
- Prevents random variants from taking precedence

### 5. User Feedback Logging
- New `feedbackRepository.js` for logging user corrections
- `identification_feedback` table stores:
  - imageHash
  - final_record_id / discogsId
  - candidate_data (scores, Discogs IDs)
  - vision/OCR summary
  - source (scan/manual/multiple-choice)

### 6. Web Noise Filtering
- New `webNoiseFilter.js` module
- Hard-filters URLs, e-commerce keywords, article patterns
- Applied consistently to all web detection results

## Integration Points

### In `generateCandidatesFromInput()`:
1. **Barcode first** (if present) - strongest signal
2. **Compute image embedding** (if image input)
3. **Vector search** for similar covers
4. **Google Vision** (OCR + Web + Labels)
5. **Parse OCR text** using `parseArtistAndAlbum()` (PRIMARY)
6. **Filter web noise** from web entities
7. **Extract candidates** from OCR (primary) and filtered web entities (secondary)

### In `resolveBestAlbum()`:
1. **Check feedback** for imageHash (if available)
2. **Search Discogs** for all candidates
3. **Score all releases** using `scoreAndSortReleases()`
4. **Group variants** using `selectBestFromGroups()`
5. **Determine response type** using `determineResponseType()`
6. **Return** single match (auto-accept) or suggestions (user choice)

## Backward Compatibility

The API response structure remains the same:
- `success: true/false`
- `artist`, `albumTitle`, `year`, `discogsId`, `coverImageUrl`, `tracks`
- `confidence` score
- `albumSuggestions` array (for low confidence)

New internal fields may be added but won't break existing frontend code.

## Database Schema Updates

### New Tables:
1. `cover_embeddings` - Stores embedding vectors
2. `identification_feedback` - Stores user feedback

### Existing Tables:
- `identified_records` - Unchanged (backward compatible)

## Configuration

### Environment Variables:
- `AUTO_ACCEPT_THRESHOLD` (default: 0.8)
- `SUGGESTIONS_THRESHOLD` (default: 0.5)
- `CONFIDENCE_THRESHOLD` (legacy, still supported)
- `OPENAI_API_KEY` (optional, for GPT OCR parsing if enabled)
- `USE_GPT_OCR_PARSING` (default: false, set to 'true' to enable)

## Testing

Test the upgraded system with:
1. Clear album covers (should work well)
2. Low-text/textless covers (embeddings should help)
3. Noisy web pages in background (web noise filter should help)
4. Variant releases (grouping should help)
5. Repeated scans (feedback should help)

