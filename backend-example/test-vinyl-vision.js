/**
 * Test script for Vinyl Vision album cover analysis
 * 
 * Usage:
 *   export OPENAI_API_KEY='sk-...'
 *   export ENABLE_VINYL_VISION='true'
 *   export GPT_MODEL='gpt-4o'
 *   node test-vinyl-vision.js /path/to/album/cover.jpg
 */

const fs = require('fs');
const path = require('path');
const vinylVision = require('./services/analyzeAlbumCover');

async function testVinylVision(imagePath) {
  console.log('🎵 Vinyl Vision Test Script\n');
  console.log('='.repeat(50));

  // Check environment
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ ERROR: OPENAI_API_KEY environment variable not set');
    console.log('   Set it with: export OPENAI_API_KEY="sk-..."');
    process.exit(1);
  }

  if (!vinylVision.isEnabled()) {
    console.error('❌ ERROR: Vinyl Vision not enabled');
    console.log('   Set it with: export ENABLE_VINYL_VISION="true"');
    process.exit(1);
  }

  // Check image file
  if (!imagePath) {
    console.error('❌ ERROR: No image path provided');
    console.log('   Usage: node test-vinyl-vision.js /path/to/album/cover.jpg');
    process.exit(1);
  }

  if (!fs.existsSync(imagePath)) {
    console.error(`❌ ERROR: Image file not found: ${imagePath}`);
    process.exit(1);
  }

  console.log(`📸 Image: ${imagePath}`);
  console.log(`🤖 Model: ${process.env.GPT_MODEL || 'gpt-4o'}`);
  console.log('');

  try {
    // Read image file
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = vinylVision.imageBufferToBase64(imageBuffer);

    console.log('🔄 Analyzing album cover...\n');

    // Test with optional artist/album context
    const result = await vinylVision.analyzeAlbumCover({
      imageBase64: base64Image,
      artist: 'Daft Punk', // Optional context
      albumTitle: 'Discovery', // Optional context
    });

    if (result) {
      console.log('✅ Vinyl Vision Analysis Result:');
      console.log('='.repeat(50));
      console.log(JSON.stringify(result, null, 2));
      console.log('='.repeat(50));
    } else {
      console.error('❌ Analysis returned null');
    }
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Get image path from command line
const imagePath = process.argv[2];

testVinylVision(imagePath);

