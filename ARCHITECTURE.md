# SlotSync Architecture

## API Call Flow

```
┌─────────────────┐
│  React Native   │
│      App        │
└────────┬────────┘
         │
         │ POST /api/identify-record
         │ (image, barcode, or text)
         │
         ▼
┌─────────────────┐
│   Backend API   │  ← All external API calls happen here
│  (server-hybrid)│
└────────┬────────┘
         │
         ├──► Google Vision API (if enabled)
         │    - Image identification
         │    - OCR text extraction
         │
         ├──► Discogs API
         │    - Barcode lookup
         │    - Artist/title search
         │    - Release metadata
         │
         └──► Local SQLite Database
              - Cache identified records
              - Fast lookups
```

## Security & Architecture Benefits

### ✅ **App Never Calls External APIs Directly**

- **React Native App** (`src/services/RecordIdentificationService.ts`):
  - Only calls: `POST /api/identify-record`
  - Sends: Image file, barcode, or text
  - Receives: `{ bestMatch, alternates, confidence }`
  - **No API keys in app code**

### ✅ **Backend Handles All External Calls**

- **Backend** (`backend-example/server-hybrid.js`):
  - Makes all calls to Google Vision API
  - Makes all calls to Discogs API
  - Stores API keys/tokens as environment variables
  - Manages rate limiting, caching, error handling
  - Returns unified response format

## Environment Variables (Backend Only)

All sensitive credentials are stored server-side:

```bash
# Google Vision
GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"

# Discogs
DISCOGS_PERSONAL_ACCESS_TOKEN="your-token-here"
# OR
DISCOGS_API_KEY="your-key"
DISCOGS_API_SECRET="your-secret"

# Feature flags
ENABLE_GOOGLE_VISION=true
```

## API Endpoints

### App → Backend
- `POST /api/identify-record` - Single endpoint for all identification

### Backend → External APIs
- Google Vision API (if enabled)
- Discogs API
- Local SQLite Database

## Benefits

1. **Security**: API keys never exposed to client
2. **Abstraction**: App doesn't need to know about external APIs
3. **Flexibility**: Can swap APIs without app changes
4. **Caching**: Backend can cache results efficiently
5. **Rate Limiting**: Backend can manage API quotas
6. **Error Handling**: Centralized error handling and retries

