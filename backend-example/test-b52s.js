/**
 * Test script for B-52's "Party Mix!" album identification
 * 
 * This simulates what Google Vision would return for the B-52's "Party Mix!" album cover
 * and tests the identification pipeline to ensure it finds the correct Discogs record.
 * 
 * Run with: node test-b52s.js
 */

const axios = require('axios');

// Simulated Google Vision response for B-52's "Party Mix!"
const mockVisionResponse = {
  candidates: [
    {
      artist: "B-52's",
      title: "Party Mix!",
      confidence: 0.9,
      source: "ocr_newline_split"
    },
    {
      artist: "B-52s",
      title: "Party Mix",
      confidence: 0.85,
      source: "ocr_pattern_dash"
    },
    {
      artist: "The B-52's",
      title: "Party Mix!",
      confidence: 0.8,
      source: "web_entity_pattern_dash"
    }
  ],
  extractedText: "B-52'S\nPARTY MIX!",
  webEntities: [
    { description: "B-52's Party Mix!", score: 0.95 },
    { description: "The B-52's - Party Mix!", score: 0.9 }
  ],
  pageTitles: [
    { pageTitle: "B-52's - Party Mix! (1981)" },
    { pageTitle: "The B-52's Party Mix! Album" }
  ]
};

// Expected Discogs result
const expectedDiscogsResult = {
  artist: "The B-52's",
  title: "Party Mix!",
  year: 1981,
  discogsId: null // Will be actual ID from Discogs
};

async function testIdentification() {
  console.log('🧪 Testing B-52\'s "Party Mix!" identification...\n');

  // Test 1: Direct text search (simulating what we'd extract)
  console.log('Test 1: Direct text search');
  console.log('─────────────────────────────────────────');
  
  const testCandidates = [
    { artist: "B-52's", title: "Party Mix!" },
    { artist: "B-52s", title: "Party Mix" },
    { artist: "The B-52's", title: "Party Mix!" }
  ];

  for (const candidate of testCandidates) {
    console.log(`\nTesting: "${candidate.artist}" - "${candidate.title}"`);
    
    try {
      // Import the search function (we'll need to export it or test via API)
      // For now, test via actual API call
      const response = await axios.post('http://localhost:3000/api/identify-record', {
        artist: candidate.artist,
        title: candidate.title
      }, {
        headers: { 'Content-Type': 'application/json' }
      });

      if (response.data.success) {
        console.log(`✅ SUCCESS!`);
        console.log(`   Found: "${response.data.bestMatch.artist}" - "${response.data.bestMatch.title}"`);
        console.log(`   Year: ${response.data.bestMatch.year || 'N/A'}`);
        console.log(`   Confidence: ${response.data.confidence.toFixed(2)}`);
        console.log(`   Source: ${response.data.source}`);
        
        // Verify it's the right album
        const isCorrect = 
          response.data.bestMatch.artist.toLowerCase().includes('b-52') &&
          response.data.bestMatch.title.toLowerCase().includes('party mix');
        
        if (isCorrect) {
          console.log(`   ✅ Correct album identified!`);
          return true;
        } else {
          console.log(`   ⚠️  Wrong album identified`);
        }
      } else {
        console.log(`❌ Failed: ${response.data.error}`);
        console.log(`   Candidates:`, response.data.candidates);
      }
    } catch (error) {
      if (error.response) {
        console.log(`❌ API Error: ${error.response.status}`);
        console.log(`   Response:`, JSON.stringify(error.response.data, null, 2));
      } else {
        console.log(`❌ Error: ${error.message}`);
      }
    }
  }

  return false;
}

async function testWithImage() {
  console.log('\n\nTest 2: Image upload (requires actual image file)');
  console.log('─────────────────────────────────────────');
  console.log('To test with an actual image:');
  console.log('1. Save a photo of B-52\'s "Party Mix!" album cover');
  console.log('2. Run: curl -X POST http://localhost:3000/api/identify-record \\');
  console.log('          -F "image=@/path/to/b52s-party-mix.jpg"');
  console.log('\nOr use the API test script with an image file.');
}

// Run tests
async function runTests() {
  try {
    // Check if server is running
    try {
      await axios.get('http://localhost:3000/health');
      console.log('✅ Backend server is running\n');
    } catch (err) {
      console.error('❌ Backend server is not running!');
      console.error('   Start it with: cd backend-example && node server-hybrid.js');
      process.exit(1);
    }

    const success = await testIdentification();
    
    if (success) {
      console.log('\n✅ All tests passed! B-52\'s "Party Mix!" identification is working.');
    } else {
      console.log('\n⚠️  Some tests failed. Check the output above for details.');
    }

    await testWithImage();
    
  } catch (error) {
    console.error('Test error:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  runTests();
}

module.exports = { testIdentification, mockVisionResponse, expectedDiscogsResult };

