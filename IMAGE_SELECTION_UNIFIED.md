# Image Selection Unified - Implementation Summary

## Overview
All user-submitted photos are now automatically replaced with HD album cover images whenever a metadata match exists. The unified rule is applied consistently across all flows.

---

## Unified Rule

**Priority: `coverImageRemoteUrl` > `coverImageLocalUri` > placeholder**

1. **If `coverImageRemoteUrl` exists (from metadata API):**
   - ✅ Use it for display
   - ✅ Save it to database
   - ❌ **DO NOT save `coverImageLocalUri`** (explicitly set to `null`)

2. **If `coverImageRemoteUrl` does NOT exist:**
   - ✅ Use `coverImageLocalUri` for display (if available)
   - ✅ Save `coverImageLocalUri` to database (if available)

3. **If neither exists:**
   - ✅ Show placeholder

---

## Helper Module

**File: `src/utils/imageSelection.ts`**

### Functions

#### `shouldUseRemoteCoverImage(coverImageRemoteUrl)`
Returns `true` if a remote cover image URL exists and is valid.

#### `getCoverImageUri(coverImageRemoteUrl, coverImageLocalUri)`
Gets the display URI for an album cover.
- Priority: `coverImageRemoteUrl` > `coverImageLocalUri` > `null`

#### `prepareImageFields(coverImageRemoteUrl, coverImageLocalUri)`
Prepares image fields for record creation/update.

**Logic:**
- If `coverImageRemoteUrl` exists:
  - Returns: `{ coverImageRemoteUrl: <url>, coverImageLocalUri: null }`
  - Logs: `"✅ Using HD cover art from API, ignoring user photo"`
- If no `coverImageRemoteUrl` but `coverImageLocalUri` exists:
  - Returns: `{ coverImageRemoteUrl: null, coverImageLocalUri: <uri> }`
  - Logs: `"📸 Using user photo (no metadata match found)"`
- If neither exists:
  - Returns: `{ coverImageRemoteUrl: null, coverImageLocalUri: null }`
  - Logs: `"⚠️  No cover image available"`

---

## Updated Flows

### 1. Camera/Photo Capture (`ScanRecordScreen.tsx`)

**Before:**
```typescript
const newRecord = await createRecord({
  coverImageLocalUri: capturedUri || null,
  coverImageRemoteUrl: currentMatch.coverImageRemoteUrl ?? null,
});
```

**After:**
```typescript
const { prepareImageFields } = require('../utils/imageSelection');
const imageFields = prepareImageFields(
  currentMatch.coverImageRemoteUrl,
  capturedUri
);

const newRecord = await createRecord({
  coverImageRemoteUrl: imageFields.coverImageRemoteUrl,
  coverImageLocalUri: imageFields.coverImageLocalUri,
});
```

**Result:** If metadata lookup returns `coverImageRemoteUrl`, the user's camera photo (`capturedUri`) is **not saved** to the database.

---

### 2. Batch Processing (`BatchReviewScreen.tsx`)

**Before:**
```typescript
const newRecord = await createRecord({
  coverImageRemoteUrl: currentMatch.coverImageRemoteUrl ?? null,
  coverImageLocalUri: photo.originalUri, // Always saved
});
```

**After:**
```typescript
const { prepareImageFields } = require('../utils/imageSelection');
const imageFields = prepareImageFields(
  currentMatch.coverImageRemoteUrl,
  photo.originalUri
);

const newRecord = await createRecord({
  coverImageRemoteUrl: imageFields.coverImageRemoteUrl,
  coverImageLocalUri: imageFields.coverImageLocalUri,
});
```

**Result:** If metadata lookup returns `coverImageRemoteUrl`, the original batch photo is **not saved** to the database.

---

### 3. Manual Add (`AddRecordScreen.tsx`)

**Before:**
```typescript
coverImageRemoteUrl: identifiedImageUrl || (coverUri && coverUri.startsWith('http') ? coverUri : null) || null,
coverImageLocalUri: identifiedImageUrl || (coverUri && coverUri.startsWith('http') ? null : coverUri) || null,
```

**After:**
```typescript
const { prepareImageFields } = require('../utils/imageSelection');

// Determine remote URL: identifiedImageUrl takes precedence, then HTTP URLs from coverUri
const remoteUrl = identifiedImageUrl || (coverUri && coverUri.startsWith('http') ? coverUri : null);
// Local URI: only if coverUri is not an HTTP URL (i.e., it's a local file)
const localUri = (coverUri && !coverUri.startsWith('http')) ? coverUri : null;

const imageFields = prepareImageFields(remoteUrl, localUri);

const newRecord = await createRecord({
  coverImageRemoteUrl: imageFields.coverImageRemoteUrl,
  coverImageLocalUri: imageFields.coverImageLocalUri,
});
```

**Result:** If metadata lookup returns `coverImageRemoteUrl`, any user-selected local image is **not saved** to the database.

---

### 4. CSV Import (`CSVImportScreen.tsx`)

**Before:**
```typescript
const record = await createRecord({
  coverImageRemoteUrl: coverImageRemoteUrl || undefined,
});
```

**After:**
```typescript
const { prepareImageFields } = require('../utils/imageSelection');
const imageFields = prepareImageFields(coverImageRemoteUrl, null); // CSV doesn't have local images

const record = await createRecord({
  coverImageRemoteUrl: imageFields.coverImageRemoteUrl,
  coverImageLocalUri: imageFields.coverImageLocalUri,
});
```

**Result:** If metadata enrichment returns `coverImageRemoteUrl`, it's used. CSV image paths are ignored (CSV doesn't typically have local images anyway).

---

## Updated UI Display

### 1. Library List (`LibraryScreen.tsx`)

**Before:**
```typescript
{item.coverImageRemoteUrl || item.coverImageLocalUri ? (
  <Image
    source={{ 
      uri: item.coverImageRemoteUrl || item.coverImageLocalUri || ''
    }}
    style={styles.coverArt}
  />
) : (
  <View>...</View>
)}
```

**After:**
```typescript
{(() => {
  const { getCoverImageUri } = require('../utils/imageSelection');
  const imageUri = getCoverImageUri(item.coverImageRemoteUrl, item.coverImageLocalUri);
  return imageUri ? (
    <Image
      source={{ uri: imageUri }}
      style={styles.coverArt}
    />
  ) : (
    <View>...</View>
  );
})()}
```

---

### 2. Record Detail (`RecordDetailScreen.tsx`)

**Before:**
```typescript
{record.coverImageRemoteUrl || record.coverImageLocalUri ? (
  <Image
    source={{ 
      uri: record.coverImageRemoteUrl || record.coverImageLocalUri || ''
    }}
    style={styles.detailCover}
  />
) : (
  <View>...</View>
)}
```

**After:**
```typescript
{(() => {
  const { getCoverImageUri } = require('../utils/imageSelection');
  const imageUri = getCoverImageUri(record.coverImageRemoteUrl, record.coverImageLocalUri);
  return imageUri ? (
    <Image
      source={{ uri: imageUri }}
      style={styles.detailCover}
    />
  ) : (
    <View>...</View>
  );
})()}
```

---

### 3. Scan Match Preview (`ScanRecordScreen.tsx`)

**Before:**
```typescript
{currentMatch.coverImageRemoteUrl ? (
  <Image source={{ uri: currentMatch.coverImageRemoteUrl }} />
) : capturedUri ? (
  <Image source={{ uri: capturedUri }} />
) : null}
```

**After:**
```typescript
{(() => {
  const { getCoverImageUri } = require('../utils/imageSelection');
  const imageUri = getCoverImageUri(currentMatch.coverImageRemoteUrl, capturedUri);
  return imageUri ? (
    <Image source={{ uri: imageUri }} />
  ) : null;
})()}
```

---

## Logging

The `prepareImageFields()` function logs:

1. **When HD cover art is used:**
   ```
   [ImageSelection] ✅ Using HD cover art from API, ignoring user photo
   ```

2. **When user photo is used (no metadata match):**
   ```
   [ImageSelection] 📸 Using user photo (no metadata match found)
   ```

3. **When no image is available:**
   ```
   [ImageSelection] ⚠️  No cover image available
   ```

---

## Files Modified

### New Files
- `src/utils/imageSelection.ts` - Unified helper module

### Updated Files
- `src/screens/ScanRecordScreen.tsx` - `saveRecord()` + display logic
- `src/screens/BatchReviewScreen.tsx` - `saveRecord()`
- `src/screens/AddRecordScreen.tsx` - `handleSave()`
- `src/screens/CSVImportScreen.tsx` - `handleImport()`
- `src/screens/LibraryScreen.tsx` - Display logic
- `src/screens/RecordDetailScreen.tsx` - Display logic

---

## Testing Checklist

- [ ] **Camera scan with metadata match:**
  - Scan album cover
  - Verify metadata lookup returns `coverImageRemoteUrl`
  - Verify user photo is **not saved** to database
  - Verify HD cover art is displayed

- [ ] **Camera scan without metadata match:**
  - Scan unknown/custom album
  - Verify no `coverImageRemoteUrl` returned
  - Verify user photo **is saved** to database
  - Verify user photo is displayed

- [ ] **Manual add with lookup:**
  - Type artist + album, tap "Lookup Metadata"
  - Verify `coverImageRemoteUrl` is returned
  - Verify any selected local image is **not saved**
  - Verify HD cover art is displayed

- [ ] **CSV import with enrichment:**
  - Import CSV with artist + title
  - Verify metadata enrichment returns `coverImageRemoteUrl`
  - Verify HD cover art is saved and displayed

- [ ] **UI display consistency:**
  - Verify all screens show remote > local > placeholder
  - Verify Library list uses correct priority
  - Verify Record Detail uses correct priority

---

## Confirmation

✅ **All flows (camera, manual, edit, CSV) follow the same unified rule**

✅ **User photos are automatically replaced with HD cover art when metadata match exists**

✅ **User photos are only saved when no metadata match exists**

✅ **UI display is consistent across all screens**

✅ **Logging indicates when user photos are overridden**

---

All implementation complete! 🎉

