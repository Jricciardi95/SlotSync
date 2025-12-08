/**
 * Test script for GPT-4 Vision API
 * 
 * Tests that GPT-4 Vision can correctly analyze album covers.
 * 
 * Usage:
 *   export OPENAI_API_KEY='sk-...'
 *   export ENABLE_GPT4_VISION='true'
 *   node test-gpt4-vision.js /path/to/album/cover.jpg
 */

const fs = require('fs');
const path = require('path');
const gpt4Vision = require('./services/gpt4Vision');

// Load environment variables
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function testGPT4Vision() {
  const imagePath = process.argv[2];

  if (!imagePath) {
    console.error('❌ ERROR: Please provide an image path');
    console.log('   Usage: node test-gpt4-vision.js /path/to/album/cover.jpg');
    process.exit(1);
  }

  if (!fs.existsSync(imagePath)) {
    console.error(`❌ ERROR: Image file not found at ${imagePath}`);
    process.exit(1);
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ ERROR: OPENAI_API_KEY environment variable not set');
    console.log('   Set it in your .env file or with: export OPENAI_API_KEY="sk-..."');
    process.exit(1);
  }

  if (process.env.ENABLE_GPT4_VISION !== 'true') {
    console.warn('⚠️  ENABLE_GPT4_VISION is not set to "true". GPT-4 Vision will be skipped.');
    console.warn('   Set it in your .env file or with: export ENABLE_GPT4_VISION="true"');
  }

  try {
    console.log('🎵 GPT-4 Vision Test Script\n');
    console.log('='.repeat(50));
    console.log(`📸 Image: ${imagePath}`);
    console.log(`🔑 API Key: ${process.env.OPENAI_API_KEY.substring(0, 10)}...`);
    console.log('='.repeat(50));
    console.log('\n🔄 Analyzing image with GPT-4 Vision...\n');

    // Read image file
    const imageBuffer = fs.readFileSync(imagePath);
    console.log(`✅ Image loaded: ${(imageBuffer.length / 1024).toFixed(2)} KB\n`);

    // Test GPT-4 Vision
    const result = await gpt4Vision.identifyWithGPT4Vision(imageBuffer);

    if (result) {
      console.log('\n✅ GPT-4 Vision Analysis Result:');
      console.log('='.repeat(50));
      console.log(`Artist: ${result.artist}`);
      console.log(`Title: ${result.title}`);
      console.log(`Year: ${result.year || 'N/A'}`);
      console.log(`Confidence: ${result.confidence}`);
      console.log(`Tracks: ${result.tracks?.length || 0}`);
      if (result.reasoning) {
        console.log(`Reasoning: ${result.reasoning}`);
      }
      console.log('='.repeat(50));
    } else {
      console.log('\n❌ GPT-4 Vision returned null');
      console.log('   This could mean:');
      console.log('   - Low confidence in the result');
      console.log('   - API error occurred');
      console.log('   - Image could not be analyzed');
    }
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    console.error('\nStack trace:', error.stack);
    process.exit(1);
  }
}

testGPT4Vision();
