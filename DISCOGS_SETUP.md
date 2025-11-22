# Discogs API Setup - Step by Step

## 🎯 Goal
Set up Discogs API for comprehensive vinyl record database (10M+ releases).

**Time**: ~2 minutes  
**Cost**: Free (60 requests/minute)

---

## Step 1: Go to Discogs Settings

👉 **Open**: https://www.discogs.com/settings/developers

If you're not logged in, sign in with your Discogs account (or create a free account).

---

## Step 2: Generate API Token

1. On the Developers page, you'll see a section called **"Personal Access Tokens"**
2. Click **"Generate new token"** button
3. Fill in:
   - **Token name**: `SlotSync` (or your choice)
   - **Description**: `For SlotSync vinyl record identification` (optional)
4. Click **"Generate token"**

---

## Step 3: Copy Your Keys

After generating, you'll see:
- **Consumer Key** (also called "Key")
- **Consumer Secret** (also called "Secret")

**Important**: Copy both of these - you'll need them!

---

## Step 4: Set Environment Variables

### Option A: In Terminal (Temporary)

```bash
export DISCOGS_API_KEY="your_consumer_key_here"
export DISCOGS_API_SECRET="your_consumer_secret_here"
```

### Option B: In .env File (Permanent)

Create/edit `backend-example/.env`:
```
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json
DISCOGS_API_KEY=your_consumer_key_here
DISCOGS_API_SECRET=your_consumer_secret_here
```

---

## Step 5: Restart Backend Server

Stop the current server (Ctrl+C in Terminal 1), then:

```bash
cd /Users/jamesricciardi/SlotSync/backend-example
export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"
export DISCOGS_API_KEY="your_key_here"
export DISCOGS_API_SECRET="your_secret_here"
npm run start:hybrid
```

---

## Step 6: Verify Setup

### Check Health Endpoint

```bash
curl http://localhost:3000/health
```

Should show:
```json
{
  "services": {
    "discogs": "configured"
  }
}
```

---

## ✅ Done!

Discogs API is now set up! The server will now:
- Use Google Vision to extract text
- Search Discogs (10M+ records) for best matches
- Fallback to MusicBrainz if Discogs fails
- Store successful identifications in local DB

---

## 🆘 Troubleshooting

### "Discogs API not configured"
- Check environment variables are set: `echo $DISCOGS_API_KEY`
- Make sure you restarted the server after setting variables

### "Invalid API key"
- Check you copied the full key (no spaces)
- Verify key and secret are correct
- Make sure you're using Consumer Key/Secret, not a different token type

### Rate Limits
- Free tier: 60 requests/minute
- More than enough for personal use
- If exceeded, wait 1 minute and try again

---

## 🎉 Benefits

With Discogs API:
- **10M+ vinyl releases** in database
- **Better metadata** (year, label, format)
- **High-quality cover art**
- **More accurate matches**

Your hybrid system is now complete! 🚀

