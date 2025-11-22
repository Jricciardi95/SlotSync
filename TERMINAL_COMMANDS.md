# Terminal Commands for SlotSync

## Quick Start - Backend Server

### 1. Navigate to Backend Directory
```bash
cd /Users/jamesricciardi/SlotSync/backend-example
```

### 2. Check if Server is Already Running
```bash
lsof -ti:3000
```
If this returns a number, the server is running. If it returns nothing, the server is not running.

### 3. Stop Existing Server (if needed)
```bash
lsof -ti:3000 | xargs kill -9
```

### 4. Start the Backend Server
```bash
node server.js
```

You should see:
```
🚀 SlotSync API Server running on port 3000
📍 Health check: http://localhost:3000/health
📍 API info: http://localhost:3000/api
📍 Identify endpoint: http://localhost:3000/api/identify-record
```

**Keep this terminal window open** - the server needs to keep running.

---

## Test the Server

### Test 1: Health Check
Open a **new terminal window** and run:
```bash
curl http://localhost:3000/health
```

Should return: `{"status":"ok","timestamp":"..."}`

### Test 2: Verify Variation (Optional)
```bash
cd /Users/jamesricciardi/SlotSync/backend-example
node test-variation.js
```

Should show 5 different albums.

---

## For Your Mobile App

### If Using Physical Device:
1. Find your computer's IP address:
   ```bash
   ifconfig | grep "inet " | grep -v 127.0.0.1
   ```
   Look for something like `192.168.1.100` or `10.0.0.5`

2. Update your app's API URL to: `http://YOUR_IP:3000`
   - Or set in `.env` file: `EXPO_PUBLIC_API_BASE_URL=http://YOUR_IP:3000`

### If Using Simulator/Emulator:
- iOS Simulator: `http://localhost:3000` (default)
- Android Emulator: `http://10.0.2.2:3000`

---

## All-in-One Command (Restart Server)

If you want to restart the server in one command:
```bash
cd /Users/jamesricciardi/SlotSync/backend-example && lsof -ti:3000 | xargs kill -9 2>/dev/null; sleep 1; node server.js
```

---

## Troubleshooting

### Port Already in Use
```bash
# Find what's using port 3000
lsof -i:3000

# Kill it
kill -9 <PID>
```

### Server Not Responding
1. Make sure you're in the right directory: `cd /Users/jamesricciardi/SlotSync/backend-example`
2. Check Node.js is installed: `node --version`
3. Install dependencies if needed: `npm install`

### Check Server Logs
Look at the terminal where `node server.js` is running. You should see logs like:
```
[API] Received image: ...
[API] Request #1 - Image hash calculation: ...
[API] Selected record: The Beatles - Abbey Road
```

