/**
 * SlotSync Backend API - Example Implementation
 * 
 * This is a basic example server for development/testing.
 * For production, you'll want to integrate with actual image recognition
 * services like Google Vision API, AWS Rekognition, or MusicBrainz.
 * 
 * To run:
 * 1. npm install express multer cors
 * 2. node server.js
 * 3. Update EXPO_PUBLIC_API_BASE_URL in your app to point to this server
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Request counter for variation
let requestCounter = 0;

// Enable CORS for mobile app
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|gif/;
    const extname = allowedTypes.test(
      path.extname(file.originalname).toLowerCase()
    );
    const mimetype = allowedTypes.test(file.mimetype);

    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

/**
 * POST /api/identify-record
 * 
 * Identifies a vinyl record from an album cover image.
 * 
 * This is a MOCK implementation that returns sample data.
 * Replace the identification logic with your actual image recognition service.
 */
app.post('/api/identify-record', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No image file provided',
      });
    }

    // Increment request counter for sequential variation (ensures different results)
    requestCounter++;
    
    // Generate a hash from multiple image characteristics to vary results
    const bufferHash = req.file.buffer ? 
      Array.from(req.file.buffer.slice(0, 200)).reduce((a, b, i) => a + (b * (i + 1)), 0) : 0;
    const sizeHash = req.file.size.toString().split('').reduce((a, b) => a + parseInt(b), 0);
    const timestampHash = Date.now() % 1000;
    
    // Combine all factors for better variation
    // Request counter has high weight to ensure sequential requests get different results
    const combinedHash = (bufferHash + sizeHash + timestampHash + (requestCounter * 7)) % 10;
    
    console.log(`[API] Request #${requestCounter} - Image hash calculation:`, {
      fileSize: req.file.size,
      bufferHash: bufferHash % 1000,
      sizeHash,
      timestampHash,
      requestCounter,
      finalHash: combinedHash
    });
    
    // Iconic vinyl records database
    const mockRecords = [
      {
        artist: 'The Beatles',
        title: 'Abbey Road',
        year: 1969,
        coverImageRemoteUrl: 'https://upload.wikimedia.org/wikipedia/en/4/4d/Abbey_Road.jpg',
        alternates: [
          { artist: 'The Beatles', title: 'Abbey Road (2019 Remix)', year: 2019 },
          { artist: 'The Beatles', title: 'Abbey Road (50th Anniversary)', year: 2019 },
        ],
      },
      {
        artist: 'Pink Floyd',
        title: 'The Dark Side of the Moon',
        year: 1973,
        coverImageRemoteUrl: 'https://upload.wikimedia.org/wikipedia/en/3/3b/Dark_Side_of_the_Moon.png',
        alternates: [
          { artist: 'Pink Floyd', title: 'The Dark Side of the Moon (2011 Remaster)', year: 2011 },
          { artist: 'Pink Floyd', title: 'The Dark Side of the Moon (30th Anniversary)', year: 2003 },
        ],
      },
      {
        artist: 'Led Zeppelin',
        title: 'Led Zeppelin IV',
        year: 1971,
        coverImageRemoteUrl: 'https://upload.wikimedia.org/wikipedia/en/2/26/Led_Zeppelin_-_Led_Zeppelin_IV.jpg',
        alternates: [
          { artist: 'Led Zeppelin', title: 'Led Zeppelin IV (Deluxe Edition)', year: 2014 },
        ],
      },
      {
        artist: 'The Rolling Stones',
        title: 'Sticky Fingers',
        year: 1971,
        coverImageRemoteUrl: 'https://upload.wikimedia.org/wikipedia/en/c/c1/StickyFingers.jpg',
        alternates: [
          { artist: 'The Rolling Stones', title: 'Sticky Fingers (Deluxe)', year: 2015 },
        ],
      },
      {
        artist: 'Fleetwood Mac',
        title: 'Rumours',
        year: 1977,
        coverImageRemoteUrl: 'https://upload.wikimedia.org/wikipedia/en/f/fb/FMacRumours.PNG',
        alternates: [
          { artist: 'Fleetwood Mac', title: 'Rumours (35th Anniversary)', year: 2013 },
        ],
      },
      {
        artist: 'David Bowie',
        title: 'The Rise and Fall of Ziggy Stardust',
        year: 1972,
        coverImageRemoteUrl: 'https://upload.wikimedia.org/wikipedia/en/0/02/ZiggyStardust.jpg',
        alternates: [
          { artist: 'David Bowie', title: 'Ziggy Stardust (40th Anniversary)', year: 2012 },
        ],
      },
      {
        artist: 'The Velvet Underground',
        title: 'The Velvet Underground & Nico',
        year: 1967,
        coverImageRemoteUrl: 'https://upload.wikimedia.org/wikipedia/en/0/01/The_Velvet_Underground_%26_Nico.jpg',
        alternates: [
          { artist: 'The Velvet Underground', title: 'The Velvet Underground & Nico (45th Anniversary)', year: 2012 },
        ],
      },
      {
        artist: 'Radiohead',
        title: 'OK Computer',
        year: 1997,
        coverImageRemoteUrl: 'https://upload.wikimedia.org/wikipedia/en/b/ba/Radioheadokcomputer.png',
        alternates: [
          { artist: 'Radiohead', title: 'OK Computer (OKNOTOK 1997 2017)', year: 2017 },
        ],
      },
      {
        artist: 'Nirvana',
        title: 'Nevermind',
        year: 1991,
        coverImageRemoteUrl: 'https://upload.wikimedia.org/wikipedia/en/b/b7/NirvanaNevermindalbumcover.jpg',
        alternates: [
          { artist: 'Nirvana', title: 'Nevermind (20th Anniversary)', year: 2011 },
        ],
      },
      {
        artist: 'The Beach Boys',
        title: 'Pet Sounds',
        year: 1966,
        coverImageRemoteUrl: 'https://upload.wikimedia.org/wikipedia/en/2/23/PetSoundsCover.jpg',
        alternates: [
          { artist: 'The Beach Boys', title: 'Pet Sounds (50th Anniversary)', year: 2016 },
        ],
      },
    ];

    const selectedRecord = mockRecords[combinedHash];
    
    console.log(`[API] Selected record: ${selectedRecord.artist} - ${selectedRecord.title}`);
    
    const mockResponse = {
      confidence: 0.75 + (Math.random() * 0.2), // Random confidence between 0.75-0.95
      bestMatch: {
        artist: selectedRecord.artist,
        title: selectedRecord.title,
        year: selectedRecord.year,
        coverImageRemoteUrl: selectedRecord.coverImageRemoteUrl,
      },
      alternates: selectedRecord.alternates.map(alt => ({
        artist: alt.artist,
        title: alt.title,
        year: alt.year,
        coverImageRemoteUrl: null,
      })),
    };

    // Simulate processing delay (faster for better UX)
    await new Promise((resolve) => setTimeout(resolve, 800));

    console.log(`[API] Returning: ${mockResponse.bestMatch.artist} - ${mockResponse.bestMatch.title}`);
    res.json(mockResponse);
  } catch (error) {
    console.error('[API] Error identifying record:', error);
    res.status(500).json({
      error: 'Failed to identify record',
      message: error.message,
    });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

/**
 * API info endpoint
 */
app.get('/api', (req, res) => {
  res.json({
    name: 'SlotSync API',
    version: '1.0.0',
    endpoints: {
      identifyRecord: {
        method: 'POST',
        path: '/api/identify-record',
        description: 'Identify a vinyl record from album cover image',
        contentType: 'multipart/form-data',
        field: 'image',
      },
    },
  });
});

app.listen(PORT, () => {
  console.log(`\n🚀 SlotSync API Server running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`📍 API info: http://localhost:${PORT}/api`);
  console.log(`📍 Identify endpoint: http://localhost:${PORT}/api/identify-record\n`);
  console.log('⚠️  This is a MOCK server. Replace with actual image recognition service.\n');
});

