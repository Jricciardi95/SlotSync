# Discogs API - Quick Setup

## Step 1: Get Your API Keys (2 minutes)

1. **Go to**: https://www.discogs.com/settings/developers
   - Sign in (or create free account if needed)

2. **Generate Token**:
   - Click **"Generate new token"** button
   - **Token name**: `SlotSync`
   - Click **"Generate token"**

3. **Copy Your Keys**:
   - **Consumer Key** (also called "Key")
   - **Consumer Secret** (also called "Secret")
   - **Copy both!** You'll need them in the next step

---

## Step 2: Set Environment Variables

Once you have your keys, I'll help you set them up.

**Tell me when you have your keys ready!**

Or set them yourself:

```bash
export DISCOGS_API_KEY="your_consumer_key_here"
export DISCOGS_API_SECRET="your_consumer_secret_here"
```

---

## Step 3: Restart Server

After setting the environment variables, restart your backend server:

```bash
cd /Users/jamesricciardi/SlotSync/backend-example
export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"
export DISCOGS_API_KEY="your_key"
export DISCOGS_API_SECRET="your_secret"
npm run start:hybrid
```

---

## Step 4: Verify

```bash
curl http://localhost:3000/health
```

Should show `"discogs": "configured"`

---

## Ready?

1. Go to: https://www.discogs.com/settings/developers
2. Generate your token
3. Copy your Consumer Key and Secret
4. **Tell me when you have them** and I'll help you set them up!

