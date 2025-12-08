# Quick Start Commands - Expo Go

## Terminal 1 - Backend Server

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

## Terminal 2 - Frontend (Expo)

```bash
cd /Users/jamesricciardi/SlotSync
npx expo start
```

Then:
1. **Scan the QR code** shown in the terminal with the **Expo Go** app on your phone
2. Or press `s` in the terminal to open in Expo Go

---

## Expected Output

### Terminal 1 (Backend) should show:
```
[Config] ✅ GPT-4 Vision enabled
[Config] ✅ Image Embeddings enabled
[Config] ✅ Image Preprocessing enabled
[Config] 📊 Stored embeddings: 0
[GPT-4 Vision] ✅ OpenAI client initialized
[Image Embedding] ✅ OpenAI client initialized
✅ Google Vision API client initialized
✅ Database tables ready (records + embeddings)
🚀 SlotSync API Server (Enhanced) running on port 3000
📍 Health check: http://localhost:3000/health
✅ Ready to identify records!
```

### Terminal 2 (Frontend) should show:
```
› Metro waiting on exp://192.168.x.x:8081
› Scan the QR code above with Expo Go
```

---

## Features Enabled

✅ **Google Vision API** - OCR and web detection  
✅ **GPT-4 Vision** - Intelligent fallback for difficult covers  
✅ **Image Preprocessing** - Enhances images before OCR  
✅ **Embedding Database** - Visual similarity matching  

---

## Troubleshooting

### Backend won't start?
- Check that all environment variables are set
- Make sure OpenAI API key is valid
- Verify port 3000 is not in use

### Expo won't connect?
- Make sure phone and computer are on same Wi-Fi
- Try pressing `r` in Terminal 2 to reload
- Restart Expo: `Ctrl+C` then `npx expo start` again

### GPT-4 Vision not working?
- Verify `OPENAI_API_KEY` is set correctly
- Check `ENABLE_GPT4_VISION='true'` is set
- Look for `[Config] ✅ GPT-4 Vision enabled` in logs

---

## Optional: Disable Features

If you want to disable certain features, just remove or set to `'false'`:

```bash
# Disable preprocessing
export ENABLE_IMAGE_PREPROCESSING='false'

# Disable embeddings
export ENABLE_IMAGE_EMBEDDINGS='false'

# Disable GPT-4 Vision
export ENABLE_GPT4_VISION='false'
```
