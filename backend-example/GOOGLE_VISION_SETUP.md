# Google Vision API Setup Guide

This guide walks you through setting up Google Cloud Vision API for SlotSync record identification.

## Prerequisites

- Google Cloud account
- Node.js installed
- Basic familiarity with command line

## Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Enter project name: `slotsync` (or your preferred name)
4. Click "Create"
5. Wait for project creation (may take a minute)

## Step 2: Enable Vision API

1. In your project, go to **APIs & Services** → **Library**
2. Search for "Cloud Vision API"
3. Click on "Cloud Vision API"
4. Click **Enable**
5. Wait for activation (usually instant)

## Step 3: Create Service Account

1. Go to **IAM & Admin** → **Service Accounts**
2. Click **Create Service Account**
3. Enter details:
   - **Name**: `slotsync-vision-api`
   - **Description**: `Service account for SlotSync Vision API`
4. Click **Create and Continue**
5. Grant role: **Cloud Vision API User**
6. Click **Continue** → **Done**

## Step 4: Create and Download Credentials

1. Click on the service account you just created
2. Go to **Keys** tab
3. Click **Add Key** → **Create new key**
4. Select **JSON** format
5. Click **Create**
6. The JSON file will download automatically
7. **Important**: Save this file securely - it contains your API credentials

## Step 5: Configure Backend Server

### Option A: Environment Variable (Recommended)

1. Move the downloaded JSON file to your backend directory:
   ```bash
   mv ~/Downloads/your-project-xxxxx.json backend-example/credentials.json
   ```

2. Set environment variable:
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"
   ```

3. Or add to your `.env` file:
   ```
   GOOGLE_APPLICATION_CREDENTIALS=./credentials.json
   ```

### Option B: Direct Path in Code

You can also modify `server-google-vision.js` to load credentials directly:

```javascript
const visionClient = new ImageAnnotatorClient({
  keyFilename: './credentials.json'
});
```

## Step 6: Install Dependencies

```bash
cd backend-example
npm install
```

This will install:
- `@google-cloud/vision` - Google Vision API client
- `axios` - For MusicBrainz API calls
- Other dependencies

## Step 7: Start the Server

```bash
npm run start:vision
```

Or for development with auto-reload:

```bash
npm run dev:vision
```

You should see:
```
✅ Google Vision API client initialized
🚀 SlotSync API Server (Google Vision) running on port 3000
```

## Step 8: Test the Setup

### Test with curl:

```bash
curl -X POST http://localhost:3000/api/identify-record \
  -F "image=@/path/to/album-cover.jpg"
```

### Test health endpoint:

```bash
curl http://localhost:3000/health
```

Should return:
```json
{
  "status": "ok",
  "services": {
    "googleVision": "configured"
  }
}
```

## Step 9: Configure Mobile App

Update your SlotSync app to point to this server:

**For iOS Simulator:**
```
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
```

**For Android Emulator:**
```
EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:3000
```

**For Physical Device:**
```
EXPO_PUBLIC_API_BASE_URL=http://YOUR_COMPUTER_IP:3000
```

## Troubleshooting

### "Failed to initialize Google Vision client"

- Check that `GOOGLE_APPLICATION_CREDENTIALS` is set correctly
- Verify the JSON file path is correct
- Ensure the JSON file has valid credentials

### "PERMISSION_DENIED" error

- Verify the service account has "Cloud Vision API User" role
- Check that Vision API is enabled in your project
- Ensure you're using the correct project

### "RESOURCE_EXHAUSTED" error

- Check your Google Cloud billing is enabled
- Verify you haven't exceeded free tier limits
- Check quota limits in Cloud Console

### "Could not extract text from image"

- Ensure the image is clear and readable
- Try with a different album cover
- Check image format (JPEG/PNG supported)

## Pricing

Google Cloud Vision API offers:
- **Free tier**: First 1,000 requests/month
- **Paid tier**: $1.50 per 1,000 requests after free tier

See [Google Cloud Vision Pricing](https://cloud.google.com/vision/pricing) for details.

## Security Best Practices

1. **Never commit credentials.json to git**
   - Add to `.gitignore`
   - Use environment variables in production

2. **Use least privilege**
   - Service account only needs "Cloud Vision API User" role

3. **Rotate credentials regularly**
   - Create new keys periodically
   - Delete old keys

4. **Monitor usage**
   - Set up billing alerts
   - Monitor API usage in Cloud Console

## Production Deployment

For production:

1. Deploy server to cloud (Heroku, AWS, GCP, etc.)
2. Store credentials securely (environment variables, secret manager)
3. Use HTTPS
4. Set up monitoring and logging
5. Configure rate limiting
6. Set up billing alerts

## Next Steps

- Test with real album covers
- Fine-tune text parsing logic if needed
- Consider adding caching for repeated requests
- Set up monitoring and alerts

## Support

- [Google Cloud Vision Documentation](https://cloud.google.com/vision/docs)
- [MusicBrainz API Documentation](https://musicbrainz.org/doc/MusicBrainz_API)
- [SlotSync Backend API Docs](../BACKEND_API.md)

