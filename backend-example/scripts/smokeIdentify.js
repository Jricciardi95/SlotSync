#!/usr/bin/env node
/**
 * Smoke test for /api/identify-record endpoint
 * Posts an image file and prints response time
 */

const fs = require('fs');
const path = require('path');
// Use native fetch (Node 18+) - if not available, install node-fetch
const fetch = globalThis.fetch || require('node-fetch');
const FormData = require('form-data');

async function smokeTest() {
  const imagePath = process.argv[2];
  
  if (!imagePath) {
    console.error('Usage: node scripts/smokeIdentify.js <path-to-image>');
    console.error('Example: node scripts/smokeIdentify.js ../test-images/album-cover.jpg');
    process.exit(1);
  }
  
  if (!fs.existsSync(imagePath)) {
    console.error(`❌ Image file not found: ${imagePath}`);
    process.exit(1);
  }
  
  const apiUrl = process.env.API_URL || 'http://localhost:3000';
  const endpoint = `${apiUrl}/api/identify-record`;
  
  console.log('🧪 Smoke test: /api/identify-record');
  console.log(`   Image: ${imagePath}`);
  console.log(`   Endpoint: ${endpoint}\n`);
  
  const startTime = Date.now();
  
  try {
    const form = new FormData();
    form.append('image', fs.createReadStream(imagePath));
    
    const response = await fetch(endpoint, {
      method: 'POST',
      body: form,
      headers: form.getHeaders(),
    });
    
    const elapsed = Date.now() - startTime;
    const data = await response.json();
    
    if (response.ok && data.success) {
      console.log(`✅ SUCCESS: Identification completed in ${elapsed}ms`);
      console.log(`   Artist: ${data.artist}`);
      console.log(`   Title: ${data.albumTitle}`);
      console.log(`   Year: ${data.releaseYear || 'N/A'}`);
      console.log(`   Discogs ID: ${data.discogsId || 'N/A'}`);
      console.log(`   Confidence: ${data.confidence?.toFixed(3) || 'N/A'}`);
      console.log(`   Tracks: ${data.tracks?.length || 0}`);
    } else {
      console.log(`⚠️  PARTIAL: Request completed in ${elapsed}ms but no match`);
      console.log(`   Status: ${response.status}`);
      console.log(`   Error: ${data.error || 'Unknown'}`);
      if (data.albumSuggestions && data.albumSuggestions.length > 0) {
        console.log(`   Suggestions: ${data.albumSuggestions.length}`);
      }
    }
    
    console.log(`\n📊 Total time: ${elapsed}ms`);
    process.exit(response.ok ? 0 : 1);
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`❌ FAILED: ${error.message}`);
    console.error(`   Elapsed: ${elapsed}ms`);
    if (error.code === 'ECONNREFUSED') {
      console.error(`   Make sure the server is running on ${apiUrl}`);
    }
    process.exit(1);
  }
}

smokeTest();

