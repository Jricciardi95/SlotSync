# Deep Embedding Integration - Phase 2 Implementation

## Overview

This document describes the comprehensive integration of image embeddings as a **core signal** in the album identification pipeline, not just an add-on feature. Embeddings now drive candidate generation, scoring, and fallback logic alongside OCR and Discogs.

---

## ✅ Implementation Summary

### 1. Centralized Embedding Helpers

#### `getScanEmbedding(imageBuffer, debugInfo)`
- **Location**: `server-hybrid.js` (lines ~1877-1895)
- **Purpose**: Centralized helper for computing embeddings from user scans
- **Features**:
  - Computes embedding early in the pipeline
  - Caches result in debugInfo
  - Handles errors gracefully
  - Returns `null` if computation fails (non-blocking)

#### `ensureRecordEmbedding(recordId, coverImageUrl, metadata)`
- **Location**: `server-hybrid.js` (lines ~1897-1940)
- **Purpose**: Ensures embeddings exist for stored records
- **Features**:
  - Checks if embedding already exists (avoids duplicate work)
  - Downloads cover image from URL
  - Generates embedding
  - Stores in database via `indexCoverEmbedding()`
  - Returns `boolean` indicating success

---

### 2. Enhanced Candidate Generation

#### Embedding-Based Candidates
- **Location**: `server-hybrid.js` (lines ~1950-1995)
- **Features**:
  - Vector search runs **early** (before OCR processing)
  - Configurable `k` and similarity threshold (env vars: `EMBEDDING_K`, `EMBEDDING_MIN_SIMILARITY`)
  - Converts embedding neighbors to candidates with proper metadata:
    ```javascript
    {
      type: 'embedding',
      artist: string,
      title: string,
      recordId: string,
      discogsId: string,
      embeddingSimilarity: number (0-1),
      confidence: number,
      source: 'embedding',
      metadata: {
        embeddingSimilarity: number,
        recordId: string,
        discogsId: string,
      }
    }
    ```

#### Unified Candidate Structure
All candidates now have explicit `type` and `metadata`:
- `type`: `'ocr' | 'barcode' | 'embedding' | 'text'`
- `metadata`: Source-specific data (confidence, similarity, etc.)

#### Embedding Fallback for Weak OCR
- **Location**: `server-hybrid.js` (lines ~2200-2230)
- **Trigger**: When OCR/barcode produce weak candidates (confidence < 0.5) or no candidates
- **Behavior**:
  - Uses embedding neighbors as primary signal
  - Lower similarity threshold (0.65) for fallback
  - Creates candidates even without artist/title (uses discogsId directly)
  - Critical for textless/minimal covers

---

### 3. Scoring Function Updates

#### Updated Weights
- **Location**: `services/discogsScoring.js` (lines ~109-116)
- **New weights**:
  ```javascript
  {
    artistSimilarity: 0.35,      // Increased from 0.25 (OCR primary)
    titleSimilarity: 0.25,       // Kept same
    embeddingSimilarity: 0.20,    // Increased from 0.10 (embeddings are core)
    barcodeMatch: 0.10,          // Reduced from 0.20
    catalogNumberMatch: 0.05,    // Reduced from 0.10
    visionEntityOverlap: 0.05,   // Reduced from 0.10
  }
  ```

#### Enhanced Embedding Matching
- **Location**: `services/discogsScoring.js` (lines ~171-195)
- **Features**:
  - Handles both single signal object and array of matches
  - Finds matching embedding for each release by `discogsId`
  - Applies full 20% weight contribution
  - Debug logging for strong embedding matches (>0.7 similarity)

#### Scoring Integration
- **Location**: `server-hybrid.js` (lines ~2465-2485)
- **Features**:
  - Passes array of embedding matches to `scoreAndSortReleases()`
  - Creates embedding lookup map for fast matching
  - Each release scored with embedding similarity if match exists

---

### 4. Debug Logging

#### Embedding Neighbors Logging
- **Location**: `server-hybrid.js` (lines ~2375-2385)
- **Trigger**: `DEBUG_EMBEDDINGS=true` environment variable
- **Output**: Lists top 5 embedding neighbors with similarity scores

#### Scoring Details Logging
- **Location**: `server-hybrid.js` (lines ~2487-2505)
- **Trigger**: `DEBUG_SCORING=true` environment variable
- **Output**: 
  - Top 3 scored releases
  - Artist/title similarity
  - Embedding similarity and contribution
  - Final score breakdown

---

### 5. Feedback Logging Integration

#### Enhanced Feedback Schema
- **Location**: `services/feedbackRepository.js`
- **Changes**:
  - Added `embedding_summary` column to `identification_feedback` table
  - Stores embedding computation status, neighbor count, fallback usage
  - Includes scan embedding hash (first 16 values) for reference

#### Feedback Data Structure
```javascript
{
  embeddingSummary: {
    embeddingComputed: boolean,
    embeddingNeighborsCount: number,
    embeddingFallbackUsed: boolean,
    scanEmbeddingHash: string,  // First 16 values
    topEmbeddingSimilarity: number,
  }
}
```

#### Candidate Embedding Similarity
- Embedding similarity included in candidate feedback data
- Allows analysis of which embedding matches led to correct identifications

---

### 6. Embedding Storage Strategy

#### Dual Strategy
1. **User Scan Embedding** (preferred):
   - Computed from uploaded image
   - More accurate for specific copy (handles wear, lighting, etc.)
   - Stored immediately after successful identification

2. **Cover Image URL Embedding** (fallback):
   - Generated from Discogs cover image URL
   - Used if scan embedding unavailable
   - Ensures all records have embeddings eventually

#### Storage Flow
```
Successful Identification
  ↓
Store in identified_records table
  ↓
Try: getScanEmbedding(imageBuffer)
  ↓ (if fails)
Try: ensureRecordEmbedding(discogsId, coverImageUrl)
  ↓
indexCoverEmbedding(discogsId, embedding, metadata, db)
  ↓
Persisted to cover_embeddings table
```

---

### 7. Cache Integration

#### Vector Search in Cache Lookup
- **Location**: `server-hybrid.js` (lines ~1754-1829)
- **Strategy**:
  1. **Primary**: Vector search with 0.85 similarity threshold (very high confidence)
  2. **Fallback**: Artist/title exact match
- **Benefits**:
  - Fast visual matching for cached records
  - Works even if artist/title slightly different
  - Source tag: `'local_db_vector'` distinguishes from regular cache

---

## Configuration

### Environment Variables

```bash
# Embedding search configuration
EMBEDDING_K=5                    # Number of neighbors to retrieve (default: 5)
EMBEDDING_MIN_SIMILARITY=0.65    # Minimum similarity threshold (default: 0.65)

# Debug logging
DEBUG_EMBEDDINGS=true            # Log embedding neighbors
DEBUG_SCORING=true               # Log scoring details
```

---

## Impact on Identification Pipeline

### Before (Phase 1)
- Embeddings computed but used minimally
- 10% weight in scoring
- No fallback for weak OCR
- Candidates mostly from OCR/barcode

### After (Phase 2)
- Embeddings are **core signal** (20% weight)
- Drive candidate generation early
- Fallback for weak OCR/barcode cases
- Unified candidate structure with metadata
- Comprehensive feedback logging

### Use Cases Improved

1. **Textless/Minimal Covers**:
   - Embeddings provide primary signal
   - No longer requires OCR text
   - Visual similarity drives identification

2. **Blurry/Low-Quality Images**:
   - Embeddings more robust than OCR
   - Can still match visually similar covers
   - Fallback logic activates automatically

3. **Unusual/Artistic Covers**:
   - Visual similarity finds matches OCR might miss
   - Embeddings capture design patterns, not just text

4. **High-Confidence Matches**:
   - Strong embedding similarity can push score above auto-accept threshold
   - Even with weak OCR, visual match wins

---

## Performance Characteristics

### Embedding Computation
- **Time**: ~200-500ms (CLIP model)
- **Cached**: Yes (LRU cache, 100 entries)
- **Non-blocking**: Errors don't stop identification

### Vector Search
- **Time**: O(n) with early termination
- **Efficient**: For < 10,000 embeddings
- **Threshold**: Configurable (default: 0.65)

### Scoring
- **Embedding Contribution**: Up to 20% of total score
- **Matching**: Fast lookup by discogsId
- **Debug**: Optional detailed logging

---

## Testing Recommendations

1. **Textless Covers**: Test with minimal-text album covers
2. **Blurry Images**: Test with low-quality scans
3. **Embedding Fallback**: Test with OCR disabled or weak
4. **Scoring**: Verify embedding similarity affects final score
5. **Feedback**: Check embedding summary in feedback logs

---

## Future Enhancements

1. **FAISS Integration**: For 100k+ embeddings (approximate nearest neighbor)
2. **Embedding Dimension Optimization**: Reduce from 512 to 256
3. **Batch Embedding Generation**: Migrate existing records in bulk
4. **Embedding-Based Clustering**: Group similar covers
5. **Learning from Feedback**: Use feedback to refine scoring weights

---

## Files Modified

1. `backend-example/server-hybrid.js`
   - Added `getScanEmbedding()` helper
   - Added `ensureRecordEmbedding()` helper
   - Enhanced candidate generation
   - Added embedding fallback logic
   - Updated scoring integration
   - Added debug logging
   - Enhanced feedback logging

2. `backend-example/services/discogsScoring.js`
   - Updated scoring weights (embeddings: 20%)
   - Enhanced embedding matching logic
   - Added debug logging for strong matches

3. `backend-example/services/feedbackRepository.js`
   - Added `embedding_summary` column
   - Updated `logFeedback()` to include embedding data

---

## Summary

Embeddings are now a **first-class citizen** in the identification pipeline:
- ✅ 20% weight in scoring (up from 10%)
- ✅ Drive candidate generation early
- ✅ Provide fallback for weak OCR/barcode
- ✅ Comprehensive feedback logging
- ✅ Dual storage strategy (scan + cover URL)
- ✅ Debug logging for analysis

The system is now significantly more robust for textless, blurry, or unusual covers while maintaining precision for standard cases.

