# CSV Import Debugging Guide

## Issue
CSV imports are uploading albums correctly, but missing:
- Album cover art
- Track list

## Expected Behavior
When importing a CSV file, the app should:
1. Parse each row (artist, title, etc.)
2. **AUTOMATICALLY** fetch metadata from Discogs API
3. Save cover art URL and tracks to the database

## Debugging Steps

### 1. Check Backend is Running
```bash
curl http://localhost:3000/health
```
Should return: `{"status":"ok"}`

### 2. Test Text Lookup API Directly
```bash
curl -X POST http://localhost:3000/api/identify-by-text \
  -H 'Content-Type: application/json' \
  -d '{"artist":"Radiohead","title":"A Moon Shaped Pool"}'
```

**Expected Response:**
```json
{
  "success": true,
  "bestMatch": {
    "artist": "Radiohead",
    "title": "A Moon Shaped Pool",
    "coverImageRemoteUrl": "https://...",
    "tracks": [...],
    "discogsId": 1234567
  }
}
```

### 3. Check Console Logs During CSV Import

**Frontend Logs (Expo Terminal) should show:**
```
[CSV Import] 📝 Processing: "Radiohead" - "A Moon Shaped Pool"
[CSV Import] 🔍 PRIORITY 2 check: hasCompleteMetadata=false, hasValidArtistTitle=true
[CSV Import] 🔍 AUTO-FETCHING metadata for "Radiohead" - "A Moon Shaped Pool" via text lookup...
[CSV Import] 📡 Response status: 200 OK
[CSV Import] ✅ Found match: {artist: "Radiohead", hasCover: true, trackCount: 11}
[CSV Import] ✅ Set cover art: https://...
[CSV Import] ✅ Set 11 tracks
[CSV Import] ✅ Created record abc123
[CSV Import] 🎵 Creating 11 tracks...
```

**Backend Logs (Backend Terminal) should show:**
```
[API] 📥 INCOMING REQUEST: /api/identify-by-text
[API] 📍 Artist: "Radiohead"
[API] 📍 Title: "A Moon Shaped Pool"
[TextLookup] 🔍 Manual text lookup: "Radiohead" - "A Moon Shaped Pool"
[Discogs] 🔍 Starting Discogs search...
[TextLookup] ✅ Best match: "Radiohead" - "A Moon Shaped Pool"
[API] ✅ Text identification success: "Radiohead" - "A Moon Shaped Pool"
[API] ✅ Tracks: 11
```

### 4. Common Issues & Solutions

#### Issue: No API calls in logs
**Cause:** Text lookup not being triggered
**Solution:** 
- Check that artist and title columns are mapped correctly
- Verify artist/title are not empty strings
- Check console for: `[CSV Import] ⚠️  Cannot run text lookup - missing artist or title`

#### Issue: API calls failing with network error
**Cause:** Backend not accessible from phone
**Solution:**
- Verify `EXPO_PUBLIC_API_BASE_URL` is set correctly
- Check phone and computer are on same Wi-Fi network
- Test backend from phone's browser: `http://YOUR_IP:3000/health`

#### Issue: API returns 400/404
**Cause:** Backend endpoint not found or request format wrong
**Solution:**
- Verify backend is running `server-hybrid.js`
- Check backend logs for errors
- Test API directly with curl (see step 2)

#### Issue: API returns success but no cover/tracks
**Cause:** Discogs API not returning data
**Solution:**
- Check `DISCOGS_PERSONAL_ACCESS_TOKEN` is set
- Verify Discogs API is responding (check backend logs)
- Test with a well-known album (e.g., "Radiohead - A Moon Shaped Pool")

#### Issue: Data fetched but not saved
**Cause:** Database save failing
**Solution:**
- Check for errors in: `[CSV Import] Failed to create track`
- Verify `createRecord` and `createTrack` are working
- Check database file exists and is writable

### 5. Manual Test

1. **Start Backend:**
   ```bash
   cd /Users/jamesricciardi/SlotSync
   ./start-backend-for-expo.sh
   ```

2. **Start Expo:**
   ```bash
   cd /Users/jamesricciardi/SlotSync
   npx expo start --clear
   ```

3. **Import CSV:**
   - Open app in Expo Go
   - Navigate to Library
   - Tap "Import CSV"
   - Select your CSV file

4. **Watch Logs:**
   - Frontend: Expo terminal
   - Backend: Backend terminal
   - Look for the log messages listed above

### 6. Verify Data Saved

After import, check if data was saved:
- Open the album detail screen
- Check if cover art appears
- Check if tracks list appears
- If "Lookup Metadata" button is visible, data wasn't fetched automatically

## Next Steps

If still not working after checking all above:
1. Share the **full console logs** from both terminals
2. Share the **API response** from curl test (step 2)
3. Share a **sample CSV row** you're importing

