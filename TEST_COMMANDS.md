# Test Commands for Expo Go

## You Need TWO Terminal Windows

### Terminal 1 - Backend Server

Run these commands:

```bash
cd /Users/jamesricciardi/SlotSync/backend-example
export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"
export DISCOGS_PERSONAL_ACCESS_TOKEN="gOQSOxYBRENZutcnwOQnAaYMxmePxboOxBfyAeHK"
export ENABLE_GOOGLE_VISION=true
node server-hybrid.js
```

**Keep this terminal open!** You should see:
```
✅ Google Vision API client initialized
✅ Connected to local database
🚀 SlotSync API Server (Hybrid) running on port 3000
✅ Ready to identify records!
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

## Quick Copy-Paste (One Line Each)

### Terminal 1 (Backend):
```bash
cd /Users/jamesricciardi/SlotSync/backend-example && export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json" && export DISCOGS_PERSONAL_ACCESS_TOKEN="gOQSOxYBRENZutcnwOQnAaYMxmePxboOxBfyAeHK" && export ENABLE_GOOGLE_VISION=true && node server-hybrid.js
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

- **iPhone**: Camera app → Point at QR code → Tap notification
- **Android**: Expo Go app → Scan QR code button

---

## Important Notes

1. **API URL**: The app is configured to use `http://192.168.1.215:3000` for physical devices
2. **Both terminals must stay open** while testing
3. **Backend must start first** before scanning QR code

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

### Backend Not Starting?
- Check that `credentials.json` exists in `backend-example/` folder
- Verify Discogs token is correct
- Check Node.js is installed: `node --version`

### Expo Not Starting?
- Make sure you're in the project root directory
- Try: `npm install` first
- Check Expo CLI: `npx expo --version`

