# Terminal Testing Commands

## Quick Start - Test Identification System

### Step 1: Start Backend Server

Open **Terminal 1** and run:

```bash
cd /Users/jamesricciardi/SlotSync/backend-example

# Set required environment variables
export DISCOGS_PERSONAL_ACCESS_TOKEN='gOQSOxYBRENZutcnwOQnAaYMxmePxboOxBfyAeHK'
export ENABLE_GOOGLE_VISION='true'
export OPENAI_API_KEY='sk-your-key-here'  # Replace with your actual key
export ENABLE_GPT4_VISION='true'
export CONFIDENCE_THRESHOLD='0.5'

# Start the server
npm start
```

**Expected output:**
```
✅ Google Vision API client initialized
🚀 SlotSync API Server (Enhanced) running on port 3000
📍 Health check: http://localhost:3000/health
✅ Ready to identify records!
```

**Keep this terminal open!**

---

### Step 2: Start Expo App with Debug Mode

Open **Terminal 2** and run:

```bash
cd /Users/jamesricciardi/SlotSync

# Enable debug logging
export EXPO_PUBLIC_DEBUG_IDENTIFICATION=true

# Set API base URL (use your computer's LAN IP, not localhost)
# Find your IP with: ifconfig | grep "inet " | grep -v 127.0.0.1
export EXPO_PUBLIC_API_BASE_URL='http://192.168.1.XXX:3000'  # Replace XXX with your IP

# Start Expo
npx expo start
```

**Expected output:**
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

### Step 3: Access Dev Test Screen

Once the app is running:

1. **Navigate to Dev Test Screen:**
   - The screen is only available in dev mode
   - You can add a button in Settings screen or navigate directly
   - Or use the navigation: `navigate('DevTest')`

2. **Test Identification:**
   - Tap "Pick Image from Library"
   - Select a test image (album cover photo)
   - Tap "Run Test"
   - View detailed results with debug logs

---

## Alternative: Test Backend API Directly

### Test with curl (Terminal 3)

```bash
# Test health endpoint
curl http://localhost:3000/health

# Test identification endpoint (replace with path to test image)
curl -X POST http://localhost:3000/api/identify-record \
  -F "image=@/path/to/test-image.jpg" \
  -H "Content-Type: multipart/form-data" \
  | jq '.'
```

**Example with test image:**
```bash
# If you have a test image in your Downloads folder
curl -X POST http://localhost:3000/api/identify-record \
  -F "image=@$HOME/Downloads/album-cover.jpg" \
  | jq '.'
```

---

## View Debug Logs

### In Expo Terminal (Terminal 2)

With `EXPO_PUBLIC_DEBUG_IDENTIFICATION=true`, you'll see:

```
[DEBUG:IDENTIFICATION] Image hash: abc123...
[DEBUG:VISION] Top 5 web entities: [...]
[DEBUG:CANDIDATES] Generated 12 candidates...
[DEBUG:DISCOGS] Generated 8 query variations: [...]
[DEBUG:DISCOGS] Top 5 Discogs matches: [...]
[DEBUG:RESOLVED] Final ResolvedAlbum: {...}
```

### In Backend Terminal (Terminal 1)

You'll see backend processing logs:

```
[API] Processing image: cover.jpg, 245678 bytes
[Google Vision] Performing comprehensive analysis...
[Google Vision] Found 5 candidates
[Discogs] Searching for: "The B-52's" - "Party Mix!"
[Discogs] Generated 15 query variations
[Discogs] ✅ Good match: "The B-52's - Party Mix!" (similarity: 0.92)
[API] ✅ ✅ ✅ IDENTIFICATION SUCCESS ✅ ✅ ✅
```

---

## Test Hard Cases

### Test "The B-52's – Party Mix!"

1. Find or take a photo of this album cover
2. Use Dev Test Screen to test it
3. Check debug logs for:
   - Apostrophe handling in candidates
   - Query variations (B-52's vs B-52s)
   - Exclamation mark handling
   - "The" prefix removal

### Test "Mick Jagger – Primitive Cool"

1. Find or take a photo of this album cover
2. Use Dev Test Screen to test it
3. Check debug logs for:
   - Apostrophe in artist name
   - Special character handling
   - Discogs query generation

---

## Troubleshooting

### Backend not starting?

```bash
# Check if port 3000 is in use
lsof -i :3000

# Kill process if needed
kill -9 <PID>

# Or use different port
PORT=3001 npm start
```

### Expo can't connect to backend?

```bash
# Make sure you're using LAN IP, not localhost
# Find your IP:
ifconfig | grep "inet " | grep -v 127.0.0.1

# Update EXPO_PUBLIC_API_BASE_URL with your actual IP
export EXPO_PUBLIC_API_BASE_URL='http://192.168.1.XXX:3000'
```

### Debug logs not showing?

```bash
# Make sure debug flag is set
echo $EXPO_PUBLIC_DEBUG_IDENTIFICATION
# Should output: true

# If not, set it again:
export EXPO_PUBLIC_DEBUG_IDENTIFICATION=true
npx expo start
```

### Test image not found?

```bash
# Use any album cover image from your phone/computer
# The Dev Test Screen has an image picker
# Or test with curl using a local file path
```

---

## Quick Test Script

Create a test script `test-identification.sh`:

```bash
#!/bin/bash

echo "🧪 Testing SlotSync Identification"
echo "=================================="

# Check if backend is running
if ! curl -s http://localhost:3000/health > /dev/null; then
    echo "❌ Backend not running! Start it first with: cd backend-example && npm start"
    exit 1
fi

echo "✅ Backend is running"

# Test with a sample image (if you have one)
if [ -f "$1" ]; then
    echo "📸 Testing with image: $1"
    curl -X POST http://localhost:3000/api/identify-record \
      -F "image=@$1" \
      | jq '.'
else
    echo "Usage: ./test-identification.sh /path/to/image.jpg"
    echo "Or use the Dev Test Screen in the app"
fi
```

Make it executable:
```bash
chmod +x test-identification.sh
./test-identification.sh /path/to/test-image.jpg
```

---

## Summary

**Three terminals needed:**

1. **Terminal 1:** Backend server (`cd backend-example && npm start`)
2. **Terminal 2:** Expo app with debug (`export EXPO_PUBLIC_DEBUG_IDENTIFICATION=true && npx expo start`)
3. **Terminal 3 (optional):** Test API directly with curl

**To test:**
- Use Dev Test Screen in the app (easiest)
- Or test API directly with curl
- Check both terminals for debug logs

**Debug logs show:**
- Image hash
- Vision entities and OCR
- Generated candidates
- Discogs queries and matches
- Final resolved album
- Timing information

