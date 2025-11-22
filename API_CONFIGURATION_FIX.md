# API Configuration Fix

## Problem
The app was trying to connect to `localhost:3000`, which doesn't work on physical devices. Physical devices need your computer's IP address.

## Solution
Updated `app.json` to use your computer's IP address: `192.168.1.215`

## What Changed
- Added `EXPO_PUBLIC_API_BASE_URL` to `app.json`
- Set to: `http://192.168.1.215:3000`

## Next Steps
1. **Reload the app** in Expo Go:
   - Shake device → Reload
   - Or press `r` in Expo terminal

2. **Try scanning again** - it should now connect to the backend server

## If IP Changes
If your computer's IP address changes, update it in `app.json`:
```json
"extra": {
  "EXPO_PUBLIC_API_BASE_URL": "http://YOUR_NEW_IP:3000"
}
```

## Verify Connection
The app should now be able to:
- Connect to backend server
- Send images for identification
- Get results from Google Vision + MusicBrainz

