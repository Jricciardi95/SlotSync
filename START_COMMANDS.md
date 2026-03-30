# 🚀 SlotSync - Complete Terminal Commands

## Quick Start

### Terminal 1 - Backend Server
```bash
cd /Users/jamesricciardi/SlotSync
./start-backend-for-expo.sh
```

**OR manually:**
```bash
cd /Users/jamesricciardi/SlotSync/backend-example
node server-hybrid.js
```

**Wait for:** `🚀 SlotSync API Server running on port 3000`

---

### Terminal 2 - Frontend (Expo)
```bash
cd /Users/jamesricciardi/SlotSync
npx expo start --clear
```

**Wait for:** `› Metro waiting on exp://...`  
**Then:** Scan QR code with Expo Go app on your phone

---

## Verify Everything is Working

### Test Backend Health
```bash
curl http://192.168.1.215:3000/health
```
**Expected:** `{"status":"ok"}`

### Test Metadata Endpoint
```bash
curl -X POST http://192.168.1.215:3000/api/identify-by-text \
  -H 'Content-Type: application/json' \
  -d '{"artist":"Whitney Houston","title":"Whitney"}'
```
**Expected:** JSON response with `coverImageRemoteUrl`, `tracks`, `year`, `discogsId`

---

## Troubleshooting

### Backend Won't Start
```bash
# Check if port 3000 is in use
lsof -ti:3000

# Kill process on port 3000
kill -9 $(lsof -ti:3000)

# Restart backend
cd /Users/jamesricciardi/SlotSync
./start-backend-for-expo.sh
```

### Frontend Can't Connect to Backend
```bash
# 1. Verify IP address in app.json
cat app.json | grep EXPO_PUBLIC_API_BASE_URL
# Should show: "http://192.168.1.215:3000"

# 2. Check .env file
cat .env | grep EXPO_PUBLIC_API_BASE_URL
# Should show: EXPO_PUBLIC_API_BASE_URL=http://192.168.1.215:3000

# 3. Get your current IP
ifconfig | grep "inet " | grep -v 127.0.0.1

# 4. Update IP if needed (replace YOUR_IP with actual IP)
echo "EXPO_PUBLIC_API_BASE_URL=http://YOUR_IP:3000" > .env

# 5. Restart Expo with cleared cache
npx expo start --clear
```

### CSV Import Not Working
1. **Check Terminal 1 (Backend)** - Look for:
   ```
   [API] 📥 INCOMING REQUEST: /api/identify-by-text
   ```

2. **Check Terminal 2 (Expo)** - Look for:
   ```
   [CSV Import] 🎬 handleImport() CALLED
   [CSV Import] 🚀 ALWAYS fetching metadata BEFORE saving record...
   [CSV Import] 📡 Response received in XXXms: 200 OK
   [CSV Import] ✅ Set cover art: https://...
   [CSV Import] ✅ Set X tracks
   ```

3. **If logs are missing:**
   - Restart both terminals
   - Try CSV import again
   - Share full logs from both terminals

---

## Full Command Sequence

### First Time Setup
```bash
# Terminal 1 - Backend
cd /Users/jamesricciardi/SlotSync
./start-backend-for-expo.sh

# Terminal 2 - Frontend (in new terminal window)
cd /Users/jamesricciardi/SlotSync
npx expo start --clear
```

### Daily Use
```bash
# Terminal 1
cd /Users/jamesricciardi/SlotSync
./start-backend-for-expo.sh

# Terminal 2
cd /Users/jamesricciardi/SlotSync
npx expo start --clear
```

### Stop Everything
```bash
# Terminal 1: Press Ctrl+C
# Terminal 2: Press Ctrl+C
```

---

## Environment Variables

### Backend (.env in backend-example/)
- `DISCOGS_PERSONAL_ACCESS_TOKEN` - Your Discogs API token
- `GOOGLE_APPLICATION_CREDENTIALS` - Path to Google Vision credentials JSON

### Frontend (.env in root)
- `EXPO_PUBLIC_API_BASE_URL` - Backend server URL (e.g., `http://192.168.1.215:3000`)

---

## IP Address Configuration

Your backend IP is: **192.168.1.215**

Make sure both files have this IP:
- `app.json` → `expo.extra.EXPO_PUBLIC_API_BASE_URL`
- `.env` → `EXPO_PUBLIC_API_BASE_URL`

If your IP changes, update both files and restart Expo with `--clear`.
