# Quick Start Commands - Expo Go

## Step 1: Start Backend Server

Open **Terminal 1** and run:

```bash
cd /Users/jamesricciardi/SlotSync/backend-example
export DISCOGS_PERSONAL_ACCESS_TOKEN='your_discogs_token_here'
export ENABLE_GOOGLE_VISION='true'
export OPENAI_API_KEY='sk-your-key-here'
export ENABLE_GPT4_VISION='true'
export CONFIDENCE_THRESHOLD='0.5'
npm start
```

**⚠️ IMPORTANT:** Replace `'sk-your-key-here'` with your actual OpenAI API key!

**Expected output:**
```
[Config] ✅ GPT-4 Vision enabled
[GPT-4 Vision] ✅ OpenAI client initialized
✅ Google Vision API client initialized
🚀 SlotSync API Server (Enhanced) running on port 3000
📍 Health check: http://localhost:3000/health
✅ Ready to identify records!
```

---

## Step 2: Start Frontend (Expo)

Open **Terminal 2** and run:

```bash
cd /Users/jamesricciardi/SlotSync
npx expo start
```

**Expected output:**
```
› Metro waiting on exp://192.168.x.x:8081
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)

› Press s │ switch to development build
› Press a │ open Android
› Press i │ open iOS simulator
› Press w │ open web

› Press r │ reload app
› Press m │ toggle menu
› Press o │ open project code in your editor
```

---

## Step 3: Open in Expo Go

### Option A: Scan QR Code (Recommended)
1. Open **Expo Go** app on your phone
2. Tap **"Scan QR code"**
3. Scan the QR code shown in Terminal 2
4. App will load on your phone

### Option B: Manual Connection
1. Open **Expo Go** app on your phone
2. Make sure your phone is on the same Wi-Fi network as your computer
3. In Terminal 2, look for the URL: `exp://192.168.x.x:8081`
4. Type this URL in Expo Go's connection field

---

## Step 4: Test Album Identification

1. In the app, tap **"Scan Record"** or the camera icon
2. Take a photo of an album cover (or select from gallery)
3. Watch Terminal 1 (backend) for processing logs
4. App should identify the album and show results

---

## Troubleshooting

### Backend Won't Start

**Check:**
- All environment variables are set correctly
- OpenAI API key is valid
- Port 3000 is not already in use

**Test backend:**
```bash
curl http://localhost:3000/health
```

Should return: `{"status":"ok",...}`

---

### Expo Won't Connect

**Check:**
- Phone and computer are on same Wi-Fi network
- Firewall isn't blocking port 8081
- Expo Go app is installed and up to date

**Try:**
- Press `r` in Terminal 2 to reload
- Press `m` to toggle menu
- Restart Expo: `Ctrl+C` then `npx expo start` again

---

### GPT-4 Vision Not Working

**Check:**
- `OPENAI_API_KEY` is set correctly
- `ENABLE_GPT4_VISION='true'` is set
- Backend logs show: `[Config] ✅ GPT-4 Vision enabled`

**Test:**
```bash
cd backend-example
export OPENAI_API_KEY='sk-...'
export ENABLE_GPT4_VISION='true'
node -e "const gpt4 = require('./services/gpt4Vision'); console.log('Enabled:', gpt4.isEnabled());"
```

Should output: `Enabled: true`

---

## Quick Reference

### Backend Commands (Terminal 1)
```bash
# Start server
cd /Users/jamesricciardi/SlotSync/backend-example
export DISCOGS_PERSONAL_ACCESS_TOKEN='your_discogs_token_here'
export ENABLE_GOOGLE_VISION='true'
export OPENAI_API_KEY='sk-...'
export ENABLE_GPT4_VISION='true'
npm start

# Stop server
Ctrl+C
```

### Frontend Commands (Terminal 2)
```bash
# Start Expo
cd /Users/jamesricciardi/SlotSync
npx expo start

# Reload app
Press 'r' in terminal

# Stop Expo
Ctrl+C
```

---

## What Success Looks Like

### Backend Logs (Terminal 1)
```
[API] 📸 Image received: cover.jpg
[API] 📸 Image size: 245.32KB
[API] 🔍 Starting Google Vision analysis...
[API] ✅ Vision analysis complete
[API] 🧠 Vision candidates insufficient, trying GPT-4 Vision fallback...
[GPT-4 Vision] 🧠 Starting intelligent image analysis...
[GPT-4 Vision] ✅ Received response from GPT-4 Vision
[API] ✅ GPT-4 Vision identified: "Mick Jagger" - "Primitive Cool"
[Discogs] 🔍 Starting Discogs search...
[API] ✅ ✅ ✅ IDENTIFICATION SUCCESS ✅ ✅ ✅
```

### App Behavior
- Camera opens when you tap "Scan Record"
- Photo is captured/selected
- Spinner shows "Identifying..."
- Results appear with album info and tracks
- You can save to library

---

## Need Help?

- Check `GPT4_VISION_TESTING.md` for detailed testing scenarios
- Check `VINYL_VISION_INTEGRATION.md` for integration details
- Check backend logs for error messages
- Verify all environment variables are set

