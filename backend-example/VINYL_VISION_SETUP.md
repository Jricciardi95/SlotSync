# Vinyl Vision - GPT-4o Album Cover Analysis Setup

Vinyl Vision uses OpenAI's GPT-4o Vision API to provide detailed album metadata analysis beyond basic identification.

## Environment Variables

Add these to your `.env` file or export them before starting the server:

```bash
OPENAI_API_KEY=your-openai-api-key-here
GPT_MODEL=gpt-4o
ENABLE_VINYL_VISION=true
```

**Note:** `ENABLE_VINYL_VISION` defaults to `true` if `OPENAI_API_KEY` is set. Set it to `'false'` to disable.

## What It Does

After successfully identifying an album (Phase 3), Vinyl Vision analyzes the cover image to extract:

- **Album Title** - Confirmed or corrected title
- **Artist** - Confirmed or corrected artist name
- **Release Year** - Year of release
- **Tracklist** - Complete track listing
- **Genre** - Music genre(s)
- **Label** - Record label
- **Confidence** - High | Medium | Low
- **Notes** - Additional metadata or observations

## API Response

When Vinyl Vision is enabled and analysis succeeds, the API response includes:

```json
{
  "success": true,
  "bestMatch": { ... },
  "vinylVision": {
    "albumTitle": "Discovery",
    "artist": "Daft Punk",
    "releaseYear": "2001",
    "tracklist": ["One More Time", "Aerodynamic", ...],
    "genre": "Electronic",
    "label": "Virgin Records",
    "confidence": "High",
    "notes": "..."
  },
  ...
}
```

If Vinyl Vision is disabled or fails, `vinylVision` will be `null`.

## Testing

Use the test script to verify Vinyl Vision is working:

```bash
cd backend-example
export OPENAI_API_KEY='sk-your-key-here'
export ENABLE_VINYL_VISION='true'
export GPT_MODEL='gpt-4o'
node test-vinyl-vision.js /path/to/album/cover.jpg
```

## Integration

Vinyl Vision runs automatically after successful album identification (Phase 3.5). It:

1. Converts the uploaded image buffer to base64
2. Sends it to GPT-4o Vision with optional artist/album context
3. Parses the structured JSON response
4. Includes the metadata in the API response

The analysis is **non-blocking** - if it fails, the main identification still succeeds.

## Cost Considerations

GPT-4o Vision API calls cost money. Each album identification with Vinyl Vision enabled will make one additional API call.

To disable Vinyl Vision:
```bash
export ENABLE_VINYL_VISION='false'
```

## Files

- `backend-example/services/analyzeAlbumCover.js` - Main service
- `backend-example/test-vinyl-vision.js` - Test script
- Integrated into `backend-example/server-hybrid.js` (Phase 3.5)

