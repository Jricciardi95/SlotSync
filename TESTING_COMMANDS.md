# Testing Commands for SlotSync

## Prerequisites

1. **Backend dependencies installed:**
   ```bash
   cd /Users/jamesricciardi/SlotSync/backend-example
   npm install
   ```

2. **Frontend dependencies installed:**
   ```bash
   cd /Users/jamesricciardi/SlotSync
   npm install
   ```

3. **Environment variables set:**
   - `DISCOGS_PERSONAL_ACCESS_TOKEN` (if not in start script)
   - `GOOGLE_APPLICATION_CREDENTIALS` (optional, for Vision API)

---

## Quick Start (Two Terminal Windows)

### Terminal 1: Backend Server

```bash
cd /Users/jamesricciardi/SlotSync
./start-backend-for-expo.sh
```

**Expected output:**
```
🚀 Starting SlotSync Backend for Expo Go...
✅ Google Vision credentials found
✅ Discogs API token found
✅ Your IP address: 192.168.1.XXX
🔧 Starting server on port 3000...

🚀 SlotSync API Server running on port 3000
📍 Listening on: 0.0.0.0:3000 (all interfaces)
📍 LAN address: http://192.168.1.XXX:3000
📍 Health check: http://192.168.1.XXX:3000/health
```

**Note the IP address** - you'll need it for the frontend!

---

### Terminal 2: Frontend (Expo)

```bash
cd /Users/jamesricciardi/SlotSync

# Set API base URL (replace XXX with your actual IP from Terminal 1)
export EXPO_PUBLIC_API_BASE_URL=http://192.168.1.XXX:3000

# Or create/update .env file:
echo "EXPO_PUBLIC_API_BASE_URL=http://192.168.1.XXX:3000" > .env

# Start Expo
npx expo start --clear
```

**Expected output:**
```
› Metro waiting on exp://192.168.1.XXX:8081
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)
```

**On iPhone:**
1. Open Camera app
2. Scan the QR code
3. Tap the notification to open in Expo Go

---

## Testing Backend Endpoints

### 1. Health Check (Quick Connectivity Test)

```bash
# Replace XXX with your IP from Terminal 1
curl http://192.168.1.XXX:3000/health
```

**Expected response:**
```json
{"ok":true,"time":"2024-12-21T..."}
```

### 2. Test from iPhone Safari

1. Open Safari on iPhone
2. Navigate to: `http://192.168.1.XXX:3000/health`
3. Should see JSON response instantly

### 3. Test Identify Endpoint (Manual)

```bash
# Replace XXX with your IP and PATH_TO_IMAGE with actual image path
curl -X POST http://192.168.1.XXX:3000/api/identify-record \
  -F "image=@/path/to/album-cover.jpg" \
  -H "Content-Type: multipart/form-data"
```

**Expected response:**
```json
{
  "success": true,
  "confidence": 0.95,
  "artist": "Pink Floyd",
  "albumTitle": "The Dark Side of the Moon",
  ...
}
```

---

## Monitoring Request Tracing

### Watch Backend Logs

In Terminal 1 (backend), you'll see detailed request tracing:

```
[REQ abc123] START /api/identify-record content-type=multipart/form-data
[REQ abc123] parse_upload OK fileSizeBytes=234567 mime=image/jpeg
[REQ abc123] phase1_start
[REQ abc123] embedding_compute_start
[REQ abc123] embedding_compute_complete elapsed=1234ms
[REQ abc123] vector_search_start
[REQ abc123] vector_search_complete elapsed=234ms top1Similarity=0.95 top1Id=12345 top2Similarity=0.87
[REQ abc123] decideVisionStrategy_complete elapsed=5ms decision=ACCEPT_EMBEDDING_FINAL
[REQ abc123] phase1_complete elapsed=1473ms candidates=1
[REQ abc123] phase2_start candidates=1
[REQ abc123] discogs_hydrate_start discogsId=12345
[REQ abc123] discogs_hydrate_complete elapsed=890ms
[REQ abc123] phase2_complete elapsed=890ms
[REQ abc123] phase3_start
[REQ abc123] phase3_complete elapsed=234ms
[REQ abc123] before_response_send
[REQ abc123] END status=200 totalMs=2597
```

### Watch for Issues

**If request hangs:**
- Look for last `_start` without matching `_complete`
- Check for `TIMEOUT` messages
- Look for `HARD TIMEOUT` after 90s

**If timeout occurs:**
```
[REQ abc123] TIMEOUT embedding after 30000ms
[REQ abc123] ERROR embedding_compute elapsed=30001ms Error: TIMEOUT:embedding:30000
[REQ abc123] END status=500 totalMs=30002
```

---

## Testing Frontend Features

### 1. Photo Scan
1. Open app in Expo Go
2. Navigate to "Scan" or "Batch Scan"
3. Take photo of album cover
4. Watch Terminal 1 for request tracing logs
5. Should see identification result in app

### 2. CSV Import
1. Navigate to "CSV Import" screen
2. Select CSV file
3. Watch Terminal 1 for multiple identification requests
4. Check that albums appear with cover art and track lists

### 3. Manual Lookup
1. Navigate to album detail screen
2. Tap "Lookup Metadata" or similar
3. Enter artist and title
4. Should fetch from Discogs and update album

---

## Troubleshooting

### Backend won't start

```bash
# Check if port 3000 is in use
lsof -ti:3000

# Kill process if needed
kill -9 $(lsof -ti:3000)

# Try again
./start-backend-for-expo.sh
```

### Frontend can't reach backend

1. **Check IP address matches:**
   ```bash
   # Get your IP
   ifconfig | grep "inet " | grep -v 127.0.0.1
   
   # Update .env with correct IP
   echo "EXPO_PUBLIC_API_BASE_URL=http://YOUR_IP:3000" > .env
   ```

2. **Test connectivity from iPhone:**
   - Open Safari: `http://YOUR_IP:3000/health`
   - Should see JSON response

3. **Check firewall:**
   - Mac: System Settings > Network > Firewall
   - Ensure port 3000 is allowed

### Request timing out

1. **Check backend logs** for which phase is slow
2. **Look for heartbeat warnings** (>5s steps)
3. **Check timeout values** in logs
4. **Verify network connectivity** between iPhone and Mac

### Syntax errors

```bash
# Check backend syntax
cd /Users/jamesricciardi/SlotSync/backend-example
node -c server-hybrid.js

# Should output: (no errors means success)
```

---

## Full Test Sequence

1. **Start backend:**
   ```bash
   cd /Users/jamesricciardi/SlotSync
   ./start-backend-for-expo.sh
   ```

2. **Note the IP address** from backend startup logs

3. **Start frontend:**
   ```bash
   cd /Users/jamesricciardi/SlotSync
   export EXPO_PUBLIC_API_BASE_URL=http://YOUR_IP:3000
   npx expo start --clear
   ```

4. **Test health endpoint:**
   ```bash
   curl http://YOUR_IP:3000/health
   ```

5. **Open app on iPhone** via Expo Go QR code

6. **Scan an album cover** and watch logs in Terminal 1

7. **Verify:**
   - Request completes with `END status=200`
   - Album appears in library with cover art
   - Track list is populated

---

## Environment Variables (Optional)

You can customize timeout values:

```bash
# In Terminal 1 (before starting backend)
export EMBEDDING_TIMEOUT_MS=30000
export VECTOR_SEARCH_TIMEOUT_MS=5000
export VISION_TIMEOUT_MS=20000
export DISCOGS_FETCH_TIMEOUT_MS=15000
export DISCOGS_SEARCH_TIMEOUT_MS=15000
export REQUEST_TIMEOUT_MS=90000

# Then start backend
./start-backend-for-expo.sh
```

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `./start-backend-for-expo.sh` | Start backend server |
| `npx expo start --clear` | Start frontend with cleared cache |
| `curl http://IP:3000/health` | Test backend connectivity |
| `node -c backend-example/server-hybrid.js` | Check backend syntax |
| `lsof -ti:3000` | Check if port 3000 is in use |

---

## Success Indicators

✅ **Backend running:**
- See startup logs with IP address
- Health endpoint returns JSON

✅ **Frontend connected:**
- Expo shows QR code
- App loads in Expo Go
- No network errors in Expo logs

✅ **Identification working:**
- Request logs show `END status=200`
- Album appears with correct metadata
- Cover art and tracks populated

✅ **Request tracing working:**
- See `[REQ <id>]` logs for each request
- All phases complete with elapsed times
- No timeouts or errors
