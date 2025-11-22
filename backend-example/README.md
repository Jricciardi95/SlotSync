# SlotSync Backend Example

This directory contains backend server implementations for SlotSync record identification.

## Available Servers

### 1. Mock Server (`server.js`)
Simple mock server for development and testing. Returns sample data without actual image recognition.

**Quick Start:**
```bash
npm install
npm start
```

### 2. Google Vision Server (`server-google-vision.js`) ⭐ **Recommended for Production**
Production-ready server with Google Cloud Vision API integration for OCR and MusicBrainz for metadata.

**Quick Start:**
1. Follow [GOOGLE_VISION_SETUP.md](./GOOGLE_VISION_SETUP.md) to set up Google Cloud credentials
2. Install dependencies:
```bash
npm install
```
3. Set credentials:
```bash
export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"
```
4. Start server:
```bash
npm run start:vision
```

## Quick Start (Mock Server)

1. Install dependencies:
```bash
npm install
```

2. Start the mock server:
```bash
npm start
```

The server will run on `http://localhost:3000`

## Configuration

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

## Endpoints

### POST /api/identify-record

Upload an album cover image to identify the record.

**Request:**
- Content-Type: `multipart/form-data`
- Field: `image` (JPEG/PNG file)

**Response:**
```json
{
  "confidence": 0.85,
  "bestMatch": {
    "artist": "David Bowie",
    "title": "Heroes",
    "year": 1977,
    "coverImageRemoteUrl": "https://..."
  },
  "alternates": [...]
}
```

### GET /health

Health check endpoint.

### GET /api

API information endpoint.

## Testing

### Using the Test Script

```bash
node test-api.js /path/to/album-cover.jpg
```

### Using curl

```bash
curl -X POST http://localhost:3000/api/identify-record \
  -F "image=@/path/to/album-cover.jpg"
```

### Expected Response

```json
{
  "confidence": 0.85,
  "bestMatch": {
    "artist": "David Bowie",
    "title": "Heroes",
    "year": 1977,
    "coverImageRemoteUrl": "https://..."
  },
  "alternates": [...]
}
```

## Production Setup

This is a **MOCK** server that returns sample data. For production:

1. Replace the mock identification logic in `server.js` with actual image recognition
2. Integrate with services like:
   - Google Cloud Vision API
   - AWS Rekognition
   - MusicBrainz API
   - Custom ML model
3. Add authentication/rate limiting
4. Use HTTPS
5. Add proper error handling and logging

See `BACKEND_API.md` in the project root for detailed implementation examples.

