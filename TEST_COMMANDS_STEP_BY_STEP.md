# SlotSync Test Commands - Step by Step

## Your IP Address: `192.168.1.129`

---

## 🚀 TERMINAL 1: Start Backend Server

```bash
# Navigate to backend directory
cd /Users/jamesricciardi/SlotSync/backend-example

# Set Discogs API token
export DISCOGS_PERSONAL_ACCESS_TOKEN='gOQSOxYBRENZutcnwOQnAaYMxmePxboOxBfyAeHK'

# Set Google Vision credentials (REPLACE with your actual path)
export GOOGLE_APPLICATION_CREDENTIALS='/path/to/your/google-credentials.json'

# Optional: Set confidence threshold (default: 0.5)
export CONFIDENCE_THRESHOLD='0.5'

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

## 📱 TERMINAL 2: Start Frontend (Expo)

**Open a NEW terminal window/tab**, then run:

```bash
# Navigate to project root
cd /Users/jamesricciardi/SlotSync

# Enable debug logging (recommended)
export EXPO_PUBLIC_DEBUG_IDENTIFICATION=true

# Set API base URL with YOUR IP address
export EXPO_PUBLIC_API_BASE_URL='http://192.168.1.129:3000'

# Start Expo
npx expo start
```

**Expected Output:**
```
› Metro waiting on exp://192.168.1.129:8081
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)

› Press i │ open iOS simulator
› Press a │ open Android
› Press w │ open web
```

**Then:**
- Press `i` to open iOS simulator, OR
- Press `a` to open Android emulator, OR
- Scan QR code with Expo Go app on your phone

---

## 🧪 TERMINAL 3: Test Backend (Optional)

**Open a THIRD terminal window/tab**, then run:

### Test Health Endpoint

```bash
curl http://localhost:3000/health
```

**Expected Output:**
```json
{
  "status": "ok",
  "timestamp": "2024-...",
  "services": {
    "googleVision": "configured",
    "discogs": "configured",
    "localDatabase": "connected"
  }
}
```

### Test Ping Endpoint

```bash
curl http://localhost:3000/api/ping
```

**Expected Output:**
```json
{
  "status": "ok",
  "timestamp": "2024-...",
  "server": "SlotSync API",
  "version": "1.0.0"
}
```

### Test Identification with Image

```bash
# Replace /path/to/album-cover.jpg with actual image path
curl -X POST http://localhost:3000/api/identify-record \
  -F "image=@/path/to/album-cover.jpg" \
  | jq '.'
```

**Example:**
```bash
# If you have an image in Downloads
curl -X POST http://localhost:3000/api/identify-record \
  -F "image=@$HOME/Downloads/album-cover.jpg" \
  | jq '.'
```

**Expected Output:**
```json
{
  "success": true,
  "confidence": 0.95,
  "artist": "The Beatles",
  "albumTitle": "Abbey Road",
  "releaseYear": 1969,
  "discogsId": "12345",
  "coverImageUrl": "https://...",
  "tracks": [...]
}
```

---

## 🎯 Test in the App

Once both backend and frontend are running:

1. **Open the app** (iOS simulator, Android emulator, or Expo Go)
2. **Navigate to ScanRecordScreen** (usually Library tab → Scan button)
3. **Take a photo** or **select image from library**
4. **Watch the logs** in Terminal 1 (backend) and Terminal 2 (frontend)
5. **Verify result** appears in the UI

---

## 🧪 Run Regression Tests (Dev Test Harness)

### Setup Test Images

```bash
# Create test images directory
cd /Users/jamesricciardi/SlotSync/backend-example
mkdir -p test-images

# Place test images here:
#   - test-images/primitive_cool.jpg
#   - test-images/party_mix.jpg
```

### Run Tests

```bash
cd /Users/jamesricciardi/SlotSync/backend-example

# Run all regression tests
node devTest.js
```

**Expected Output:**
```
🧪 Testing: Mick Jagger – Primitive Cool
✅ Identification completed in XXXXms
📀 RESULT:
   Artist: "Mick Jagger"
   Album: "Primitive Cool"
   Year: 1987
   Confidence: 0.95
   ...

🧪 Testing: The B-52's – Party Mix!
✅ Identification completed in XXXXms
📀 RESULT:
   ...
```

---

## 🔍 View Debug Logs

### Backend Logs (Terminal 1)

Watch for:
```
[Phase1] ✅ Generated X candidates...
[Phase2] ✅ Discogs match: "Artist" - "Album"
[Phase2] ❌ NO_DISCOGS_MATCH for candidate: ...
[Phase2] ⚠️  LOW_CONFIDENCE_REJECTED: ...
[API] ✅ ✅ ✅ IDENTIFICATION SUCCESS ✅ ✅ ✅
```

### Frontend Logs (Terminal 2)

With `EXPO_PUBLIC_DEBUG_IDENTIFICATION=true`, watch for:
```
[IDENTIFICATION] Starting album identification...
[IDENTIFICATION] Image hash: abc123...
[IDENTIFICATION] Cache miss - calling backend
[IDENTIFICATION] ✅ Backend identified: "Artist" - "Album"
```

---

## 🛠️ Troubleshooting Commands

### Check if Backend is Running

```bash
# Check if port 3000 is in use
lsof -i :3000

# Kill process if needed (replace PID with actual process ID)
kill -9 <PID>
```

### Check Environment Variables

```bash
# Backend (Terminal 1)
echo $DISCOGS_PERSONAL_ACCESS_TOKEN
echo $GOOGLE_APPLICATION_CREDENTIALS
echo $CONFIDENCE_THRESHOLD

# Frontend (Terminal 2)
echo $EXPO_PUBLIC_DEBUG_IDENTIFICATION
echo $EXPO_PUBLIC_API_BASE_URL
```

### Test Backend Connectivity from Frontend

```bash
# In Terminal 2 (frontend), test if backend is reachable
curl http://192.168.1.129:3000/health
```

### Clear Expo Cache (if issues)

```bash
cd /Users/jamesricciardi/SlotSync
npx expo start --clear
```

---

## 📋 Complete Command Checklist

### ✅ Terminal 1 (Backend)
- [ ] `cd /Users/jamesricciardi/SlotSync/backend-example`
- [ ] `export DISCOGS_PERSONAL_ACCESS_TOKEN='gOQSOxYBRENZutcnwOQnAaYMxmePxboOxBfyAeHK'`
- [ ] `export GOOGLE_APPLICATION_CREDENTIALS='/path/to/credentials.json'`
- [ ] `export CONFIDENCE_THRESHOLD='0.5'`
- [ ] `npm start`
- [ ] See "✅ Ready to identify records!" message

### ✅ Terminal 2 (Frontend)
- [ ] `cd /Users/jamesricciardi/SlotSync`
- [ ] `export EXPO_PUBLIC_DEBUG_IDENTIFICATION=true`
- [ ] `export EXPO_PUBLIC_API_BASE_URL='http://192.168.1.129:3000'`
- [ ] `npx expo start`
- [ ] Press `i` (iOS) or `a` (Android) or scan QR code

### ✅ Terminal 3 (Testing - Optional)
- [ ] `curl http://localhost:3000/health` - Should return JSON
- [ ] `curl http://localhost:3000/api/ping` - Should return JSON
- [ ] Test identification with image (if you have one)

---

## 🎬 Quick Start (Copy-Paste Ready)

### Terminal 1: Backend
```bash
cd /Users/jamesricciardi/SlotSync/backend-example && export DISCOGS_PERSONAL_ACCESS_TOKEN='gOQSOxYBRENZutcnwOQnAaYMxmePxboOxBfyAeHK' && export GOOGLE_APPLICATION_CREDENTIALS='/path/to/your/google-credentials.json' && export CONFIDENCE_THRESHOLD='0.5' && npm start
```

### Terminal 2: Frontend
```bash
cd /Users/jamesricciardi/SlotSync && export EXPO_PUBLIC_DEBUG_IDENTIFICATION=true && export EXPO_PUBLIC_API_BASE_URL='http://192.168.1.129:3000' && npx expo start
```

### Terminal 3: Test
```bash
curl http://localhost:3000/health && echo "" && curl http://localhost:3000/api/ping
```

---

## 🎯 What to Expect

1. **Backend starts** → Shows "✅ Ready to identify records!"
2. **Frontend starts** → Shows QR code and options
3. **App opens** → Navigate to scan screen
4. **Take photo** → Watch logs in both terminals
5. **Result appears** → Album info displayed in UI

---

## ⚠️ Important Notes

1. **Google Credentials**: Replace `/path/to/your/google-credentials.json` with actual path
2. **IP Address**: Using `192.168.1.129` (your current IP)
3. **Physical Devices**: Must use IP address, not `localhost`
4. **Simulators**: Can use `localhost:3000` but IP works too
5. **Debug Logs**: Enable with `EXPO_PUBLIC_DEBUG_IDENTIFICATION=true`

---

## 🚨 Common Issues

### "Network request failed"
- Check `EXPO_PUBLIC_API_BASE_URL` is set correctly
- Verify backend is running (Terminal 1)
- Ensure IP address is correct (`192.168.1.129`)

### "API error: 500"
- Check backend logs (Terminal 1) for error details
- Verify `DISCOGS_PERSONAL_ACCESS_TOKEN` is set
- Verify `GOOGLE_APPLICATION_CREDENTIALS` path is correct

### "No candidates extracted"
- Check image quality (should be clear album cover)
- Check backend logs for `NO_CANDIDATES_FROM_VISION`
- Try a different image

---

## ✅ Success Indicators

- ✅ Backend shows "Ready to identify records!"
- ✅ Frontend shows QR code and options
- ✅ Health check returns `{"status":"ok"}`
- ✅ App can connect to backend
- ✅ Identification returns album data
- ✅ Logs show successful identification

---

**Ready to test! Start with Terminal 1, then Terminal 2, then test in the app.** 🎵

