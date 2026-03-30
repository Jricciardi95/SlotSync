# Quick Start: Backend Server for Expo Go

## Step 1: Navigate to Backend Directory

```bash
cd /Users/jamesricciardi/SlotSync/backend-example
```

## Step 2: Install Dependencies (if not already installed)

```bash
npm install
```

## Step 3: Set Up Environment Variables

### Option A: Using Export Commands (Temporary - for this session)

```bash
# Google Vision API (if you have credentials.json)
export GOOGLE_APPLICATION_CREDENTIALS="/Users/jamesricciardi/SlotSync/backend-example/credentials.json"

# Discogs API (optional but recommended)
export DISCOGS_PERSONAL_ACCESS_TOKEN="your_discogs_token_here"
# OR use API key + secret:
export DISCOGS_API_KEY="your_api_key"
export DISCOGS_API_SECRET="your_api_secret"

# Optional: Embedding configuration
export EMBEDDING_K=5
export EMBEDDING_MIN_SIMILARITY=0.65

# Optional: Debug logging
export DEBUG_EMBEDDINGS=true
export DEBUG_SCORING=true
```

### Option B: Create a `.env` file (Recommended)

Create a file `backend-example/.env`:

```bash
# Google Vision
GOOGLE_APPLICATION_CREDENTIALS=/Users/jamesricciardi/SlotSync/backend-example/credentials.json

# Discogs API
DISCOGS_PERSONAL_ACCESS_TOKEN=your_discogs_token_here
# OR
DISCOGS_API_KEY=your_api_key
DISCOGS_API_SECRET=your_api_secret

# Optional: Embedding config
EMBEDDING_K=5
EMBEDDING_MIN_SIMILARITY=0.65

# Optional: Debug
DEBUG_EMBEDDINGS=true
DEBUG_SCORING=true
```

**Note**: If you don't have Google Vision or Discogs set up, the server will still work but with limited functionality (will use MusicBrainz fallback).

## Step 4: Start the Backend Server

```bash
npm start
```

Or use the hybrid server directly:

```bash
npm run start:hybrid
```

You should see output like:
```
✅ Google Vision API client initialized
✅ Database tables ready
✅ Vector index initialized with X embeddings
[Server] 🚀 SlotSync Backend running on port 3000
```

## Step 5: Find Your Computer's IP Address

### On macOS/Linux:
```bash
ifconfig | grep "inet " | grep -v 127.0.0.1
```

Or more simply:
```bash
ipconfig getifaddr en0
```

### On Windows:
```bash
ipconfig
```
Look for "IPv4 Address" under your active network adapter.

**Example IP**: `192.168.1.100`

## Step 6: Configure Expo Go to Connect

### Option A: Update Frontend Config

Edit `src/config/api.ts` and set:

```typescript
export const API_BASE_URL = __DEV__ 
  ? 'http://YOUR_COMPUTER_IP:3000'  // Replace with your IP
  : 'https://your-production-url.com';
```

**Example**:
```typescript
export const API_BASE_URL = __DEV__ 
  ? 'http://192.168.1.100:3000'
  : 'https://your-production-url.com';
```

### Option B: Use Environment Variable

Create or update `.env` in the project root:

```bash
EXPO_PUBLIC_API_BASE_URL=http://YOUR_COMPUTER_IP:3000
```

**Example**:
```bash
EXPO_PUBLIC_API_BASE_URL=http://192.168.1.100:3000
```

## Step 7: Make Sure Both Devices Are on Same Network

- Your computer and phone must be on the **same Wi-Fi network**
- Firewall may block connections - you may need to allow port 3000

### macOS Firewall:
```bash
# Allow incoming connections on port 3000
sudo /usr/libexec/ApplicationFirewall/socketfilterfw --add /usr/local/bin/node
```

Or go to: **System Settings → Network → Firewall → Options** and allow Node.js

## Step 8: Test the Connection

### From Terminal (on your computer):
```bash
curl http://localhost:3000/api/ping
```

Should return:
```json
{"status":"ok","timestamp":"...","server":"SlotSync API"}
```

### From Your Phone (in Expo Go):
- Open the SlotSync app
- Try scanning an album cover
- Check the backend terminal for logs

## Troubleshooting

### "Cannot connect to server"
1. **Check IP address** - Make sure you're using the correct IP
2. **Check network** - Both devices must be on same Wi-Fi
3. **Check firewall** - Allow port 3000
4. **Check server is running** - Look for "Server running on port 3000" in terminal

### "Google Vision not configured"
- This is OK! The server will use MusicBrainz fallback
- To enable: Set up `credentials.json` (see GOOGLE_VISION_SETUP.md)

### "Discogs API not configured"
- This is OK! The server will use MusicBrainz fallback
- To enable: Get Discogs token from https://www.discogs.com/settings/developers

### Port Already in Use
```bash
# Find process using port 3000
lsof -ti:3000

# Kill it
kill -9 $(lsof -ti:3000)

# Or use a different port
PORT=3001 npm start
```

Then update frontend to use port 3001.

## Quick Reference Commands

```bash
# Start server
cd /Users/jamesricciardi/SlotSync/backend-example
npm start

# Start with nodemon (auto-restart on changes)
npm run dev:hybrid

# Check if server is running
curl http://localhost:3000/api/ping

# View server logs
# (logs appear in the terminal where you ran npm start)
```

## Full Example Session

```bash
# 1. Navigate to backend
cd /Users/jamesricciardi/SlotSync/backend-example

# 2. Set environment variables
export GOOGLE_APPLICATION_CREDENTIALS="/Users/jamesricciardi/SlotSync/backend-example/credentials.json"
export DISCOGS_PERSONAL_ACCESS_TOKEN="your_token_here"

# 3. Get your IP address
ipconfig getifaddr en0
# Output: 192.168.1.100

# 4. Start server
npm start

# 5. In another terminal, update frontend config
# Edit src/config/api.ts to use: http://192.168.1.100:3000

# 6. Start Expo
cd /Users/jamesricciardi/SlotSync
npx expo start
```

## Server Endpoints

Once running, the server provides:

- `POST /api/identify-record` - Main identification endpoint
- `GET /api/ping` - Health check
- `GET /api/health` - Detailed health status
- `GET /api` - API information

The server runs on **port 3000** by default (configurable via `PORT` env var).

