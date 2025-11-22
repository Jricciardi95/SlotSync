# Start Expo with QR Code

## Quick Command

Run this in your terminal:

```bash
cd /Users/jamesricciardi/SlotSync && npx expo start --clear
```

This will:
- Start the Expo development server
- Display a QR code in your terminal
- Show connection options

---

## What You'll See

You should see something like:

```
› Metro waiting on exp://192.168.1.100:8081
› Scan the QR code above with Expo Go (Android) or the Camera app (iOS)

┌─────────────────────────────────────────────────────────────────────────┐
│                                                                         │
│   ████████████████████████████████████████████████████████████████████   │
│   ████████████████████████████████████████████████████████████████████   │
│   ... (QR code pattern) ...                                             │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## How to Scan

### iPhone:
1. Open the **Camera app**
2. Point it at the QR code in your terminal
3. Tap the notification that appears
4. Opens in Expo Go

### Android:
1. Open the **Expo Go app**
2. Tap "Scan QR code"
3. Point at the QR code in your terminal

---

## Important: Keep Both Servers Running

You need **TWO terminal windows**:

### Terminal 1 - Backend Server (for record identification)
```bash
cd /Users/jamesricciardi/SlotSync/backend-example
export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"
npm run start:hybrid
```

### Terminal 2 - Expo Server (for QR code)
```bash
cd /Users/jamesricciardi/SlotSync
npx expo start --clear
```

**Keep both running while using the app!**

---

## If QR Code Doesn't Show

1. Make sure you're looking at the terminal where you ran `npx expo start`
2. Try pressing `r` to reload
3. Check for any error messages
4. Make sure port 8081 is not in use

---

## Troubleshooting

### Port Already in Use
```bash
lsof -ti:8081 | xargs kill -9
npx expo start --clear
```

### Can't Connect
- Make sure your phone and computer are on the same WiFi
- For physical device, you may need to use your computer's IP address

---

## Ready to Test!

Once you scan the QR code:
1. App opens in Expo Go
2. Try scanning an album cover
3. Backend server will identify it using Google Vision!

