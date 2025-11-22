# Recommended Setup Order

## ✅ Step 1: Minimal Setup (DONE!)
- Server is running
- Works with MusicBrainz fallback
- Can test the app flow

**Status**: ✅ Server running on port 3000

---

## 🎯 Step 2: Add Google Vision (Next - 5 minutes)

**Why first?** Google Vision enables OCR - it reads text from album covers automatically. Without it, you'd need to manually type artist/title.

### Quick Setup:

1. **Go to Google Cloud Console**
   - https://console.cloud.google.com/
   - Create/select project
   - Enable "Cloud Vision API"

2. **Create Service Account**
   - IAM & Admin → Service Accounts
   - Create → Name: `slotsync-vision`
   - Role: Cloud Vision API User
   - Create key → JSON format

3. **Save Credentials**
   ```bash
   # Move downloaded file to backend-example
   mv ~/Downloads/your-project-*.json backend-example/credentials.json
   ```

4. **Restart Server**
   ```bash
   # Stop current server (Ctrl+C)
   export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"
   npm run start:hybrid
   ```

**Result**: Server can now read text from album covers automatically!

---

## 🎯 Step 3: Add Discogs API (After Google Vision - 2 minutes)

**Why second?** Discogs has the best database (10M+ records), but needs artist/title to search. Google Vision provides that text.

### Quick Setup:

1. **Get Discogs API Keys**
   - Go to: https://www.discogs.com/settings/developers
   - Generate new token
   - Copy Consumer Key and Secret

2. **Restart Server with Keys**
   ```bash
   # Stop server (Ctrl+C)
   export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"
   export DISCOGS_API_KEY="your_key_here"
   export DISCOGS_API_SECRET="your_secret_here"
   npm run start:hybrid
   ```

**Result**: Full hybrid system with best accuracy!

---

## 📊 Why This Order?

1. **Minimal** → Get it working (you're here!)
2. **Google Vision** → Enables automatic text extraction from images
3. **Discogs** → Uses extracted text to search best database

**Flow**:
```
Image → Google Vision (extract text) → Discogs (search) → Result
```

Without Google Vision first, Discogs would need manual text entry.

---

## 🚀 Current Status

- ✅ Server running
- ✅ Local database connected
- ⚠️ Google Vision: Check if credentials.json exists
- ⏳ Discogs: Not configured yet

**Next**: Set up Google Vision for OCR capability!

