# Google Vision Setup - Step by Step

## 🎯 Goal
Set up Google Vision API to enable OCR (reading text from album covers).

**Time**: ~5 minutes  
**Cost**: Free tier (1,000 requests/month)

---

## Step 1: Go to Google Cloud Console

👉 **Open**: https://console.cloud.google.com/

If you're not signed in, sign in with your Google account.

---

## Step 2: Create or Select Project

### Option A: Create New Project
1. Click the project dropdown at the top (next to "Google Cloud")
2. Click **"New Project"**
3. Project name: `slotsync` (or your choice)
4. Click **"Create"**
5. Wait a few seconds for creation

### Option B: Use Existing Project
1. Click the project dropdown
2. Select an existing project

---

## Step 3: Enable Cloud Vision API

1. In the left sidebar, click **"APIs & Services"**
2. Click **"Library"** (or "Enable APIs and Services")
3. In the search box, type: **"Cloud Vision API"**
4. Click on **"Cloud Vision API"** in the results
5. Click the big blue **"Enable"** button
6. Wait a few seconds for activation

✅ You should see "API enabled" message

---

## Step 4: Create Service Account

1. In the left sidebar, click **"IAM & Admin"**
2. Click **"Service Accounts"**
3. Click the **"Create Service Account"** button (top)
4. Fill in:
   - **Service account name**: `slotsync-vision`
   - **Service account ID**: (auto-filled, leave as is)
   - **Description**: `Service account for SlotSync Vision API`
5. Click **"Create and Continue"**

---

## Step 5: Grant Permissions

1. In the "Grant this service account access to project" section:
2. Click **"Select a role"** dropdown
3. Type: **"Cloud Vision"**
4. Select: **"Cloud Vision API User"**
5. Click **"Continue"**
6. Click **"Done"** (skip optional step)

✅ Service account created!

---

## Step 6: Create and Download Key

1. You should now see your service account in the list
2. Click on **"slotsync-vision"** (the one you just created)
3. Click the **"Keys"** tab (at the top)
4. Click **"Add Key"** → **"Create new key"**
5. Select **"JSON"** format
6. Click **"Create"**

📥 **The JSON file will download automatically!**

---

## Step 7: Save Credentials File

### Find the Downloaded File
- **Mac**: Usually in `~/Downloads/`
- Look for a file like: `slotsync-xxxxx-xxxxx.json`

### Move to Backend Directory

Open Terminal and run:

```bash
cd /Users/jamesricciardi/SlotSync/backend-example

# Replace with your actual filename
mv ~/Downloads/slotsync-*.json ./credentials.json
```

**Or manually**:
1. Open Finder
2. Go to Downloads folder
3. Find the JSON file (starts with your project name)
4. Copy it
5. Go to: `/Users/jamesricciardi/SlotSync/backend-example/`
6. Paste and rename to: `credentials.json`

---

## Step 8: Verify Setup

Run this to check:

```bash
cd /Users/jamesricciardi/SlotSync/backend-example
ls -la credentials.json
```

Should show the file exists.

---

## Step 9: Restart Server with Credentials

### Stop Current Server
If the server is running, press `Ctrl+C` in that terminal.

### Start with Credentials

```bash
cd /Users/jamesricciardi/SlotSync/backend-example
export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"
npm run start:hybrid
```

You should see:
```
✅ Google Vision API client initialized
```

---

## Step 10: Test It

### Check Health Endpoint

```bash
curl http://localhost:3000/health
```

Should show:
```json
{
  "status": "ok",
  "services": {
    "googleVision": "configured",
    ...
  }
}
```

---

## ✅ Done!

Google Vision is now set up! The server can:
- Read text from album covers automatically
- Extract artist and title from images
- Work with Discogs API for best results

---

## 🆘 Troubleshooting

### "Failed to initialize Google Vision client"
- Check credentials file exists: `ls credentials.json`
- Check file path is correct
- Verify Vision API is enabled in Google Cloud

### "PERMISSION_DENIED"
- Check service account has "Cloud Vision API User" role
- Verify Vision API is enabled

### File Not Found
- Check you're in the right directory: `pwd`
- Check file name: `ls -la credentials.json`
- Make sure file is named exactly `credentials.json`

---

## 🎉 Next Step

Once Google Vision is working, add **Discogs API** for the best database!

See: `SETUP_ORDER.md`

