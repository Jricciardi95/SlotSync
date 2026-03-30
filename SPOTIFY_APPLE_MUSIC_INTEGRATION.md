# 🎵 Spotify/Apple Music API Integration Guide

## Overview

This document outlines how to integrate Spotify or Apple Music APIs to enrich track data with:
- **Accurate track length** (more reliable than Discogs)
- **BPM (Beats Per Minute)** - from audio analysis
- **Additional audio features** (key, mode, time signature, energy, danceability, etc.)

## ✅ Your Assumption is CORRECT!

Both Spotify and Apple Music APIs provide:
- ✅ **Accurate track length** (duration_ms/durationInMillis)
- ✅ **BPM/tempo** (from audio analysis)
- ✅ **Additional audio features** (key, mode, time signature, energy, danceability, valence, etc.)

## API Comparison

### Spotify API
**Endpoint**: `GET /v1/audio-features/{id}`
**Provides**:
- `duration_ms` - Track length in milliseconds
- `tempo` - BPM (Beats Per Minute)
- `key` - Musical key (0-11, -1 if no key detected)
- `mode` - Major (1) or Minor (0)
- `time_signature` - Time signature (3-7)
- `energy` - Energy level (0.0-1.0)
- `danceability` - Danceability (0.0-1.0)
- `valence` - Positivity (0.0-1.0)
- And more...

**Matching Strategy**:
1. Search by artist + track title
2. Use ISRC (International Standard Recording Code) if available
3. Match by track name similarity

### Apple Music API
**Endpoint**: `GET /v1/catalog/{storefront}/songs/{id}`
**Provides**:
- `durationInMillis` - Track length
- Audio features via separate endpoint (similar to Spotify)

**Matching Strategy**:
1. Search by artist + track title
2. Use ISRC if available
3. Match by track name similarity

## Current Implementation Status

### ✅ Completed
- [x] BPM field added to database schema
- [x] BPM field added to Track type
- [x] UI displays BPM (when available)
- [x] Database migration handles existing databases

### 🔄 To Do
- [ ] Add Spotify/Apple Music API credentials to backend
- [ ] Create track matching service (artist + title → API track ID)
- [ ] Create audio features fetching service
- [ ] Create background job to enrich existing tracks
- [ ] Add API endpoint to trigger enrichment
- [ ] Update CSV import to fetch BPM/duration from streaming APIs
- [ ] Update photo scan to fetch BPM/duration from streaming APIs

## Implementation Plan

### Phase 1: Backend Service Setup
1. Add environment variables:
   - `SPOTIFY_CLIENT_ID`
   - `SPOTIFY_CLIENT_SECRET`
   - `APPLE_MUSIC_KEY_ID`
   - `APPLE_MUSIC_TEAM_ID`
   - `APPLE_MUSIC_PRIVATE_KEY`

2. Create service: `backend-example/services/streamingApiService.js`
   - Spotify search and audio features
   - Apple Music search and audio features
   - Track matching logic (artist + title → track ID)

### Phase 2: Track Enrichment
1. Create endpoint: `POST /api/enrich-tracks/:recordId`
   - Fetches tracks for record
   - Matches each track with Spotify/Apple Music
   - Updates tracks with BPM and accurate duration
   - Returns enriched track data

2. Create background job: `POST /api/enrich-all-tracks`
   - Enriches all tracks in database (batch processing)
   - Rate-limited to respect API limits

### Phase 3: Automatic Enrichment
1. Integrate into CSV import flow
2. Integrate into photo scan flow
3. Add "Enrich Tracks" button in RecordDetailScreen

## Example API Response

### Spotify Audio Features
```json
{
  "duration_ms": 225200,
  "tempo": 120.5,
  "key": 5,
  "mode": 1,
  "time_signature": 4,
  "energy": 0.8,
  "danceability": 0.7,
  "valence": 0.6
}
```

### Apple Music Song
```json
{
  "attributes": {
    "durationInMillis": 225200,
    "name": "Track Title",
    "artistName": "Artist Name"
  }
}
```

## Rate Limits

### Spotify
- 300 requests per 30 seconds (per user)
- Use batch requests when possible

### Apple Music
- 20 requests per second
- Use batch requests when possible

## Next Steps

1. **Choose API**: Spotify or Apple Music (or both?)
2. **Get API Credentials**: Register app and get keys
3. **Implement Matching**: Create track matching service
4. **Test Enrichment**: Test with a few tracks
5. **Deploy**: Add to production

## Notes

- Discogs does NOT provide BPM data (only physical release metadata)
- Streaming APIs provide audio analysis data (BPM, key, etc.)
- ISRC codes are the most reliable way to match tracks
- Fallback to artist + title matching if ISRC unavailable
