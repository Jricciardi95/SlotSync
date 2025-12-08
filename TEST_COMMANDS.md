# Testing Commands - SlotSync

## Quick Start

### Terminal 1 - Backend Server

```bash
cd /Users/jamesricciardi/SlotSync/backend-example
export DISCOGS_PERSONAL_ACCESS_TOKEN='gOQSOxYBRENZutcnwOQnAaYMxmePxboOxBfyAeHK'
export ENABLE_GOOGLE_VISION='true'
export OPENAI_API_KEY='sk-your-key-here'
export ENABLE_GPT4_VISION='true'
export ENABLE_IMAGE_PREPROCESSING='true'
export ENABLE_IMAGE_EMBEDDINGS='true'
export CONFIDENCE_THRESHOLD='0.5'
npm start
```

**⚠️ IMPORTANT:** Replace `'sk-your-key-here'` with your actual OpenAI API key!

---

### Terminal 2 - Frontend (Expo)

```bash
cd /Users/jamesricciardi/SlotSync
npx expo start
```

Then scan the QR code with **Expo Go** app on your phone.

---

## Expected Output

### Terminal 1 (Backend) - Success:
```
[GPT-4 Vision] ✅ OpenAI client initialized
[Image Embedding] ✅ OpenAI client initialized
[Config] ⚙️  Confidence threshold: 0.5
[Config] ✅ GPT-4 Vision enabled
[Config] ✅ Image Embeddings enabled
[Config] ✅ Image Preprocessing enabled
[Config] 📊 Stored embeddings: 0
✅ Google Vision API client initialized
✅ Database tables ready (records + embeddings)
🚀 SlotSync API Server (Enhanced) running on port 3000
📍 Health check: http://localhost:3000/health
✅ Ready to identify records!
```

### Terminal 2 (Frontend) - Success:
```
› Metro waiting on exp://192.168.x.x:8081
› Scan the QR code above with Expo Go
```

---

## Testing Steps

1. **Start Backend** (Terminal 1)
   - Wait for "✅ Ready to identify records!"
   - Keep this terminal open

2. **Start Frontend** (Terminal 2)
   - Wait for QR code to appear
   - Keep this terminal open

3. **Open Expo Go** on your phone
   - Install from App Store / Google Play if needed
   - Make sure phone and computer are on same Wi-Fi

4. **Scan QR Code**
   - Open Expo Go app
   - Tap "Scan QR code"
   - Point camera at QR code in Terminal 2
   - App will load automatically

5. **Test Album Identification**
   - In the app, tap **"Scan Record"** or camera icon
   - Take a photo of an album cover (or select from gallery)
   - Wait for identification (watch spinner)

6. **Watch Backend Logs** (Terminal 1)
   - You should see processing steps:
     ```
     [API] 📸 Image received: ...
     [API] 🎨 Preprocessing image for better OCR...
     [API] 🎨 Checking for similar albums using embeddings...
     [API] 🔍 Starting Google Vision analysis...
     [API] ✅ GPT-4 Vision identified: "Artist" - "Title"
     [API] ✅ ✅ ✅ IDENTIFICATION SUCCESS ✅ ✅ ✅
     ```

---

## What to Test

### ✅ Basic Functionality
- [ ] App loads in Expo Go
- [ ] Camera opens when tapping "Scan Record"
- [ ] Photo can be taken or selected from gallery
- [ ] Identification process shows spinner
- [ ] Results appear after identification

### ✅ Identification Features
- [ ] Clear album covers are identified correctly
- [ ] Artist and title are extracted
- [ ] Track list is fetched (if available)
- [ ] Cover image is displayed
- [ ] Results can be saved to library

### ✅ Advanced Features (if enabled)
- [ ] Image preprocessing improves OCR accuracy
- [ ] Embedding database finds similar albums
- [ ] GPT-4 Vision handles difficult covers
- [ ] Previously identified albums match faster

---

## Troubleshooting

### Backend Won't Start

**Error: Port 3000 already in use**
```bash
# Find and kill process using port 3000
lsof -ti:3000 | xargs kill -9
# Then try npm start again
```

**Error: Module not found**
```bash
cd /Users/jamesricciardi/SlotSync/backend-example
npm install
```

**Error: OpenAI API key invalid**
- Check that `OPENAI_API_KEY` is set correctly
- Verify the key starts with `sk-` and is valid
- Check OpenAI dashboard for usage/errors

---

### Expo Won't Connect

**QR Code doesn't work**
- Make sure phone and computer are on same Wi-Fi network
- Try pressing `s` in Terminal 2 to switch to development build
- Or manually enter the URL shown in Terminal 2

**App won't load**
- Press `r` in Terminal 2 to reload
- Restart Expo: `Ctrl+C` then `npx expo start` again
- Clear Expo Go cache: Settings → Clear cache

**Connection timeout**
- Check firewall isn't blocking port 8081
- Try using tunnel mode: `npx expo start --tunnel`

---

### Identification Not Working

**No results returned**
- Check backend logs in Terminal 1 for errors
- Verify Google Vision API is enabled
- Check image quality (should be clear, well-lit, full cover visible)

**Wrong album identified**
- Try a clearer photo
- Ensure full album cover is visible
- Check backend logs for confidence scores
- Lower `CONFIDENCE_THRESHOLD` if too strict

**Timeout errors**
- Image might be too large - try resizing
- Check network connection
- Verify backend is running and accessible

---

## Optional: Test Individual Features

### Test Image Preprocessing
```bash
# In Terminal 1, watch for:
[API] 🎨 Preprocessing image for better OCR...
[API] ✅ Image preprocessing complete in XXXms
```

### Test Embedding Search
```bash
# In Terminal 1, watch for:
[API] 🎨 Checking for similar albums using embeddings...
[API] ✅ Found X visually similar albums
```

### Test GPT-4 Vision
```bash
# In Terminal 1, watch for:
[API] 🧠 Vision candidates insufficient, trying GPT-4 Vision...
[GPT-4 Vision] 🧠 Starting intelligent image analysis...
[API] ✅ GPT-4 Vision identified: "Artist" - "Title"
```

---

## Success Criteria

✅ **Backend starts** without errors  
✅ **Frontend loads** in Expo Go  
✅ **Camera works** and can capture photos  
✅ **Identification succeeds** for clear album covers  
✅ **Results display** correctly (artist, title, tracks)  
✅ **Library saves** albums successfully  

---

## Next Steps After Testing

1. **Monitor costs** - Check OpenAI usage dashboard
2. **Adjust confidence** - Tune `CONFIDENCE_THRESHOLD` if needed
3. **Build embedding database** - More identifications = better matching
4. **Test edge cases** - Try difficult covers, low light, etc.
