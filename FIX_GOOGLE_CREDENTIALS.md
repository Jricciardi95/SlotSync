# Fix Google Vision Credentials Path

## Issue
The error shows:
```
[Google Vision] Error: The file at /path/to/your/google-credentials.json does not exist
```

## Solution
Your credentials file exists at: `/Users/jamesricciardi/SlotSync/backend-example/credentials.json`

## Quick Fix

**In your backend terminal, run:**

```bash
export GOOGLE_APPLICATION_CREDENTIALS='/Users/jamesricciardi/SlotSync/backend-example/credentials.json'
```

Then restart your backend:
```bash
npm start
```

## Updated Commands

**Terminal 1 - Backend:**
```bash
cd /Users/jamesricciardi/SlotSync/backend-example
export DISCOGS_PERSONAL_ACCESS_TOKEN='gOQSOxYBRENZutcnwOQnAaYMxmePxboOxBfyAeHK'
export GOOGLE_APPLICATION_CREDENTIALS='/Users/jamesricciardi/SlotSync/backend-example/credentials.json'
export CONFIDENCE_THRESHOLD='0.5'
npm start
```

## Verify It Works

After restarting, you should see:
```
✅ Google Vision API client initialized
```

Instead of the error message.
