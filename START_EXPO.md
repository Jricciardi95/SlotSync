# How to Get QR Code for Expo Go

## Quick Command

Run this in your terminal:

```bash
cd /Users/jamesricciardi/SlotSync && npx expo start --clear
```

This will:
1. Start the Expo development server
2. Display a QR code in your terminal
3. Show connection options

## What You'll See

You should see something like:

```
› Metro waiting on exp://192.168.1.100:8081
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)

┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   ████████████████████████████████████████████████████████████████████   │
│   ████████████████████████████████████████████████████████████████████   │
│   ████████████████████████████████████████████████████████████████████   │
│   ... (QR code pattern) ...                                             │
│   ████████████████████████████████████████████████████████████████████   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘

› Press a │ open Android
› Press i │ open iOS simulator
› Press w │ open web

› Press r │ reload app
› Press m │ toggle menu
› Press ? │ show all commands
```

## How to Scan

### On iPhone:
1. Open the **Camera app**
2. Point it at the QR code in your terminal
3. Tap the notification that appears
4. It will open in Expo Go

### On Android:
1. Open the **Expo Go app**
2. Tap "Scan QR code"
3. Point it at the QR code in your terminal

## If QR Code Doesn't Show

### Option 1: Check Terminal Output
Make sure you're looking at the terminal where you ran `npx expo start`

### Option 2: Restart Expo
```bash
# Stop any running Expo server
lsof -ti:8081 | xargs kill -9

# Start fresh
cd /Users/jamesricciardi/SlotSync && npx expo start --clear
```

### Option 3: Use Connection URL
If you see a URL like `exp://192.168.1.100:8081`, you can:
- Open Expo Go app
- Tap "Enter URL manually"
- Paste the URL

## Important: Keep Both Servers Running

You need **TWO terminal windows**:

1. **Terminal 1 - Backend Server:**
   ```bash
   cd /Users/jamesricciardi/SlotSync/backend-example && node server.js
   ```

2. **Terminal 2 - Expo Server:**
   ```bash
   cd /Users/jamesricciardi/SlotSync && npx expo start --clear
   ```

Keep both running while testing the app!

