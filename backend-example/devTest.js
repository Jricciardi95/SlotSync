/**
 * DEV-ONLY: Regression Test Harness for Known Hard Albums
 * 
 * Tests identification of known difficult albums:
 * - "Mick Jagger – Primitive Cool"
 * - "The B-52's – Party Mix!"
 * 
 * Usage:
 *   node devTest.js
 * 
 * Or set ENABLE_DEV_TEST=true and use /api/dev-test endpoint
 * 
 * Place test images in: backend-example/test-images/
 *   - primitive_cool.jpg
 *   - party_mix.jpg
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
const FormData = require('form-data');

const TEST_IMAGES = {
  'Mick Jagger – Primitive Cool': path.join(__dirname, 'test-images', 'primitive_cool.jpg'),
  "The B-52's – Party Mix!": path.join(__dirname, 'test-images', 'party_mix.jpg'),
};

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:3000';

/**
 * Run identification test for a single album
 */
async function testIdentification(testName, imagePath) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 Testing: ${testName}`);
  console.log(`📸 Image: ${imagePath}`);
  console.log(`${'='.repeat(60)}\n`);

  if (!fs.existsSync(imagePath)) {
    console.log(`❌ Image not found: ${imagePath}`);
    console.log(`   Place test image at: ${imagePath}`);
    return null;
  }

  try {
    const formData = new FormData();
    formData.append('image', fs.createReadStream(imagePath));

    const startTime = Date.now();
    const response = await axios.post(`${API_BASE_URL}/api/identify-record`, formData, {
      headers: formData.getHeaders(),
      timeout: 90000,
    });
    const duration = Date.now() - startTime;

    const data = response.data;

    console.log(`✅ Identification completed in ${duration}ms\n`);

    if (data.success) {
      console.log(`📀 RESULT:`);
      console.log(`   Artist: "${data.artist}"`);
      console.log(`   Album: "${data.albumTitle}"`);
      console.log(`   Year: ${data.releaseYear || 'N/A'}`);
      console.log(`   Confidence: ${data.confidence.toFixed(3)}`);
      console.log(`   Discogs ID: ${data.discogsId || 'N/A'}`);
      console.log(`   Tracks: ${data.tracks?.length || 0}`);
      console.log(`   Cover Art: ${data.coverImageUrl ? '✅' : '❌'}`);
      
      return {
        success: true,
        artist: data.artist,
        album: data.albumTitle,
        confidence: data.confidence,
        duration,
      };
    } else {
      console.log(`❌ Identification failed:`);
      console.log(`   Error: ${data.error || data.message}`);
      if (data.candidates && data.candidates.length > 0) {
        console.log(`   Candidates (${data.candidates.length}):`);
        data.candidates.slice(0, 3).forEach((c, i) => {
          console.log(`     ${i + 1}. "${c.artist}" - "${c.title}" (${c.confidence?.toFixed(3) || 'N/A'})`);
        });
      }
      
      return {
        success: false,
        error: data.error || data.message,
        candidates: data.candidates || [],
        duration,
      };
    }
  } catch (error) {
    console.log(`❌ Test failed with error:`);
    console.log(`   ${error.message}`);
    if (error.response) {
      console.log(`   Status: ${error.response.status}`);
      console.log(`   Data: ${JSON.stringify(error.response.data, null, 2)}`);
    }
    
    return {
      success: false,
      error: error.message,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Run all regression tests
 */
async function runAllTests() {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 SLOTSYNC REGRESSION TESTS`);
  console.log(`   Testing known hard albums`);
  console.log(`${'='.repeat(60)}\n`);

  const results = {};

  for (const [testName, imagePath] of Object.entries(TEST_IMAGES)) {
    const result = await testIdentification(testName, imagePath);
    results[testName] = result;
    
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`📊 TEST SUMMARY`);
  console.log(`${'='.repeat(60)}\n`);

  for (const [testName, result] of Object.entries(results)) {
    if (result && result.success) {
      console.log(`✅ ${testName}:`);
      console.log(`   Identified: "${result.artist}" - "${result.album}"`);
      console.log(`   Confidence: ${result.confidence.toFixed(3)}`);
      console.log(`   Duration: ${result.duration}ms`);
    } else {
      console.log(`❌ ${testName}:`);
      console.log(`   Failed: ${result?.error || 'Unknown error'}`);
      console.log(`   Duration: ${result?.duration || 0}ms`);
    }
    console.log('');
  }

  const successCount = Object.values(results).filter(r => r && r.success).length;
  const totalCount = Object.keys(results).length;

  console.log(`${'='.repeat(60)}`);
  console.log(`✅ Passed: ${successCount}/${totalCount}`);
  console.log(`${'='.repeat(60)}\n`);

  return results;
}

// Run tests if called directly
if (require.main === module) {
  runAllTests()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Test harness error:', error);
      process.exit(1);
    });
}

module.exports = { testIdentification, runAllTests, TEST_IMAGES };

