/**
 * Test script for Vinyl Vision batch processing
 * 
 * Usage:
 *   export OPENAI_API_KEY='sk-...'
 *   export ENABLE_VINYL_VISION='true'
 *   export GPT_MODEL='gpt-4o'
 *   node test-vinyl-vision-batch.js
 */

const fs = require('fs');
const path = require('path');
const vinylVisionBatch = require('./services/analyzeAlbumBatch');

async function testBatch() {
  console.log('🎵 Vinyl Vision Batch Test Script\n');
  console.log('='.repeat(50));

  // Check environment
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ ERROR: OPENAI_API_KEY environment variable not set');
    console.log('   Set it with: export OPENAI_API_KEY="sk-..."');
    process.exit(1);
  }

  // Example batch files (adjust paths as needed)
  const batchFiles = [
    { 
      file: path.join(__dirname, 'test-images', 'discovery.jpg'), 
      artist: 'Daft Punk', 
      albumTitle: 'Discovery' 
    },
    { 
      file: path.join(__dirname, 'test-images', 'abbey-road.jpg'), 
      artist: 'The Beatles', 
      albumTitle: 'Abbey Road' 
    },
    // Add more test images as needed
  ];

  // Filter out files that don't exist
  const existingFiles = batchFiles.filter(({ file }) => {
    if (!fs.existsSync(file)) {
      console.warn(`⚠️  Skipping ${file} (file not found)`);
      return false;
    }
    return true;
  });

  if (existingFiles.length === 0) {
    console.error('❌ ERROR: No test images found');
    console.log('   Create test-images/ directory and add some album cover images');
    process.exit(1);
  }

  console.log(`📸 Processing ${existingFiles.length} images...\n`);

  try {
    // Convert files to base64
    const entries = existingFiles.map(({ file, artist, albumTitle }) => {
      const imageBuffer = fs.readFileSync(file);
      const imageBase64 = imageBuffer.toString('base64');
      
      return {
        imageBase64,
        fileName: path.basename(file),
        artist,
        albumTitle,
      };
    });

    console.log('🔄 Analyzing batch...\n');

    const results = await vinylVisionBatch.analyzeAlbumBatch({ entries });

    console.log('\n✅ Batch Analysis Results:');
    console.log('='.repeat(50));
    
    results.forEach((result, index) => {
      console.log(`\n${index + 1}. ${result.fileName}`);
      if (result.success) {
        console.log(`   ✅ Success`);
        console.log(`   Artist: ${result.metadata.artist}`);
        console.log(`   Album: ${result.metadata.albumTitle}`);
        console.log(`   Year: ${result.metadata.releaseYear || 'N/A'}`);
        console.log(`   Genre: ${result.metadata.genre || 'N/A'}`);
        console.log(`   Confidence: ${result.metadata.confidence || 'N/A'}`);
        console.log(`   Tracks: ${result.metadata.tracklist?.length || 0}`);
      } else {
        console.log(`   ❌ Failed: ${result.error}`);
      }
    });

    console.log('\n' + '='.repeat(50));
    const successCount = results.filter(r => r.success).length;
    console.log(`\nSummary: ${successCount}/${results.length} successful`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testBatch();

