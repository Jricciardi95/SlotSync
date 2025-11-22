# Hybrid Backend Setup Checklist

## ✅ Step 1: Dependencies Installed
- [x] npm install completed

## 📋 Step 2: Google Vision API Setup

### 2.1 Create Google Cloud Project
- [ ] Go to https://console.cloud.google.com/
- [ ] Click "Select a project" → "New Project"
- [ ] Name: `slotsync` (or your choice)
- [ ] Click "Create"

### 2.2 Enable Vision API
- [ ] In your project, go to **APIs & Services** → **Library**
- [ ] Search for "Cloud Vision API"
- [ ] Click **Enable**

### 2.3 Create Service Account
- [ ] Go to **IAM & Admin** → **Service Accounts**
- [ ] Click **Create Service Account**
- [ ] Name: `slotsync-vision`
- [ ] Grant role: **Cloud Vision API User**
- [ ] Click **Create and Continue** → **Done**

### 2.4 Download Credentials
- [ ] Click on the service account you created
- [ ] Go to **Keys** tab
- [ ] Click **Add Key** → **Create new key**
- [ ] Select **JSON** format
- [ ] Download the file
- [ ] Move to: `backend-example/credentials.json`

### 2.5 Set Environment Variable
```bash
export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"
```

## 📋 Step 3: Discogs API Setup

### 3.1 Create Account (if needed)
- [ ] Go to https://www.discogs.com/
- [ ] Sign up for free account (or log in)

### 3.2 Get API Keys
- [ ] Go to https://www.discogs.com/settings/developers
- [ ] Click **Generate new token**
- [ ] Name: `SlotSync`
- [ ] Copy **Consumer Key**
- [ ] Copy **Consumer Secret**

### 3.3 Set Environment Variables
```bash
export DISCOGS_API_KEY="your_consumer_key_here"
export DISCOGS_API_SECRET="your_consumer_secret_here"
```

## 🚀 Step 4: Start Server

### Option A: With Environment Variables
```bash
export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"
export DISCOGS_API_KEY="your_key"
export DISCOGS_API_SECRET="your_secret"
npm run start:hybrid
```

### Option B: Create .env File
Create `backend-example/.env`:
```
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json
DISCOGS_API_KEY=your_key_here
DISCOGS_API_SECRET=your_secret_here
```

Then start:
```bash
npm run start:hybrid
```

## ✅ Step 5: Verify Setup

### Test Health Endpoint
```bash
curl http://localhost:3000/health
```

Should return:
```json
{
  "status": "ok",
  "services": {
    "googleVision": "configured",
    "discogs": "configured",
    "localDatabase": "connected"
  }
}
```

## 🎉 You're Done!

The hybrid server is now running and ready to identify records!

---

## 💡 Quick Tips

- **Start minimal**: Server works with just MusicBrainz (no APIs needed)
- **Add gradually**: Set up Google Vision first, then Discogs
- **Check logs**: Server will show which services are configured

## 🆘 Need Help?

- See `HYBRID_SETUP.md` for detailed instructions
- See `HYBRID_BACKEND_QUICKSTART.md` for quick reference

