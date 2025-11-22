# Exact Commands to Run

## You Need TWO Terminal Windows

### Terminal 1 - Backend Server

Run these commands one by one:

```bash
cd /Users/jamesricciardi/SlotSync/backend-example
export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"
npm run start:hybrid
```

**Keep this terminal open!** You should see:
```
✅ Google Vision API client initialized
🚀 SlotSync API Server (Hybrid) running on port 3000
```

---

### Terminal 2 - Expo Server (for QR code)

Run these commands:

```bash
cd /Users/jamesricciardi/SlotSync
npx expo start --clear
```

**Keep this terminal open!** You'll see a QR code in this terminal.

---

## Quick Copy-Paste

### Terminal 1 (Backend):
```bash
cd /Users/jamesricciardi/SlotSync/backend-example && export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json" && npm run start:hybrid
```

### Terminal 2 (Expo):
```bash
cd /Users/jamesricciardi/SlotSync && npx expo start --clear
```

---

## Verify It's Working

### Check Backend:
```bash
curl http://localhost:3000/health
```

Should return JSON with `"status": "ok"`

### Check Expo:
Look for QR code in Terminal 2

---

## Scan QR Code

- **iPhone**: Camera app → Point at QR code
- **Android**: Expo Go app → Scan QR code

---

## Troubleshooting

### Port Already in Use?
```bash
# Kill backend (port 3000)
lsof -ti:3000 | xargs kill -9

# Kill Expo (port 8081)
lsof -ti:8081 | xargs kill -9
```

Then run the commands again.

