# 🧪 Testing Commands - Upgraded Identification System

## Quick Test Guide

### Step 1: Verify Backend Server is Running

```bash
# Check if server is running
curl http://localhost:3000/health

# Expected output:
# {"status":"ok","timestamp":"...","services":{"googleVision":"configured","discogs":"not configured","localDatabase":"connected"}}

# Test ping endpoint
curl http://localhost:3000/api/ping

# Expected output:
# {"status":"ok","timestamp":"...","server":"SlotSync API","version":"1.0.0"}
```

### Step 2: Test Identification Endpoint (Backend)

```bash
# Test with a sample image (replace with path to an album cover image)
cd /Users/jamesricciardi/SlotSync/backend-example

# Test identification endpoint
curl -X POST http://localhost:3000/api/identify-record \
  -F "image=@/path/to/your/album-cover.jpg" \
  -H "Content-Type: multipart/form-data" | jq

# Or test with manual text input
curl -X POST http://localhost:3000/api/identify-record \
  -H "Content-Type: application/json" \
  -d '{"artist":"Taylor Swift","title":"1989"}' | jq
```

### Step 3: Start Frontend (Expo)

**Terminal 1: Backend (if not already running)**
```bash
cd /Users/jamesricciardi/SlotSync/backend-example

# Set environment variables (if needed)
export DISCOGS_PERSONAL_ACCESS_TOKEN='your-token-here'
export GOOGLE_APPLICATION_CREDENTIALS='/Users/jamesricciardi/SlotSync/backend-example/credentials.json'

# Start backend
npm start
```

**Terminal 2: Frontend (Expo)**
```bash
cd /Users/jamesricciardi/SlotSync

# Verify API URL is set (should be in app.json already)
# Your IP: 192.168.1.215
# API URL should be: http://192.168.1.215:3000

# Start Expo
npx expo start --clear

# Then:
# - Press 'i' for iOS simulator
# - Press 'a' for Android emulator
# - Scan QR code with Expo Go app on your phone
```

### Step 4: Test in Expo Go

1. **Open Expo Go** on your phone
2. **Scan the QR code** from Terminal 2
3. **Navigate to Scan Record** screen
4. **Take a photo** of an album cover or select from library
5. **Watch the identification process**:
   - Should show loading state
   - OCR-first extraction (primary)
   - Embedding similarity search
   - Discogs scoring with dual thresholds
   - Final result or suggestions

### Step 5: Verify New Features

**Check logs in Terminal 1 (Backend)** - You should see:
```
[Phase1] 🎨 Computing image embedding...
[Phase1] ✅ Image embedding computed
[Phase1] 🔍 Found X similar covers via vector search
[Phase1] 📝 PRIMARY: Parsing OCR text...
[Phase1] ✅ OCR PRIMARY: "Artist" - "Album"
[Phase2] 📊 Scoring X Discogs releases...
[Phase2] 📊 Grouped into X canonical albums
[Phase2] 📊 Response type: auto_accept (best score: 0.XXX)
```

**Check logs in Terminal 2 (Frontend)** - Should show:
```
[IDENTIFICATION] Starting album identification...
[IDENTIFICATION] Image hash: XXXXX...
[IDENTIFICATION] ✅ Cache hit! (if cached)
or
[IDENTIFICATION] Calling backend API...
```

### Step 6: Test Edge Cases

**Test 1: Low-text cover (embeddings should help)**
```bash
# Use an album cover with minimal text
# Embeddings should find similar covers even without OCR
```

**Test 2: Multiple variants (grouping should work)**
```bash
# Use an album that has many Discogs releases (e.g., "Abbey Road")
# Should group variants and pick best one
```

**Test 3: Noisy web page in background**
```bash
# Use an image with web page text visible
# Web noise filter should remove it
```

### Step 7: Check Database

```bash
cd /Users/jamesricciardi/SlotSync/backend-example

# Check if embeddings are being stored
sqlite3 identified_records.db "SELECT COUNT(*) FROM cover_embeddings;"

# Check feedback logs
sqlite3 identified_records.db "SELECT COUNT(*) FROM identification_feedback;"

# View recent identifications
sqlite3 identified_records.db "SELECT artist, title, discogs_id, created_at FROM identified_records ORDER BY created_at DESC LIMIT 5;"
```

## Troubleshooting

**Backend not starting?**
```bash
# Kill any existing processes
pkill -f "node.*server-hybrid"

# Check port 3000
lsof -i :3000

# Start fresh
cd /Users/jamesricciardi/SlotSync/backend-example
npm start
```

**Expo can't connect to backend?**
```bash
# Verify IP address
ifconfig | grep "inet " | grep -v 127.0.0.1

# Update app.json with correct IP
# Then restart Expo with --clear flag
npx expo start --clear
```

**Identification not working?**
```bash
# Check backend logs for errors
# Verify Google Vision is configured
# Verify Discogs token is set (if using Discogs)
# Check network connectivity between phone and computer
```

## Expected Behavior

✅ **OCR-first**: Should extract artist/album from text on cover first
✅ **Embeddings**: Should find similar covers even without text
✅ **Scoring**: Should score all Discogs releases, not just first match
✅ **Grouping**: Should group variant releases together
✅ **Thresholds**: Auto-accept if score ≥ 0.8, show suggestions if ≥ 0.5
✅ **Feedback**: Should log user confirmations for future learning
✅ **Web noise**: Should filter out URLs, e-commerce text, article titles
