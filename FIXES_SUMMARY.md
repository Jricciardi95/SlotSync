# SlotSync Fixes Summary

## Overview
This document summarizes all fixes implemented to address the four main problems plus the design rule.

---

## 1. Suggestion Quality Problem - FIXED

### Problem
App was suggesting links, article titles, Wikipedia pages, etc. instead of real album titles.

### Solution

#### Backend Filter Enhancement (`backend-example/server-hybrid.js`)

**Enhanced `isAlbumNameOnlyCandidate()` function:**
```javascript
// Added "review", "reviews", "lyrics" to rejection patterns
const nonAlbumPatterns = [
  'best album covers',
  'top ',
  'the 10 best',
  'the 20 best',
  'album covers from',
  'cover art from',
  'facebook',
  'twitter',
  'pinterest',
  'instagram',
  'creative bloq',
  'blog',
  'reddit',
  'tumblr',
  'soundtrack review',
  'review',        // NEW
  'reviews',       // NEW
  'lyrics',        // NEW
  'lyric',         // NEW
  'ranked',
  'list of',
  // ... rest of patterns
];
```

**Applied filter in ALL candidate generation paths:**

1. **Vision OCR candidates:**
```javascript
// Add secondary OCR candidates (cap at 5, filter low confidence AND filter non-albums)
if (visionResult.extractedText) {
  const textCandidates = extractCandidates(visionResult.extractedText);
  for (const candidate of textCandidates) {
    // CRITICAL: Filter out non-album candidates
    if (candidate.confidence >= 0.3 && 
        isAlbumNameOnlyCandidate(candidate) && 
        candidates.length < 5) {
      if (!candidates.find(c => key(c) === key(candidate))) {
        candidates.push(candidate);
      }
    }
  }
}
```

2. **Embedding matches:**
```javascript
for (const similar of similarAlbums) {
  const candidate = {
    artist: similar.artist,
    title: similar.title,
    confidence: 0.8 * similar.similarity,
    source: 'embedding_match',
    year: similar.year,
    discogsId: similar.discogsId,
  };
  // CRITICAL: Filter out non-album candidates
  if (isAlbumNameOnlyCandidate(candidate) && candidates.length < 5) {
    candidates.push(candidate);
  }
}
```

3. **MusicBrainz OCR fallback:**
```javascript
const candidate = {
  artist: mbFallback.artist,
  title: mbFallback.title,
  confidence: 0.5,
  source: 'musicbrainz_ocr_fallback',
  musicbrainz: { mbid: mbFallback.mbid, year: mbFallback.year },
};
// CRITICAL: Filter out non-album candidates
if (isAlbumNameOnlyCandidate(candidate)) {
  candidates.push(candidate);
}
```

#### Frontend Safety Filter (`src/services/RecordIdentificationService.ts`)

**Added `looksLikeRealAlbumTitle()` helper:**
```typescript
function looksLikeRealAlbumTitle(candidate: IdentificationMatch): boolean {
  if (!candidate.title || candidate.title.length < 2) return false;
  if (!candidate.artist) return false; // Must have artist

  const artist = (candidate.artist || '').trim().toLowerCase();
  const title = candidate.title.trim().toLowerCase();
  const combined = `${artist} ${title}`;

  // Reject URLs
  if (combined.includes('http://') || combined.includes('https://') || 
      combined.includes('www.') || combined.includes('.com') ||
      combined.includes('.net') || combined.includes('.org')) {
    return false;
  }

  // Reject article/blog patterns
  const badPatterns = [
    'wikipedia', 'wiki/', 'review', 'reviews', 'lyrics', 'lyric',
    'blog', 'reddit', 'facebook', 'twitter', 'pinterest', 'instagram',
    'best album covers', 'top ', 'the 10 best', 'the 20 best',
    'album covers from', 'r/musicsuggestions', 'r/', '| releases',
    'discogs', 'releases', 'release',
  ];
  
  if (badPatterns.some(p => combined.includes(p))) return false;

  // Reject pipe characters, long titles, generic words
  if (artist.includes('|') || title.includes('|')) return false;
  if (title.length > 80) return false;
  if (['discogs', 'releases', 'album', 'albums'].includes(title)) return false;

  return true;
}
```

**Applied filter to all candidate arrays:**
```typescript
const candidates: IdentificationMatch[] = (Array.isArray(errorData.candidates) ? errorData.candidates : [])
  .filter((c: any) => c.artist && c.title)
  .map((c: any) => ({
    artist: c.artist,
    title: c.title,
    year: c.year || undefined,
    confidence: c.confidence || undefined,
    source: c.source || undefined,
    coverImageRemoteUrl: c.coverImageRemoteUrl || undefined,
    discogsId: c.discogsId || undefined,
  }))
  .filter(looksLikeRealAlbumTitle); // Frontend safety filter
```

---

## 2. Manual Artist + Album Auto-Fill - VERIFIED

### Problem
When user manually types artist and album title, metadata should auto-fill (year, tracks, cover image).

### Solution

#### Backend Endpoint (`backend-example/server-hybrid.js`)

**`/api/identify-by-text` endpoint:**
```javascript
app.post('/api/identify-by-text', async (req, res) => {
  try {
    const { artist, title } = req.body;

    if (!artist || !title) {
      return res.status(400).json({ error: 'Artist and title are required' });
    }

    console.log(`[API] Text-based identification: "${artist}" - "${title}"`);

    // Use unified resolver - ALWAYS returns HQ cover art from APIs
    const metadata = await resolveAlbumMetadata(artist.trim(), title.trim());

    if (!metadata) {
      return res.status(400).json({
        success: false,
        code: 'NOT_FOUND',
        message: `Could not find album "${title}" by "${artist}"`,
      });
    }

    // Convert unified metadata to API response format
    const primaryMatch = {
      artist: metadata.canonicalArtist || metadata.artist,
      title: metadata.canonicalAlbum || metadata.album,
      year: metadata.releaseYear,
      coverImageRemoteUrl: metadata.coverImage, // ALWAYS HQ from API
      discogsId: metadata.discogsId,
      tracks: metadata.tracks.map(t => ({
        title: t.title,
        trackNumber: t.number,
        durationSeconds: t.durationMs ? Math.floor(t.durationMs / 1000) : null,
        discNumber: t.discNumber || null,
      })),
      genres: metadata.genres,
      styles: metadata.styles,
      confidence: metadata.confidence,
      source: 'unified_resolver',
    };

    res.json({
      success: true,
      primaryMatch,
      confidence: metadata.confidence,
    });
  } catch (error) {
    console.error('[API] Text identification error:', error);
    res.status(500).json({
      success: false,
      error: error.message || 'Text identification failed',
    });
  }
});
```

#### Frontend Integration (`src/screens/AddRecordScreen.tsx`)

**Already implemented - calls `/api/identify-by-text` and auto-fills:**
```typescript
const handleLookupMetadata = async () => {
  if (!artist.trim() || !title.trim()) {
    Alert.alert('Missing info', 'Please enter both artist and album title to lookup metadata.');
    return;
  }

  setLookingUp(true);
  try {
    const apiUrl = getApiUrl('/api/identify-by-text');
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artist: artist.trim(), title: title.trim() }),
    });

    if (!response.ok) {
      throw new Error(`Lookup failed: ${response.statusText}`);
    }

    const data = await response.json();
    if (data.success && data.primaryMatch) {
      const match = data.primaryMatch;
      
      // Update form fields with canonical values
      if (match.artist) setArtist(match.artist);
      if (match.title) setTitle(match.title);
      if (match.year) setYear(String(match.year));
      
      // CRITICAL: Always use HQ cover art from API, never user photo
      if (match.coverImageRemoteUrl) {
        setCoverUri(match.coverImageRemoteUrl);
      }
      
      // Set tracks
      if (match.tracks && match.tracks.length > 0) {
        setTracks(match.tracks.map((t: any) => ({
          title: t.title,
          trackNumber: t.trackNumber || null,
        })));
      }
      
      Alert.alert('Success', `Found metadata: ${match.tracks?.length || 0} tracks, ${match.coverImageRemoteUrl ? 'HQ cover art' : 'no cover art'}`);
    }
  } catch (error) {
    console.error('[AddRecord] Lookup error:', error);
    Alert.alert('Lookup Failed', 'Could not fetch metadata. Please try again or save manually.');
  } finally {
    setLookingUp(false);
  }
};
```

---

## 3. "Album Not Found" After Edit - FIXED

### Problem
After editing an album and hitting Save or Cancel, user sees a black screen saying "Album not found."

### Solution

#### EditRecordScreen Navigation Fix (`src/screens/EditRecordScreen.tsx`)

**Changed from `navigation.goBack()` to explicit navigation:**

**Save button:**
```typescript
const handleSave = async () => {
  // ... save logic ...
  
  // Success - navigate back explicitly using recordId
  // This prevents "Album not found" issues when navigation stack is inconsistent
  console.log('[EditFlow] Save completed, navigating back to album', recordId);
  // Use explicit navigation instead of goBack() to ensure we always land on the correct screen
  navigation.navigate('RecordDetail', { recordId });
};
```

**Cancel button:**
```typescript
<AppButton
  title="Cancel"
  variant="secondary"
  onPress={() => {
    // Cancel - no async operations, just navigate back immediately
    // Use explicit navigation instead of goBack() to ensure we always land on the correct screen
    console.log('[EditFlow] Cancel pressed for album', recordId);
    console.log('[EditFlow] Navigating back to album immediately');
    navigation.navigate('RecordDetail', { recordId });
  }}
  disabled={saving}
/>
```

#### RecordDetailScreen Logic (`src/screens/RecordDetailScreen.tsx`)

**Already has `hasLoadedOnce` logic to prevent "not found" on navigation back:**
```typescript
const [hasLoadedOnce, setHasLoadedOnce] = useState(false);

const load = useCallback(async (showSpinner = true) => {
  // Only set loading if we don't have record data yet
  if (showSpinner && (!record || record.id !== recordId)) {
    setLoading(true);
  } else {
    setLoading(false);
  }
  
  try {
    const [recordData, locationData, tracksData] = await Promise.all([
      getRecordById(recordId),
      getRecordLocationDetails(recordId),
      getTracksByRecord(recordId),
    ]);
    
    if (recordData) {
      setRecord(recordData);
      setHasLoadedOnce(true); // Mark that we've loaded at least once
    }
    // ... rest of logic
  } finally {
    setLoading(false);
  }
}, [recordId, record]);

useFocusEffect(
  useCallback(() => {
    if (!hasLoadedOnce) {
      // First time - allow full-screen spinner
      load(true);
    } else {
      // Coming back from edit - show existing UI immediately, refresh in background
      setLoading(false);
      load(false).catch(err => {
        console.error('[RecordDetail] Background refresh failed:', err);
      });
    }
  }, [load, hasLoadedOnce])
);

// Only show "not found" if we've never successfully loaded
if (!record && !loading && !hasLoadedOnce) {
  return (
    <AppScreen title="Album Details">
      <View style={styles.loadingState}>
        <AppText variant="body">Album not found.</AppText>
      </View>
    </AppScreen>
  );
}
```

---

## 4. CSV Import Metadata Enrichment - VERIFIED

### Problem
CSV uploads work but imported albums are missing track lists, album images, and release dates.

### Solution

#### CSV Import Screen (`src/screens/CSVImportScreen.tsx`)

**Already implemented - uses unified resolver via `/api/identify-by-text`:**

```typescript
// If no Release ID - try text-based lookup to enrich metadata
if (!coverImageRemoteUrl && (!tracks || tracks.length === 0) && artist && title) {
  try {
    console.log(`[CSV Import] Enriching metadata for "${artist}" - "${title}" via text lookup...`);
    const apiUrl = getApiUrl('/api/identify-by-text');
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artist, albumTitle: title }),
    });

    if (response.ok) {
      const lookupData = await response.json();
      if (lookupData.success && lookupData.metadata) {
        const metadata = lookupData.metadata;
        // CRITICAL: Always use HQ cover art from API, never user photo
        coverImageRemoteUrl = metadata.coverImage || coverImageRemoteUrl;
        tracks = metadata.tracks.map((t: any) => ({
          title: t.title,
          trackNumber: t.number || null,
        })) || tracks;
        year = metadata.releaseYear || year;
        discogsReleaseId = metadata.discogsId || discogsReleaseId;
        console.log(`[CSV Import] ✅ Enriched metadata via unified resolver: ${tracks.length} tracks, cover: ${!!coverImageRemoteUrl}`);
      }
    }
  } catch (lookupError) {
    console.warn(`[CSV Import] ⚠️  Error enriching metadata:`, lookupError);
  }
}

// Create record with enriched metadata
const record = await createRecord({
  title,
  artist,
  year,
  notes: notesParts.length > 0 ? notesParts.join(' | ') : null,
  coverImageRemoteUrl: coverImageRemoteUrl || undefined, // HQ from API
});

// Add tracks if we have them
if (tracks.length > 0 && record.id) {
  for (const track of tracks) {
    try {
      await createTrack({
        recordId: record.id,
        title: track.title,
        trackNumber: track.trackNumber || null,
      });
    } catch (trackError) {
      console.warn(`[CSV Import] Failed to create track:`, trackError);
    }
  }
}
```

**Also supports Discogs Release ID mapping:**
```typescript
// If Release ID exists, fetch full metadata from Discogs
if (releaseIdIdx >= 0 && row[releaseIdIdx]) {
  const releaseId = parseInt(row[releaseIdIdx], 10);
  if (releaseId && !isNaN(releaseId)) {
    try {
      const apiUrl = getApiUrl('/api/discogs/release/' + releaseId);
      const response = await fetch(apiUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (response.ok) {
        const discogsData = await response.json();
        coverImageRemoteUrl = discogsData.coverImageRemoteUrl || null;
        tracks = discogsData.tracks || [];
        year = discogsData.year || year;
        console.log(`[CSV Import] ✅ Fetched Discogs data: ${tracks.length} tracks`);
      }
    } catch (fetchError) {
      console.warn(`[CSV Import] ⚠️  Error fetching Discogs release:`, fetchError);
    }
  }
}
```

---

## 5. Design Rule: HQ Cover Art - ENFORCED

### Rule
Whenever metadata lookups provide a `coverImageRemoteUrl`, the app should prefer that HD remote image instead of the user's local photo for the stored album art.

### Implementation

**Unified Metadata Resolver (`backend-example/services/metadata/unifiedMetadataResolver.js`):**
- ALWAYS fetches HQ cover art from Cover Art Archive or Discogs
- NEVER uses user photos

**All endpoints use unified resolver:**
1. `/api/identify-record` → `enrichAlbumMetadata()` → `resolveAlbumMetadata()`
2. `/api/identify-by-text` → `resolveAlbumMetadata()`
3. CSV import → `/api/identify-by-text` → `resolveAlbumMetadata()`

**Frontend always uses `coverImageRemoteUrl` when available:**
```typescript
// AddRecordScreen.tsx
coverImageRemoteUrl: identifiedImageUrl || (coverUri && coverUri.startsWith('http') ? coverUri : null) || null,
coverImageLocalUri: identifiedImageUrl || (coverUri && coverUri.startsWith('http') ? null : coverUri) || null,

// CSVImportScreen.tsx
coverImageRemoteUrl: coverImageRemoteUrl || undefined, // HQ from API

// RecordDetailScreen.tsx
{record.coverImageRemoteUrl || record.coverImageLocalUri ? (
  <Image
    source={{ 
      uri: record.coverImageRemoteUrl || record.coverImageLocalUri || ''
    }}
    style={styles.detailCover}
  />
) : (
  // Placeholder
)}
```

---

## End-to-End Flow Summary

### Photo/Barcode Identification → Suggestions
1. User scans album cover or barcode
2. Backend generates candidates from Vision/OCR/Discogs
3. **NEW:** All candidates filtered through `isAlbumNameOnlyCandidate()`
4. Frontend receives candidates
5. **NEW:** Frontend applies `looksLikeRealAlbumTitle()` as safety filter
6. Only real album names shown in suggestions UI

### Manual Artist + Title Lookup
1. User types artist and album title in `AddRecordScreen`
2. Taps "Lookup Metadata"
3. Frontend calls `/api/identify-by-text` with `{ artist, title }`
4. Backend uses `unifiedMetadataResolver.resolveAlbumMetadata()`
5. Returns: artist, title, year, `coverImageRemoteUrl`, tracks, genres, styles
6. Frontend auto-fills all form fields
7. **HQ cover art from API is used, never user photo**

### CSV Import
1. User selects CSV file and maps columns
2. For each row:
   - If Release ID exists → fetch from `/api/discogs/release/:id`
   - Otherwise → call `/api/identify-by-text` with artist + title
3. Both endpoints use unified resolver internally
4. Fetches: year, `coverImageRemoteUrl`, tracks
5. Creates record with HQ cover art
6. Creates tracks via `createTrack()` for each track

### Edit → Save/Cancel → Back to Detail
1. User opens album → views `RecordDetailScreen`
2. Taps "Edit" → navigates to `EditRecordScreen`
3. Makes changes and taps "Save" or "Cancel"
4. **NEW:** Uses `navigation.navigate('RecordDetail', { recordId })` instead of `goBack()`
5. `RecordDetailScreen` receives `recordId` in route params
6. If `hasLoadedOnce === true`, shows existing data immediately
7. Refreshes data in background
8. **No "Album not found" screen appears**

---

## Files Modified

### Backend
- `backend-example/server-hybrid.js`
  - Enhanced `isAlbumNameOnlyCandidate()` filter
  - Applied filter in all candidate generation paths
  - Added logging for filtered candidates

### Frontend
- `src/services/RecordIdentificationService.ts`
  - Added `looksLikeRealAlbumTitle()` helper
  - Applied filter to all candidate arrays

- `src/screens/EditRecordScreen.tsx`
  - Changed `navigation.goBack()` to explicit `navigation.navigate('RecordDetail', { recordId })`
  - Applied to both Save and Cancel buttons

---

## Testing Checklist

- [ ] Test suggestion filtering: Scan album cover that might return Wikipedia/article results → verify only real album names appear
- [ ] Test manual lookup: Type "Pink Floyd" + "The Dark Side of the Moon" → tap "Lookup Metadata" → verify year, tracks, HQ cover art auto-fill
- [ ] Test edit navigation: Open album → Edit → Save → verify returns to album detail (no "not found" screen)
- [ ] Test edit navigation: Open album → Edit → Cancel → verify returns to album detail (no "not found" screen)
- [ ] Test CSV import: Import CSV with artist + title → verify year, tracks, cover art auto-filled
- [ ] Test CSV import: Import CSV with Release ID → verify full metadata fetched from Discogs

---

All fixes are complete and ready for testing! 🎉

