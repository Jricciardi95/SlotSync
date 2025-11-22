# Discogs API Authentication Setup

## Two Authentication Methods

Discogs supports two authentication methods:

### Method 1: Personal Access Token (Recommended) ✅
- **Simpler**: Just one token
- **Easier setup**: Generate from account settings
- **Perfect for**: Personal use, collection management apps
- **Rate limit**: 60 requests/minute (free)

### Method 2: OAuth Key/Secret (Legacy)
- **More complex**: Requires key and secret
- **For**: Apps that need user-specific data
- **Rate limit**: 60 requests/minute (free)

---

## Recommended: Personal Access Token

### Step 1: Generate Token

1. Go to: https://www.discogs.com/settings/developers
2. Scroll to **"Personal Access Tokens"** section
3. Click **"Generate new token"**
4. **Token name**: `SlotSync`
5. Click **"Generate token"**
6. **Copy the token** (you'll only see it once!)

### Step 2: Set Environment Variable

```bash
export DISCOGS_PERSONAL_ACCESS_TOKEN="your_token_here"
```

### Step 3: Restart Server

```bash
cd /Users/jamesricciardi/SlotSync/backend-example
export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"
export DISCOGS_PERSONAL_ACCESS_TOKEN="your_token_here"
npm run start:hybrid
```

---

## Alternative: OAuth Key/Secret

If you prefer the key/secret method:

1. Go to: https://www.discogs.com/settings/developers
2. Generate Consumer Key and Secret
3. Set environment variables:
   ```bash
   export DISCOGS_API_KEY="your_consumer_key"
   export DISCOGS_API_SECRET="your_consumer_secret"
   ```

---

## Which Method to Use?

**Use Personal Access Token** if:
- ✅ Personal use
- ✅ Managing your own collection
- ✅ Simple setup preferred

**Use OAuth Key/Secret** if:
- Building a public app
- Need user-specific data
- Already have keys set up

---

## Verification

After setting up, check:

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

## Documentation

- Official Docs: https://www.discogs.com/developers/#page:authentication
- API Terms: https://support.discogs.com/hc/en-us/articles/360009334593-API-Terms-of-Use

---

## Ready?

1. Go to: https://www.discogs.com/settings/developers
2. Generate Personal Access Token (recommended)
3. Copy the token
4. Tell me when you have it, and I'll help you set it up!

