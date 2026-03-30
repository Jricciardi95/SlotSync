# Complete Startup Guide: Backend + Frontend for Expo Go

## Quick Start (2 Terminal Windows)

### Terminal 1: Backend Server

```bash
cd /Users/jamesricciardi/SlotSync
./start-backend-for-expo.sh
```

**Wait for this message:**
```
[Server] 🚀 SlotSync Backend running on port 3000
```

**Keep this terminal open!**

---

### Terminal 2: Frontend (Expo)

```bash
cd /Users/jamesricciardi/SlotSync
npx expo start
```

**Then:**
- Press `i` for iOS simulator (if you want)
- Press `a` for Android emulator (if you want)
- **OR scan the QR code with Expo Go app on your phone**

---

## Step-by-Step Instructions

### Step 1: Configure API URL (One-time setup)

Your IP address is: **172.18.66.97**

**Option A: Update app.json** (Recommended)

Edit `app.json` and add this in the `extra` section:

```json
{
  "expo": {
    "extra": {
      "EXPO_PUBLIC_API_BASE_URL": "http://172.18.66.97:3000"
    }
  }
}
```

**Option B: Create .env file**

Create a file `.env` in the project root:

```bash
echo 'EXPO_PUBLIC_API_BASE_URL=http://172.18.66.97:3000' > .env
```

---

### Step 2: Start Backend (Terminal 1)

Open a new terminal window and run:

```bash
cd /Users/jamesricciardi/SlotSync
./start-backend-for-expo.sh
```

**Expected output:**
```
🚀 Starting SlotSync Backend for Expo Go...
✅ Google Vision credentials found
✅ Discogs API token found (from environment)
✅ Your IP address: 172.18.66.97
📱 Configure Expo Go to use: http://172.18.66.97:3000
🔧 Starting server on port 3000...
✅ Database tables ready
✅ Vector index initialized with X embeddings
[Server] 🚀 SlotSync Backend running on port 3000
```

**✅ Keep this terminal open!** The server must stay running.

---

### Step 3: Start Frontend (Terminal 2)

Open a **NEW** terminal window and run:

```bash
cd /Users/jamesricciardi/SlotSync
npx expo start
```

**Expected output:**
```
› Metro waiting on exp://192.168.x.x:8081
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)
```

**Options:**
- **For Expo Go on phone**: Scan the QR code with your phone's camera (iOS) or Expo Go app (Android)
- **For iOS Simulator**: Press `i`
- **For Android Emulator**: Press `a`

---

### Step 4: Connect on Your Phone

1. **Make sure your phone and computer are on the same Wi-Fi network**
2. **Open Expo Go app** on your phone
3. **Scan the QR code** from Terminal 2
4. The app should load and connect to the backend

---

## Troubleshooting

### "Cannot connect to server"
- ✅ Check backend is running (Terminal 1 should show "Server running on port 3000")
- ✅ Check both devices are on same Wi-Fi
- ✅ Verify IP address: `ipconfig getifaddr en0` (should be 172.18.66.97)
- ✅ Check firewall allows port 3000

### "API BASE URL NOT CONFIGURED"
- ✅ Make sure you updated `app.json` or created `.env` file
- ✅ Restart Expo: Stop (Ctrl+C) and run `npx expo start --clear`

### "Port 3000 already in use"
```bash
kill -9 $(lsof -ti:3000)
# Then restart backend
```

### Backend won't start
```bash
cd /Users/jamesricciardi/SlotSync/backend-example
npm install
npm start
```

---

## Quick Reference Commands

### Backend
```bash
# Start backend
cd /Users/jamesricciardi/SlotSync
./start-backend-for-expo.sh

# Or manually
cd /Users/jamesricciardi/SlotSync/backend-example
npm start

# Kill backend if needed
kill -9 $(lsof -ti:3000)
```

### Frontend
```bash
# Start Expo
cd /Users/jamesricciardi/SlotSync
npx expo start

# Start with cache clear
npx expo start --clear

# Start on specific port
npx expo start --port 8081
```

### Test Backend
```bash
# Test if backend is running
curl http://localhost:3000/api/ping

# Should return: {"status":"ok",...}
```

---

## Complete Example Session

**Terminal 1 (Backend):**
```bash
jamesricciardi@Jamess-MacBook-Air ~ % cd /Users/jamesricciardi/SlotSync
jamesricciardi@Jamess-MacBook-Air SlotSync % ./start-backend-for-expo.sh
🚀 Starting SlotSync Backend for Expo Go...
✅ Google Vision credentials found
✅ Discogs API token found (from environment)
✅ Your IP address: 172.18.66.97
🔧 Starting server on port 3000...
[Server] 🚀 SlotSync Backend running on port 3000
```

**Terminal 2 (Frontend):**
```bash
jamesricciardi@Jamess-MacBook-Air ~ % cd /Users/jamesricciardi/SlotSync
jamesricciardi@Jamess-MacBook-Air SlotSync % npx expo start
› Metro waiting on exp://172.18.66.97:8081
› Scan the QR code above with Expo Go
```

**On Your Phone:**
1. Open Expo Go app
2. Scan QR code
3. App loads and connects to backend at `http://172.18.66.97:3000`

---

## What You Should See

### Backend Terminal (Terminal 1)
- Server running on port 3000
- Logs when requests come in:
  ```
  [API] 📸 Image received: ...
  [Phase1] 🎨 Computing image embedding...
  [Phase2] 📊 Scoring X Discogs releases...
  ```

### Frontend Terminal (Terminal 2)
- Metro bundler running
- QR code displayed
- Connection status

### Expo Go App
- SlotSync app loads
- Can scan album covers
- Sends requests to backend
- Shows identification results

---

## Stopping Everything

**To stop backend:**
- In Terminal 1, press `Ctrl+C`

**To stop frontend:**
- In Terminal 2, press `Ctrl+C`

---

## Next Steps

Once both are running:
1. ✅ Backend is serving API at `http://172.18.66.97:3000`
2. ✅ Frontend is bundled and ready in Expo Go
3. ✅ Try scanning an album cover in the app!
4. ✅ Watch Terminal 1 for backend processing logs

