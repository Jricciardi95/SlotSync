# Metadata Resolver Module

This module resolves identification candidates to real vinyl albums using Discogs → MusicBrainz → Cover Art Archive.

## Overview

The metadata resolver takes candidates from the Vision stage and resolves them to complete album metadata:

```
Vision Candidates
  ↓
Discogs Search (multiple query variants)
  ↓
MusicBrainz Lookup (if Discogs match found)
  ↓
Cover Art Archive (HD cover art using MBID)
  ↓
ResolvedAlbum (complete metadata)
```

## Architecture

**Frontend (React Native):**
- Structures requests and parses responses
- Orchestrates the resolution pipeline
- Handles error cases gracefully

**Backend (Node.js):**
- Makes actual API calls to Discogs/MusicBrainz/CAA
- Handles rate limiting and authentication
- Returns structured responses

## Files

- **`types.ts`** - TypeScript type definitions
  - `ResolvedAlbum` - Final resolved album with complete metadata
  - `DiscogsSearchResult` - Discogs search result
  - `MusicBrainzRelease` - MusicBrainz release data
  - `TrackInfo` - Track information with side/position

- **`discogsClient.ts`** - Discogs API client
  - `searchDiscogs()` - Search with multiple query variants
  - `getDiscogsRelease()` - Fetch full release details
  - `generateDiscogsQueries()` - Generate search query variants
  - `isValidDiscogsRelease()` - Filter non-album content

- **`musicbrainzClient.ts`** - MusicBrainz API client
  - `searchMusicBrainzRelease()` - Search for release
  - `getMusicBrainzReleaseDetails()` - Fetch full release with tracks
  - `findMusicBrainzIdFromDiscogs()` - Find MBID from Discogs ID

- **`caaClient.ts`** - Cover Art Archive client
  - `getCoverArtFromCAA()` - Fetch HD cover art (prefers 500px/1200px)
  - `getAllCoverArt()` - Fetch all available images

- **`metadataResolver.ts`** - Main resolver
  - `resolveAlbumFromCandidates()` - Orchestrates full pipeline

## Usage

### Resolve Candidates to Album

```typescript
import { resolveAlbumFromCandidates } from './services/metadata';
import type { IdentificationCandidate } from './services/vision';

const candidates: IdentificationCandidate[] = [
  {
    artist: 'The Beatles',
    album: 'Abbey Road',
    source: 'web_entity',
    confidence: 0.9,
    rawText: 'The Beatles - Abbey Road',
  },
];

const resolved = await resolveAlbumFromCandidates(candidates, {
  minConfidence: 0.6,
  preferVinyl: true,
  fetchTracks: true,
  fetchCoverArt: true,
});

if (resolved) {
  console.log(`Found: ${resolved.artist} - ${resolved.albumTitle}`);
  console.log(`Year: ${resolved.releaseYear}`);
  console.log(`Tracks: ${resolved.tracks.length}`);
  console.log(`Cover: ${resolved.coverHdUrl}`);
}
```

## Resolution Pipeline

### 1. Discogs Search

For each candidate:
- Generates multiple query variants:
  - `"Artist Album"`
  - `artist:"Artist" title:"Album"`
  - Cleaned versions (remove "(Remastered)", etc.)
  - Without "The" prefix
  - Without trailing punctuation
- Makes multiple queries (stops early if high-confidence match found)
- Filters results to ensure they're actual album releases (not lists/articles)

### 2. MusicBrainz Lookup

If Discogs match found:
- Tries to find MBID from Discogs relation
- If not found, searches MusicBrainz directly
- Fetches full release details including tracks

### 3. Cover Art Archive

If MusicBrainz MBID available:
- Fetches HD cover art from CAA (prefers 500px/1200px)
- Falls back to Discogs cover art if CAA unavailable

### 4. Track Parsing

- Prefers MusicBrainz tracks (more structured)
- Falls back to Discogs tracks
- Parses side information (A, B, etc.) from Discogs positions
- Converts durations to seconds

## Filtering Rules

The resolver ensures final results are actual album releases:

**Discogs Filtering:**
- Rejects non-album patterns ("best album", "top 20", etc.)
- Prefers vinyl releases (if `preferVinyl: true`)
- Validates similarity scores

**Result Validation:**
- Must have artist and title
- Must pass Discogs validation
- Must meet minimum confidence threshold

## Error Handling

- **Failed Discogs search**: Tries next candidate
- **Failed MusicBrainz lookup**: Continues with Discogs data only
- **Failed CAA fetch**: Falls back to Discogs cover art
- **No tracks found**: Returns empty tracks array
- **All candidates fail**: Returns `null`

## Backend Endpoints Required

The frontend clients call these backend endpoints (which proxy to APIs):

- `POST /api/metadata/discogs/search` - Discogs search
- `GET /api/discogs/release/:id` - Discogs release details (existing)
- `POST /api/metadata/musicbrainz/search` - MusicBrainz search
- `GET /api/metadata/musicbrainz/release/:mbid` - MusicBrainz release details
- `GET /api/metadata/musicbrainz/from-discogs/:discogsId` - Find MBID from Discogs ID
- `GET /api/metadata/caa/release/:mbid` - Cover Art Archive images

**Note:** These endpoints need to be implemented on the backend if they don't already exist. The frontend resolver is ready to use them once they're available.

## Rate Limiting

The resolver is rate-limit friendly:
- Stops early if high-confidence match found
- Limits number of queries per candidate
- Handles HTTP errors gracefully
- Logs errors for debugging

## Notes

- **HD Cover Art**: Always prefers CAA (highest quality), falls back to Discogs
- **Vinyl Preference**: Can filter to prefer vinyl releases
- **Track Parsing**: Handles Discogs position formats (A1, B2, 1-1, etc.)
- **Confidence Scoring**: Combines candidate confidence with Discogs similarity

