# SlotSync Terminal Commands - Quick Reference

## 🚀 Quick Start (3 Terminal Windows)

### Terminal 1: Start Backend Server

```bash
cd /Users/jamesricciardi/SlotSync/backend-example

# Set required environment variables
export DISCOGS_PERSONAL_ACCESS_TOKEN='your_discogs_token_here'
export GOOGLE_APPLICATION_CREDENTIALS='/Users/jamesricciardi/SlotSync/backend-example/credentials.json'
export CONFIDENCE_THRESHOLD='0.5'  # Optional: tune confidence (default: 0.5)

# Start the server
npm start
```

**Expected Output:**
```
✅ Google Vision API client initialized
✅ Discogs API configured
✅ Connected to local database
🚀 SlotSync API Server running on port 3000
📍 Health check: http://localhost:3000/health
📍 Identify endpoint: http://localhost:3000/api/identify-record
✅ Ready to identify records!
```

**Keep this terminal open!**

---

### Terminal 2: Start Frontend (Expo)

```bash
cd /Users/jamesricciardi/SlotSync

# Enable debug logging (optional but recommended)
export EXPO_PUBLIC_DEBUG_IDENTIFICATION=true

# Set API base URL (IMPORTANT: Use your computer's LAN IP, not localhost!)
# Find your IP first:
ifconfig | grep "inet " | grep -v 127.0.0.1

# Then set it (replace XXX with your actual IP):
export EXPO_PUBLIC_API_BASE_URL='http://192.168.1.XXX:3000'

# Start Expo
npx expo start
```

**Expected Output:**
```
› Metro waiting on exp://192.168.x.x:8081
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)

› Press i │ open iOS simulator
› Press a │ open Android
› Press w │ open web
```

**Options:**
- Press `i` to open iOS simulator
- Press `a` to open Android emulator
- Scan QR code with Expo Go app on your phone

---

### Terminal 3: Test Backend (Optional)

```bash
cd /Users/jamesricciardi/SlotSync/backend-example

# Test health endpoint
curl http://localhost:3000/health

# Test identification with an image
curl -X POST http://localhost:3000/api/identify-record \
  -F "image=@/path/to/album-cover.jpg" \
  | jq '.'
```

---

## 🧪 Testing Commands

### Test Backend Health

```bash
# Quick health check
curl http://localhost:3000/health

# Ping endpoint
curl http://localhost:3000/api/ping

# API info
curl http://localhost:3000/api
```

### Test Identification with Image

```bash
# Using curl (replace with your image path)
curl -X POST http://localhost:3000/api/identify-record \
  -F "image=@$HOME/Downloads/album-cover.jpg" \
  | jq '.'

# Or use the test script
cd /Users/jamesricciardi/SlotSync/backend-example
./test-identify-endpoint.sh /path/to/album-cover.jpg
```

### Run Regression Tests (Dev Test Harness)

```bash
cd /Users/jamesricciardi/SlotSync/backend-example

# First, place test images in test-images/ folder:
#   - test-images/primitive_cool.jpg
#   - test-images/party_mix.jpg

# Run all tests
node devTest.js

# Expected output:
# 🧪 Testing: Mick Jagger – Primitive Cool
# ✅ Identification completed in XXXXms
# 📀 RESULT:
#    Artist: "Mick Jagger"
#    Album: "Primitive Cool"
#    ...
```

### Enable Dev Test API Endpoints

```bash
cd /Users/jamesricciardi/SlotSync/backend-example

# Set dev test flag
export ENABLE_DEV_TEST=true

# Restart server
npm start

# Now you can use:
# POST /api/dev-test with { "testName": "Mick Jagger – Primitive Cool" }
# GET /api/dev-test/run-all
```

---

## 🔍 Debugging Commands

### View Backend Logs

Backend logs appear in **Terminal 1** (where you ran `npm start`). Look for:

```
[Phase1] ✅ Generated X candidates...
[Phase2] ✅ Discogs match: "Artist" - "Album"
[Phase2] ❌ NO_DISCOGS_MATCH for candidate: ...
[Phase2] ⚠️  LOW_CONFIDENCE_REJECTED: ...
[API] ✅ ✅ ✅ IDENTIFICATION SUCCESS ✅ ✅ ✅
```

### View Frontend Debug Logs

With `EXPO_PUBLIC_DEBUG_IDENTIFICATION=true`, logs appear in **Terminal 2**:

```
[IDENTIFICATION] Starting album identification...
[IDENTIFICATION] Image hash: abc123...
[IDENTIFICATION] Cache miss - calling backend
[IDENTIFICATION] ✅ Backend identified: "Artist" - "Album"
```

### Check Image Hash Generation

```bash
# Test image hash utility (if you have a test script)
# Or check logs - hash is logged during identification
```

---

## 🛠️ Troubleshooting Commands

### Find Your Computer's IP Address

```bash
# Mac/Linux
ifconfig | grep "inet " | grep -v 127.0.0.1

# Or on Mac specifically
ipconfig getifaddr en0

# Use the IP that looks like 192.168.x.x or 10.0.x.x
```

### Check if Backend is Running

```bash
# Check if port 3000 is in use
lsof -i :3000

# Kill process if needed
kill -9 <PID>

# Or use different port
PORT=3001 npm start
```

### Check Backend Configuration

```bash
cd /Users/jamesricciardi/SlotSync/backend-example

# Verify environment variables
echo $DISCOGS_PERSONAL_ACCESS_TOKEN
echo $GOOGLE_APPLICATION_CREDENTIALS
echo $CONFIDENCE_THRESHOLD

# Test Discogs connection (if you have verify script)
node verify-discogs.js
```

### Check Frontend Configuration

```bash
cd /Users/jamesricciardi/SlotSync

# Verify environment variables
echo $EXPO_PUBLIC_DEBUG_IDENTIFICATION
echo $EXPO_PUBLIC_API_BASE_URL

# Should NOT contain localhost or 127.0.0.1 for physical devices!
```

### Clear Expo Cache (if issues)

```bash
cd /Users/jamesricciardi/SlotSync

# Clear Metro bundler cache
npx expo start --clear

# Or reset completely
rm -rf node_modules
npm install
npx expo start --clear
```

---

## 📊 Performance Testing

### Test Cache Performance

```bash
# First scan (cache miss - slower)
# Then scan same image again (cache hit - instant)

# Check logs for:
# [IDENTIFICATION] Cache miss - calling backend
# vs
# [IDENTIFICATION] ✅ Cache hit! Returning cached result
```

### Test with Different Confidence Thresholds

```bash
cd /Users/jamesricciardi/SlotSync/backend-example

# More strict (fewer false positives)
export CONFIDENCE_THRESHOLD=0.6
npm start

# More lenient (catches more albums)
export CONFIDENCE_THRESHOLD=0.4
npm start
```

---

## 🎯 Complete Test Workflow

### Full End-to-End Test

```bash
# Terminal 1: Start backend
cd /Users/jamesricciardi/SlotSync/backend-example
export DISCOGS_PERSONAL_ACCESS_TOKEN='your-token'
export GOOGLE_APPLICATION_CREDENTIALS='/Users/jamesricciardi/SlotSync/backend-example/credentials.json'
npm start

# Terminal 2: Start frontend
cd /Users/jamesricciardi/SlotSync
export EXPO_PUBLIC_DEBUG_IDENTIFICATION=true
export EXPO_PUBLIC_API_BASE_URL='http://YOUR_IP:3000'
npx expo start

# Terminal 3: Test backend directly
cd /Users/jamesricciardi/SlotSync/backend-example
curl http://localhost:3000/health

# Then in the app:
# 1. Open ScanRecordScreen
# 2. Take photo or select image
# 3. Watch logs in both terminals
# 4. Verify result appears in UI
```

---

## 📝 Quick Command Reference

```bash
# Backend
cd backend-example && npm start

# Frontend
cd /Users/jamesricciardi/SlotSync && npx expo start

# Health check
curl http://localhost:3000/health

# Test identification
curl -X POST http://localhost:3000/api/identify-record -F "image=@image.jpg" | jq '.'

# Run regression tests
cd backend-example && node devTest.js

# Find IP
ifconfig | grep "inet " | grep -v 127.0.0.1
```

---

## ⚙️ Environment Variables Summary

### Backend (`backend-example/`)
```bash
export DISCOGS_PERSONAL_ACCESS_TOKEN='your-token'
export GOOGLE_APPLICATION_CREDENTIALS='/Users/jamesricciardi/SlotSync/backend-example/credentials.json'
export CONFIDENCE_THRESHOLD='0.5'  # Optional
export ENABLE_DEV_TEST='true'      # Optional (for dev endpoints)
```

### Frontend (`/Users/jamesricciardi/SlotSync/`)
```bash
export EXPO_PUBLIC_DEBUG_IDENTIFICATION='true'  # Optional
export EXPO_PUBLIC_API_BASE_URL='http://YOUR_IP:3000'  # REQUIRED
```

---

## 🎬 Ready to Test!

1. **Start backend** (Terminal 1)
2. **Start frontend** (Terminal 2)
3. **Open app** (iOS simulator, Android emulator, or Expo Go)
4. **Scan an album cover**
5. **Watch logs** in both terminals
6. **Verify result** appears in UI

Happy testing! 🎵
