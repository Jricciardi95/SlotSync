# SlotSync Backend API Documentation

This document describes the backend API endpoint required for record identification in SlotSync.

## Endpoint: `/api/identify-record`

### Method
`POST`

### Content Type
Supports multiple input types:
- **Image**: `multipart/form-data` with `image` field
- **Barcode**: `application/json` with `barcode` field (UPC/EAN)
- **Text**: `application/json` with `artist` and/or `title` fields

### Request Body

#### Option 1: Image Upload (multipart/form-data)
- **Field name**: `image`
- **Type**: File (JPEG/PNG image)
- **Description**: Album cover image to identify

#### Option 2: Barcode Lookup (application/json)
```json
{
  "barcode": "0123456789012"
}
```
- **barcode**: UPC/EAN barcode string (cheapest, most reliable method)

#### Option 3: Text Search (application/json)
```json
{
  "artist": "David Bowie",
  "title": "Heroes"
}
```
- **artist**: Artist name (optional)
- **title**: Album title (optional)
- At least one field required

### Identification Flow (Cost/Reliability Optimized)

The endpoint tries methods in order from cheapest/most reliable to most expensive:

1. **Local Database Cache** (free, instant, very reliable)
2. **Barcode Lookup** (free, instant, very reliable if barcode available)
3. **Text Search** (free, fast, reliable)
4. **Discogs API** (free, fast, very reliable)
5. **Google Vision** (costs money, slower, fallback only)

### Response Format

#### Success Response (200 OK)
```json
{
  "confidence": 0.95,
  "bestMatch": {
    "artist": "David Bowie",
    "title": "Heroes",
    "year": 1977,
    "coverImageRemoteUrl": "https://example.com/covers/heroes.jpg"
  },
  "alternates": [
    {
      "artist": "David Bowie",
      "title": "Heroes (Remastered)",
      "year": 1999,
      "coverImageRemoteUrl": "https://example.com/covers/heroes-remastered.jpg"
    },
    {
      "artist": "David Bowie",
      "title": "Heroes (40th Anniversary)",
      "year": 2017,
      "coverImageRemoteUrl": "https://example.com/covers/heroes-40th.jpg"
    }
  ],
  "source": "discogs"
}
```

**Note**: `alternates` array now contains up to 4 alternative matches from Discogs API.

#### Error Response (4xx/5xx)
```json
{
  "error": "Error message description"
}
```

### Field Descriptions

- **confidence**: Float between 0.0 and 1.0 indicating match confidence
- **bestMatch**: The most likely match for the album
  - **artist**: Artist name (required)
  - **title**: Album title (required)
  - **year**: Release year (optional)
  - **coverImageRemoteUrl**: URL to album cover image (optional)
- **alternates**: Array of alternative matches (optional, can be empty array)

## Example Backend Implementation

### Node.js/Express Example

```javascript
const express = require('express');
const multer = require('multer');
const axios = require('axios'); // For MusicBrainz API calls
const FormData = require('form-data');

const app = express();
const upload = multer({ storage: multer.memoryStorage() });

// MusicBrainz API endpoint (or your preferred identification service)
const MUSICBRAINZ_API = 'https://musicbrainz.org/ws/2/';

app.post('/api/identify-record', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    // Here you would:
    // 1. Process the image (resize, normalize, etc.)
    // 2. Use image recognition API (e.g., Google Vision, AWS Rekognition)
    //    or reverse image search (e.g., TinEye, Google Images)
    // 3. Query MusicBrainz API for album metadata
    // 4. Return structured response

    // Example using a hypothetical image recognition service
    const imageBuffer = req.file.buffer;
    
    // Step 1: Identify album from image
    const albumInfo = await identifyAlbumFromImage(imageBuffer);
    
    // Step 2: Query MusicBrainz for detailed metadata
    const metadata = await queryMusicBrainz(albumInfo.artist, albumInfo.title);
    
    // Step 3: Format response
    const response = {
      confidence: albumInfo.confidence || 0.9,
      bestMatch: {
        artist: metadata.artist || albumInfo.artist,
        title: metadata.title || albumInfo.title,
        year: metadata.year || null,
        coverImageRemoteUrl: metadata.coverArt || null,
      },
      alternates: metadata.alternates || [],
    };

    res.json(response);
  } catch (error) {
    console.error('Identification error:', error);
    res.status(500).json({ error: 'Failed to identify record' });
  }
});

async function identifyAlbumFromImage(imageBuffer) {
  // Implement your image recognition logic here
  // This could use:
  // - Google Cloud Vision API
  // - AWS Rekognition
  // - Custom ML model
  // - Reverse image search APIs
  
  // Placeholder implementation
  return {
    artist: 'Unknown Artist',
    title: 'Unknown Album',
    confidence: 0.5,
  };
}

async function queryMusicBrainz(artist, title) {
  // Query MusicBrainz API for release information
  // See: https://musicbrainz.org/doc/MusicBrainz_API
  
  try {
    const response = await axios.get(`${MUSICBRAINZ_API}release/`, {
      params: {
        query: `artist:"${artist}" AND release:"${title}"`,
        fmt: 'json',
        limit: 5,
      },
      headers: {
        'User-Agent': 'SlotSync/1.0.0 (contact@slotsync.app)',
      },
    });

    // Parse and format MusicBrainz response
    const releases = response.data.releases || [];
    if (releases.length === 0) {
      return { artist, title, year: null, coverArt: null, alternates: [] };
    }

    const primary = releases[0];
    const alternates = releases.slice(1).map((r) => ({
      artist: r['artist-credit']?.[0]?.artist?.name || artist,
      title: r.title,
      year: r.date ? new Date(r.date).getFullYear() : null,
      coverImageRemoteUrl: null, // Would need Cover Art Archive API
    }));

    return {
      artist: primary['artist-credit']?.[0]?.artist?.name || artist,
      title: primary.title,
      year: primary.date ? new Date(primary.date).getFullYear() : null,
      coverArt: null, // Would need Cover Art Archive API
      alternates,
    };
  } catch (error) {
    console.error('MusicBrainz query error:', error);
    return { artist, title, year: null, coverArt: null, alternates: [] };
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`SlotSync API server running on port ${PORT}`);
});
```

### Python/Flask Example

```python
from flask import Flask, request, jsonify
from werkzeug.utils import secure_filename
import requests
import io
from PIL import Image

app = Flask(__name__)

@app.route('/api/identify-record', methods=['POST'])
def identify_record():
    if 'image' not in request.files:
        return jsonify({'error': 'No image file provided'}), 400
    
    file = request.files['image']
    
    # Process image
    image = Image.open(io.BytesIO(file.read()))
    
    # Your identification logic here
    # This could use:
    # - Google Cloud Vision API
    # - AWS Rekognition
    # - Custom ML model
    # - Reverse image search
    
    # Example response
    response = {
        'confidence': 0.9,
        'bestMatch': {
            'artist': 'David Bowie',
            'title': 'Heroes',
            'year': 1977,
            'coverImageRemoteUrl': 'https://example.com/covers/heroes.jpg'
        },
        'alternates': []
    }
    
    return jsonify(response)

if __name__ == '__main__':
    app.run(port=3000)
```

## Configuration

### Environment Variables

Set the API base URL in your SlotSync app:

**Option 1: Environment File (.env)**
```
EXPO_PUBLIC_API_BASE_URL=https://your-api-domain.com
```

**Option 2: app.json**
```json
{
  "expo": {
    "extra": {
      "apiBaseUrl": "https://your-api-domain.com"
    }
  }
}
```

### Local Development

- **iOS Simulator**: `http://localhost:3000`
- **Android Emulator**: `http://10.0.2.2:3000`
- **Physical Device**: `http://YOUR_COMPUTER_IP:3000`

## Image Recognition Services

Consider using these services for album cover identification:

1. **Google Cloud Vision API** - Text detection and image classification
2. **AWS Rekognition** - Image analysis and text detection
3. **Reverse Image Search APIs**:
   - TinEye API
   - Google Custom Search API
   - Bing Visual Search API
4. **MusicBrainz API** - For metadata lookup after identification
5. **Cover Art Archive** - For album cover images

## Testing

Use curl to test your endpoint:

```bash
curl -X POST http://localhost:3000/api/identify-record \
  -F "image=@/path/to/album-cover.jpg"
```

## Security Considerations

- Implement rate limiting
- Validate image file types and sizes
- Add authentication if needed
- Use HTTPS in production
- Sanitize all inputs
- Handle errors gracefully

## Support

For questions or issues, refer to the SlotSync documentation or contact support.

