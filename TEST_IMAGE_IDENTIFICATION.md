# Test Image Identification - Terminal Commands

## Quick Start

### Terminal 1: Backend Server (Image Identification)

```bash
# Stop any existing server on port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null

# Start the backend with image identification
cd /Users/jamesricciardi/SlotSync/backend-example
export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"
export DISCOGS_PERSONAL_ACCESS_TOKEN="gOQSOxYBRENZutcnwOQnAaYMxmePxboOxBfyAeHK"
export ENABLE_GOOGLE_VISION=true
node server-hybrid.js
```

**Expected output:**
```
✅ Google Vision API client initialized
✅ Connected to local database
✅ Database table ready
🚀 SlotSync API Server (Hybrid) running on port 3000
📍 Health check: http://localhost:3000/health
✅ Ready to identify records!
```

---

### Terminal 2: Expo Server

```bash
# Stop Expo if running on port 8081
lsof -ti:8081 | xargs kill -9 2>/dev/null

# Start Expo
cd /Users/jamesricciardi/SlotSync
npx expo start --clear
```

**Then:**
- Scan the QR code with Expo Go app
- Make sure phone is on same Wi-Fi network

---

## Testing the Image Identification

### 1. Open App in Expo Go
- Scan QR code from Terminal 2
- App should load

### 2. Navigate to Scan
- Tap **Library** tab
- Tap **Add Record** button
- Tap **Scan cover**

### 3. Capture Album Cover
- Point camera at album cover
- **Tap the capture button** (manual capture only)
- Wait for identification

### 4. Watch Backend Logs (Terminal 1)

You should see:
```
[API] Processing image: image.jpg, XXXXX bytes
[API] Identifying image with Google Vision...
[Google Vision] Performing web detection...
[Google Vision] Found X web entities
[Google Vision] Found X matching pages
[Google Vision] Found X full matches
[API] ✅ Google Vision identified: Artist Name - Album Title
[API] Searching Discogs (primary database)...
[Discogs] Searching for: Artist Name - Album Title
[Discogs] Found: Artist Name - Album Title
[API] Success! Returning Discogs result
```

---

## Verify Backend is Running

```bash
# Check health endpoint
curl http://localhost:3000/health

# Should return:
# {
#   "status": "ok",
#   "services": {
#     "googleVision": "configured",
#     "discogs": "configured",
#     "localDatabase": "connected"
#   }
# }
```

---

## Troubleshooting

### Backend won't start
```bash
# Check if port 3000 is in use
lsof -i:3000

# Kill process if needed
lsof -ti:3000 | xargs kill -9
```

### Google Vision errors
- Check credentials file exists: `ls backend-example/credentials.json`
- Verify credentials are valid
- Check Google Cloud project has Vision API enabled

### Expo won't start
```bash
# Clear cache and restart
cd /Users/jamesricciardi/SlotSync
rm -rf node_modules/.cache
npx expo start --clear
```

### "Network request failed" in app
- Verify both devices on same Wi-Fi
- Check API URL in `app.json`: `http://192.168.1.215:3000`
- Verify backend is running: `curl http://localhost:3000/health`

---

## Expected Behavior

### ✅ Success Flow
1. Capture image → Google Vision identifies it
2. Extracts artist/title from web detection
3. Searches Discogs → Finds match
4. Displays result with cover art

### ❌ Failure Flow
1. Capture image → Google Vision can't identify
2. Falls back to OCR → May extract text
3. Searches Discogs → May or may not find match
4. Shows error → Option to enter manually

---

## All-in-One Start Script

```bash
# Terminal 1 - Backend
cd /Users/jamesricciardi/SlotSync/backend-example && \
lsof -ti:3000 | xargs kill -9 2>/dev/null; \
export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json" && \
export DISCOGS_PERSONAL_ACCESS_TOKEN="gOQSOxYBRENZutcnwOQnAaYMxmePxboOxBfyAeHK" && \
export ENABLE_GOOGLE_VISION=true && \
node server-hybrid.js

# Terminal 2 - Expo
cd /Users/jamesricciardi/SlotSync && \
lsof -ti:8081 | xargs kill -9 2>/dev/null; \
npx expo start --clear
```

