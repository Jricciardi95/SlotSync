# Hybrid Backend Setup Guide

This guide will help you set up the **Hybrid Backend** that combines:
1. **Google Vision API** - OCR text extraction
2. **Discogs API** - Comprehensive vinyl database
3. **Local SQLite Database** - Fast caching of identified records

## 🎯 Why Hybrid?

- **Fast**: Local DB cache for instant results on previously identified records
- **Comprehensive**: Discogs has 10M+ vinyl releases
- **Accurate**: Google Vision OCR reads text from covers
- **Resilient**: Multiple fallbacks ensure high success rate

## 📋 Prerequisites

1. Node.js installed
2. Google Cloud account (for Vision API)
3. Discogs account (free, for API access)

---

## Step 1: Install Dependencies

```bash
cd backend-example
npm install
```

This installs:
- `@google-cloud/vision` - Google Vision API
- `axios` - HTTP client for APIs
- `sqlite3` - Local database
- `express`, `multer`, `cors` - Server framework

---

## Step 2: Set Up Google Vision API

### 2.1 Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project (or select existing)
3. Enable **Cloud Vision API**:
   - Go to **APIs & Services** → **Library**
   - Search "Cloud Vision API"
   - Click **Enable**

### 2.2 Create Service Account

1. Go to **IAM & Admin** → **Service Accounts**
2. Click **Create Service Account**
3. Name: `slotsync-vision`
4. Grant role: **Cloud Vision API User**
5. Click **Create and Continue** → **Done**

### 2.3 Download Credentials

1. Click on the service account you created
2. Go to **Keys** tab
3. Click **Add Key** → **Create new key**
4. Select **JSON** format
5. Download the file

### 2.4 Set Environment Variable

```bash
# Move credentials file to backend-example directory
mv ~/Downloads/your-project-xxxxx.json backend-example/credentials.json

# Set environment variable
export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"
```

Or add to your `.env` file:
```
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json
```

**Note**: Add `credentials.json` to `.gitignore` (already done)

---

## Step 3: Set Up Discogs API

### 3.1 Create Discogs Account

1. Go to [Discogs.com](https://www.discogs.com/)
2. Sign up for a free account (if you don't have one)

### 3.2 Get API Keys

1. Go to [Discogs Settings → Developers](https://www.discogs.com/settings/developers)
2. Click **Generate new token**
3. Name it: `SlotSync`
4. Copy the **Consumer Key** and **Consumer Secret**

### 3.3 Set Environment Variables

```bash
export DISCOGS_API_KEY="your_consumer_key_here"
export DISCOGS_API_SECRET="your_consumer_secret_here"
```

Or add to `.env` file:
```
DISCOGS_API_KEY=your_consumer_key_here
DISCOGS_API_SECRET=your_consumer_secret_here
```

**Note**: Discogs API is free with rate limits:
- 60 requests per minute
- More than enough for personal use

---

## Step 4: Start the Hybrid Server

### Option A: With All Services

```bash
# Set environment variables
export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"
export DISCOGS_API_KEY="your_key"
export DISCOGS_API_SECRET="your_secret"

# Start server
npm run start:hybrid
```

### Option B: With .env File

Create `.env` file in `backend-example/`:
```
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json
DISCOGS_API_KEY=your_key_here
DISCOGS_API_SECRET=your_secret_here
```

Then start:
```bash
npm run start:hybrid
```

### Option C: Minimal (No APIs)

The server will work with just MusicBrainz fallback:
```bash
npm run start:hybrid
```

You'll see warnings, but it will still function.

---

## Step 5: Verify Setup

### 5.1 Check Health

```bash
curl http://localhost:3000/health
```

Should return:
```json
{
  "status": "ok",
  "timestamp": "2024-...",
  "services": {
    "googleVision": "configured",
    "discogs": "configured",
    "localDatabase": "connected"
  }
}
```

### 5.2 Test Identification

```bash
curl -X POST http://localhost:3000/api/identify-record \
  -F "image=@/path/to/album-cover.jpg"
```

---

## 🔄 How It Works

### Identification Flow:

1. **User scans album cover** → Image sent to server
2. **Check Local DB** → Fast lookup for previously identified records
3. **Google Vision OCR** → Extract text from image (artist, title)
4. **Search Discogs** → Find match in comprehensive database
5. **Fallback to MusicBrainz** → If Discogs fails
6. **Store in Local DB** → Cache successful identifications
7. **Return result** → App displays identified record

### Fallback Chain:

```
Local DB → Discogs API → MusicBrainz → Error (manual entry)
   ↓           ↓              ↓
 Fast      Comprehensive   Free
```

---

## 📊 Database

The local database (`identified_records.db`) stores:
- Artist name
- Album title
- Release year
- Cover image URL
- Discogs ID
- Image hash (for duplicate detection)

**Location**: `backend-example/identified_records.db`

**Benefits**:
- Instant results for previously identified records
- Works offline for cached records
- Reduces API calls

---

## 🛠️ Troubleshooting

### Google Vision Not Working

**Error**: `Failed to initialize Google Vision client`

**Fix**:
1. Check `GOOGLE_APPLICATION_CREDENTIALS` is set
2. Verify credentials file path is correct
3. Ensure Vision API is enabled in Google Cloud

### Discogs API Not Working

**Error**: `Discogs API not configured`

**Fix**:
1. Get API keys from Discogs settings
2. Set `DISCOGS_API_KEY` and `DISCOGS_API_SECRET`
3. Server will use MusicBrainz fallback if not configured

### Database Errors

**Error**: `Database error` or `Table creation error`

**Fix**:
1. Check write permissions in `backend-example/` directory
2. Delete `identified_records.db` and restart (will recreate)
3. Ensure `sqlite3` is installed: `npm install sqlite3`

### Port Already in Use

**Error**: `Port 3000 already in use`

**Fix**:
```bash
# Find and kill process
lsof -ti:3000 | xargs kill -9

# Or use different port
PORT=3001 npm run start:hybrid
```

---

## 📈 Performance

- **Local DB lookup**: < 10ms
- **Discogs search**: 500-1000ms
- **MusicBrainz fallback**: 1000-2000ms
- **Google Vision OCR**: 500-1500ms

**Total time**: Usually 1-2 seconds for new records, < 100ms for cached records

---

## 🔒 Security

1. **Never commit credentials**:
   - `credentials.json` is in `.gitignore`
   - Use environment variables

2. **API Keys**:
   - Keep Discogs keys secret
   - Rotate keys if compromised

3. **Database**:
   - Local SQLite file (not exposed)
   - Contains only metadata (no sensitive data)

---

## 🚀 Production Deployment

For production:

1. **Use environment variables** (not files)
2. **Store credentials in secret manager** (AWS Secrets Manager, Google Secret Manager)
3. **Use HTTPS** (required for production)
4. **Set up monitoring** (API usage, errors)
5. **Configure rate limiting** (protect APIs)
6. **Backup database** (regular exports)

---

## 📝 Next Steps

1. ✅ Set up Google Vision
2. ✅ Set up Discogs API
3. ✅ Start hybrid server
4. ✅ Test with real album covers
5. ✅ Monitor local database growth

**Your hybrid backend is ready!** 🎉

The server will automatically:
- Cache successful identifications
- Use fastest available method
- Fallback gracefully if services fail

