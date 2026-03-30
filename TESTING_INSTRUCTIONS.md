# Testing Instructions - Additional Optimizations

## Prerequisites

### 1. Install New Dependencies
```bash
cd /Users/jamesricciardi/SlotSync
npm install
```

This will install `expo-image-manipulator` which is required for image resizing.

---

## Backend Setup (Terminal 1)

### Start Backend Server with New Configuration

```bash
cd /Users/jamesricciardi/SlotSync/backend-example

# Set environment variables
export DISCOGS_PERSONAL_ACCESS_TOKEN='your_discogs_token_here'
export ENABLE_GOOGLE_VISION='true'

# Optional: Set confidence threshold (default: 0.6)
# Lower = more lenient (0.4-0.5), Higher = more strict (0.65-0.7)
export CONFIDENCE_THRESHOLD=0.6

# Start server
npm start
```

**Expected Output:**
```
✅ Google Vision API client initialized
🚀 SlotSync API Server (Enhanced) running on port 3000
📍 Health check: http://localhost:3000/health
📍 API info: http://localhost:3000/api
📍 Identify endpoint: http://localhost:3000/api/identify-record
[Config] Confidence threshold: 0.6 (set CONFIDENCE_THRESHOLD env var to change)
✅ Ready to identify records!
✅ Connected to local database
✅ Database table ready
```

---

## Frontend Setup (Terminal 2)

### Start Expo Development Server

```bash
cd /Users/jamesricciardi/SlotSync

# Kill any existing Expo processes on port 8081
lsof -ti:8081 | xargs kill -9 2>/dev/null || true

# Start Expo
npx expo start
```

**Expected Output:**
- QR code for Expo Go
- Development server running

---

## Testing Checklist

### ✅ Test 1: Image Recognition (Existing Feature)
1. Open app in Expo Go
2. Navigate to Library tab
3. Tap "+" button → "Scan cover"
4. **Verify**: Image is automatically resized before sending (check logs)
5. **Verify**: Retry logic works on network errors
6. **Verify**: Better timeout handling

**What to Look For:**
- Console logs showing: `[ImageResize] Resizing image...`
- Faster upload times (smaller images)
- No timeout errors for normal-sized images

---

### ✅ Test 2: Barcode Scanner (NEW)
1. Open app in Expo Go
2. Navigate to Library tab
3. Tap "+" button → "Scan cover"
4. **Tap "Barcode" mode toggle** (top of screen)
5. Point camera at a barcode on a modern record
6. **Verify**: Automatic scanning (no button press needed)
7. **Verify**: Instant identification with full metadata

**What to Look For:**
- Mode toggle switches between Image/Barcode
- Barcode mode shows "Position barcode in frame" instruction
- Automatic scanning when barcode is detected
- Haptic feedback on successful scan
- Full album details including tracks

**Test Barcodes:**
- Modern reissues usually have barcodes
- Try EAN-13, UPC-A formats
- Should work with any standard barcode format

---

### ✅ Test 3: Confidence Threshold (NEW)
1. Start backend with different threshold values
2. Test same album with different thresholds
3. **Verify**: Higher threshold = fewer false positives
4. **Verify**: Lower threshold = catches more albums

**Test Commands:**
```bash
# Strict (fewer false positives)
export CONFIDENCE_THRESHOLD=0.65
npm start

# Lenient (catches more albums)
export CONFIDENCE_THRESHOLD=0.5
npm start
```

**What to Look For:**
- Backend logs show: `[Config] Confidence threshold: X`
- Different albums may pass/fail based on threshold
- Adjust threshold based on your collection's needs

---

### ✅ Test 4: Image Preprocessing (Foundation)
**Note**: Full preprocessing requires additional libraries, but foundation is in place.

1. Check console logs for preprocessing messages
2. **Verify**: Code structure is ready for future enhancement

**What to Look For:**
- No errors related to preprocessing
- Code is ready for `react-native-image-filter-kit` integration

---

## Troubleshooting

### Issue: "expo-image-manipulator not found"
**Solution:**
```bash
cd /Users/jamesricciardi/SlotSync
npm install
```

### Issue: Barcode scanner not working
**Check:**
- Camera permissions are granted
- Barcode is clear and well-lit
- Using a modern record with barcode
- Mode is set to "Barcode" (not "Image")

### Issue: Confidence threshold not working
**Check:**
- Environment variable is set before starting backend
- Backend logs show: `[Config] Confidence threshold: X`
- Restart backend after changing threshold

### Issue: Image recognition still timing out
**Check:**
- Image is being resized (check logs)
- Backend is running and accessible
- Network connection is stable
- Try with a smaller/clearer image

---

## Expected Improvements

### Performance
- ✅ Faster image uploads (resized to 640x480)
- ✅ Fewer timeout errors
- ✅ Better retry handling

### Accuracy
- ✅ Configurable confidence threshold
- ✅ Barcode scanning (100% accurate for modern records)
- ✅ Better error messages

### User Experience
- ✅ Mode toggle for Image/Barcode
- ✅ Automatic barcode scanning
- ✅ Clearer instructions per mode

---

## Next Steps After Testing

1. **Tune Confidence Threshold**: Adjust based on your collection
   - More false positives? Increase threshold
   - Missing valid albums? Decrease threshold

2. **Test with Your Collection**: 
   - Try various album covers
   - Test barcodes on modern records
   - Note which albums work best

3. **Report Issues**: 
   - Note any albums that fail identification
   - Check backend logs for detailed error info
   - Adjust threshold as needed

---

## Quick Test Commands

**Terminal 1 (Backend):**
```bash
cd /Users/jamesricciardi/SlotSync/backend-example
export DISCOGS_PERSONAL_ACCESS_TOKEN='your_discogs_token_here'
export ENABLE_GOOGLE_VISION='true'
export CONFIDENCE_THRESHOLD=0.6
npm start
```

**Terminal 2 (Frontend):**
```bash
cd /Users/jamesricciardi/SlotSync
lsof -ti:8081 | xargs kill -9 2>/dev/null || true
npx expo start
```

**Ready to test!** 🚀

