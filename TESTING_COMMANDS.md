# Testing on Expo Go - Quick Start

## ✅ Current Status

- ✅ Backend server: Running on port 3000
- ✅ Google Vision: Configured
- ✅ Discogs API: Configured
- ✅ API URL: `http://192.168.1.215:3000`

---

## 🚀 Commands to Run

### Terminal 1: Backend Server (Already Running)
```bash
# Backend is already running, but if you need to restart:
cd /Users/jamesricciardi/SlotSync/backend-example
export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"
export DISCOGS_PERSONAL_ACCESS_TOKEN="gOQSOxYBRENZutcnwOQnAaYMxmePxboOxBfyAeHK"
export ENABLE_GOOGLE_VISION=true
node server-hybrid.js
```

### Terminal 2: Expo Server
```bash
cd /Users/jamesricciardi/SlotSync
npx expo start --clear
```

**Then:**
- Scan the QR code with Expo Go app (iOS/Android)
- Make sure your phone is on the same Wi-Fi network

---

## 📱 Testing the Scan Flow

1. **Open Expo Go** on your device
2. **Scan the QR code** from Terminal 2
3. **Navigate to Library tab**
4. **Tap "Add Record" → "Scan cover"**
5. **Point camera at album cover**
6. **Wait for auto-capture** (1.5s if aligned, 2.5s otherwise)
7. **Watch for identification**:
   - Google Vision extracts text
   - Discogs searches with text
   - Result appears

---

## 🔍 What to Check

### Backend Logs (Terminal 1)
You should see:
```
[API] Processing image: ...
[API] Extracting text with Google Vision (backup OCR)...
[API] Extracted text: Artist Name Album Title...
[API] Searching Discogs (primary database)...
[Discogs] Searching for: Artist Name - Album Title
[Discogs] Found: Artist Name - Album Title
[API] Success! Returning Discogs result
```

### App Behavior
- ✅ Camera opens automatically
- ✅ Auto-capture works (1.5s or 2.5s)
- ✅ Identification happens automatically
- ✅ Results show artist, title, year, cover image

---

## 🐛 Troubleshooting

### "Network request failed"
- Check both devices are on same Wi-Fi
- Verify IP address: `192.168.1.215`
- Check backend is running: `curl http://localhost:3000/health`

### "Could not identify record"
- Check backend logs for errors
- Verify Google Vision credentials
- Verify Discogs token is set
- Try a well-known album (e.g., "The Beatles - Abbey Road")

### QR Code not showing
- Run: `npx expo start --clear`
- Make sure port 8081 is not blocked
- Check firewall settings

---

## ✅ Ready to Test!

Everything is configured and ready. Just run the Expo command and scan the QR code!

