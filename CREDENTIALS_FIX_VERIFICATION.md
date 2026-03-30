# Google Vision Credentials Fix - Verification Guide

## Changes Made

### 1. Dotenv Loading (FIRST)
- Added `dotenv.config()` at the very top, before any imports
- Loads from `backend-example/.env` first, falls back to repo root `.env`
- Must happen before `@google-cloud/vision` import

### 2. Auto-Configure GOOGLE_APPLICATION_CREDENTIALS
- Checks for credentials in order:
  1. `backend-example/credentials.json`
  2. `backend-example/credentials/credentials.json`
  3. `repo root/credentials.json`
- Sets `process.env.GOOGLE_APPLICATION_CREDENTIALS` to absolute path
- Validates file exists and is readable

### 3. Lazy Vision Client Initialization
- Vision client now initialized via `getVisionClient()` function
- Only created when actually needed (not at import time)
- Ensures env vars are set before client creation

### 4. Discogs Token Logging
- Logs token presence (length + first 4 chars only)
- Never logs full token
- Accepts `DISCOGS_PERSONAL_ACCESS_TOKEN` or `DISCOGS_TOKEN`

### 5. Debug Endpoint
- `GET /api/debug/env` (dev mode only)
- Returns JSON with:
  - `googleCreds`: { present, path, readable, fileExists }
  - `discogsToken`: { present, len, prefix }
  - `apiBase`: { listeningPort, host }

### 6. Google Vision Self-Test
- Runs on startup in dev mode only
- Tests with a simple image
- Logs success or error (doesn't crash server)

### 7. Updated Shell Script
- `start-backend-for-expo.sh` now sets absolute path for credentials
- Prints the path being used

## How to Verify

### Step 1: Start Backend Server

```bash
cd /Users/jamesricciardi/SlotSync/backend-example
node server-hybrid.js
```

**Expected logs:**
```
[Config] ✅ Loaded .env from backend-example/.env (or repo root)
[Config] ✅ Auto-configured GOOGLE_APPLICATION_CREDENTIALS: /path/to/credentials.json
[Config] ✅ Discogs token present (len: XX, prefix: XXXX...)
[Vision] ✅ Google Vision API client initialized
[Vision] 🧪 Running self-test...
[Vision] ✅ Self-test passed: detected X labels
```

### Step 2: Test Health Endpoint

```bash
curl http://192.168.1.60:3000/health
```

**Expected response:**
```json
{
  "status": "ok",
  "timestamp": "..."
}
```

### Step 3: Test Debug Endpoint

```bash
curl http://192.168.1.60:3000/api/debug/env
```

**Expected response:**
```json
{
  "googleCreds": {
    "present": true,
    "path": "/absolute/path/to/credentials.json",
    "readable": true,
    "fileExists": true
  },
  "discogsToken": {
    "present": true,
    "len": 40,
    "prefix": "Dmcf"
  },
  "apiBase": {
    "listeningPort": 3000,
    "host": "192.168.1.60"
  }
}
```

### Step 4: Test Identification

1. Open your SlotSync app on iPhone
2. Navigate to Scan Record screen
3. Capture an album cover
4. Check backend logs - should see:
   ```
   [Vision] ✅ Google Vision API client initialized
   [Google Vision] Performing comprehensive analysis...
   ```

**If you see "Could not load the default credentials":**
- Check that `credentials.json` exists in one of the expected locations
- Verify the debug endpoint shows `googleCreds.readable: true`
- Check that the path in debug endpoint is correct

## Troubleshooting

### Issue: "Could not load the default credentials"

**Check:**
1. Run: `curl http://192.168.1.60:3000/api/debug/env`
2. Verify `googleCreds.fileExists: true` and `googleCreds.readable: true`
3. If false, check file permissions: `ls -la backend-example/credentials.json`
4. Verify path is absolute (not relative)

### Issue: Self-test fails

**Check:**
- Look for error message in logs
- Common causes:
  - Invalid credentials file
  - Network issue (if using URL-based test)
  - Google Cloud project not enabled for Vision API

### Issue: Discogs token not found

**Check:**
1. Verify token in `.env` file or environment
2. Check debug endpoint shows `discogsToken.present: true`
3. Token should be in `DISCOGS_PERSONAL_ACCESS_TOKEN` or `DISCOGS_TOKEN`

## Files Modified

1. `backend-example/server-hybrid.js` - Main server file
2. `start-backend-for-expo.sh` - Startup script

## Key Improvements

✅ Credentials load deterministically regardless of startup method
✅ No more "Could not load default credentials" errors
✅ Clear logging of what's configured
✅ Debug endpoint for troubleshooting
✅ Self-test validates Vision API works
✅ Lazy initialization prevents premature client creation

