# 🧪 PR4: App List Performance - Testing Commands

## Quick Start (2 Terminal Windows)

### Terminal 1: Start Backend Server

```bash
cd /Users/jamesricciardi/SlotSync/backend-example

# Set environment variables (if needed)
export DISCOGS_PERSONAL_ACCESS_TOKEN='your_discogs_token_here'
export GOOGLE_APPLICATION_CREDENTIALS='/Users/jamesricciardi/SlotSync/backend-example/credentials.json'

# Start backend
npm start
```

**Expected Output:**
```
✅ Google Vision API client initialized (or ⚠️ Discogs-only mode)
✅ Discogs API configured
🚀 SlotSync API Server running on port 3000
```

**Keep this terminal open!**

---

### Terminal 2: Start Frontend (Expo)

```bash
cd /Users/jamesricciardi/SlotSync

# Get your LAN IP address
ifconfig | grep "inet " | grep -v 127.0.0.1

# Set API base URL (replace XXX.XXX.XXX.XXX with your actual IP)
export EXPO_PUBLIC_API_BASE_URL='http://XXX.XXX.XXX.XXX:3000'

# Start Expo
npx expo start --clear
```

**Then:**
- Press `i` for iOS simulator
- Press `a` for Android emulator
- Or scan QR code with Expo Go app

---

## Performance Testing Commands

### 1. Test Backend Health

```bash
# Quick health check
curl http://localhost:3000/health | jq

# Expected: {"status":"ok",...}
```

---

### 2. Generate Test Data (Optional - for large dataset testing)

If you need to test with 2000+ records, you can:

**Option A: Import CSV with many records**
```bash
# In the app:
# 1. Navigate to Library tab
# 2. Tap "+" button
# 3. Select "Import CSV"
# 4. Choose a CSV file with many records
```

**Option B: Use SQLite to check current record count**
```bash
cd /Users/jamesricciardi/SlotSync

# Check how many records you have (if using SQLite CLI)
# Note: The app uses expo-sqlite, so you'd need to check in-app
```

---

### 3. Test List Performance (In-App)

Once the app is running:

#### Test 1: Smooth Scrolling
1. Navigate to **Library** tab
2. Scroll through the album list
3. **Expected:** Smooth scrolling, no lag, no jank
4. **Test with:** 100+ records, 500+ records, 2000+ records

#### Test 2: Search Input Performance
1. Navigate to **Library** tab
2. Tap the search bar
3. Type quickly: "beatles", "pink floyd", "david bowie"
4. **Expected:** 
   - No lag while typing
   - Results update smoothly (200ms debounce)
   - No UI freezing

#### Test 3: Navigation Back/Forward
1. Navigate to **Library** tab
2. Tap on an album to open **Record Detail**
3. Press back button
4. **Expected:**
   - Returns to Library tab
   - Same tab is restored (ALBUMS/ARTISTS/SONGS/ALL)
   - No "album not found" error
   - List position maintained (if possible)

#### Test 4: Filter Performance
1. Navigate to **Library** tab
2. Switch between filters: "All" → "Placed" → "Unplaced"
3. **Expected:**
   - Instant filter switching
   - No lag when filtering large lists
   - Smooth transitions

#### Test 5: Tab Switching Performance
1. Navigate to **Library** tab
2. Switch between tabs: "Albums" → "Artists" → "Songs" → "All"
3. **Expected:**
   - Instant tab switching
   - No lag when loading sections
   - Smooth animations

---

### 4. Monitor Performance (Developer Tools)

#### React Native Debugger (if enabled)
```bash
# In Expo, press 'j' to open debugger
# Check Performance tab for:
# - Render times
# - Memory usage
# - Component re-renders
```

#### Check Console Logs
Watch Terminal 2 (Expo) for:
- No excessive re-renders
- No memory warnings
- Smooth scroll events

---

### 5. Test Pagination (If Implemented)

**Note:** Currently `getRecords()` supports pagination but LibraryScreen loads all records. To test pagination:

```bash
# Check if pagination is being used
# In LibraryScreen.tsx, refresh() calls getRecords() without limit/offset
# This means all records are loaded at once

# To test pagination, you'd need to modify LibraryScreen to use:
# getRecords(['id', 'title', 'artist', 'coverImageRemoteUrl'], 50, 0)
```

---

### 6. Test Image Loading Performance

1. Navigate to **Library** tab
2. Scroll through albums with cover images
3. **Expected:**
   - Images load progressively
   - No blank spaces for long periods
   - Smooth scrolling even while images load
   - Thumbnails load faster than full-size images

---

## Performance Benchmarks

### Target Metrics:

✅ **Smooth Scrolling:**
- 60 FPS during scroll
- No frame drops
- No jank

✅ **Search Input:**
- < 200ms debounce delay
- No lag while typing
- Results appear smoothly

✅ **Navigation:**
- < 100ms tab switching
- < 200ms filter switching
- No "album not found" errors

✅ **Memory:**
- No memory leaks
- Stable memory usage
- No crashes with large lists

---

## Troubleshooting

### If Scrolling is Laggy

```bash
# Check how many records are loaded
# In LibraryScreen, check the records array length
# If > 1000, consider implementing pagination

# Check React DevTools for:
# - Excessive re-renders
# - Large component trees
# - Memory leaks
```

### If Search is Slow

```bash
# Verify debounce is working (200ms)
# Check LibraryScreen.tsx line ~130-140

# Verify SQLite queries are used (not JS filtering)
# Check that searchArtists() and searchTracksByTitle() use SQL LIKE
```

### If Navigation Fails

```bash
# Check RecordDetailScreen navigation logic
# Verify returnToTab is preserved
# Check lastTabBeforeNavigationRef is set correctly
```

---

## Quick Verification Checklist

- [ ] Backend server running on port 3000
- [ ] Frontend connected to backend
- [ ] Library tab loads without lag
- [ ] Scrolling is smooth (60 FPS)
- [ ] Search input doesn't lag
- [ ] Filter switching is instant
- [ ] Tab switching works correctly
- [ ] Navigation back/forward works
- [ ] No "album not found" errors
- [ ] Images load progressively
- [ ] Memory usage is stable

---

## Advanced Testing

### Test with Large Dataset

If you have 2000+ records:

```bash
# 1. Import large CSV (if available)
# 2. Monitor memory usage in React DevTools
# 3. Test scrolling performance
# 4. Test search performance
# 5. Test filter performance
```

### Profile Performance

```bash
# In Expo, enable performance monitoring:
# Press 'j' to open debugger
# Go to Performance tab
# Record a session while:
#   - Scrolling through list
#   - Typing in search
#   - Switching tabs
#   - Navigating to detail and back
```

---

## Expected Results

After PR4 implementation:

✅ **All lists use FlatList/SectionList** (not ScrollView + map)
✅ **keyExtractor is present** for all lists
✅ **RecordRow is memoized** (React.memo)
✅ **useCallback for handlers** (stable references)
✅ **Debounced search** (200ms delay)
✅ **SQLite queries** for search (not JS filtering)
✅ **Performance optimizations** (initialNumToRender, windowSize, etc.)

---

## Notes

- **Pagination:** Currently not fully implemented in LibraryScreen (loads all records)
- **Thumbnails:** Images use full-size URLs (thumbnail optimization can be added later)
- **Performance:** Should be smooth with 1000+ records using current implementation

