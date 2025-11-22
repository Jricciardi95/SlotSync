/**
 * Test script for SlotSync API
 * 
 * Usage:
 *   node test-api.js [image-path]
 * 
 * Example:
 *   node test-api.js ./test-images/album-cover.jpg
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

const API_URL = process.env.API_URL || 'http://localhost:3000';
const imagePath = process.argv[2];

if (!imagePath) {
  console.error('❌ Please provide an image path');
  console.log('Usage: node test-api.js [image-path]');
  process.exit(1);
}

if (!fs.existsSync(imagePath)) {
  console.error(`❌ Image file not found: ${imagePath}`);
  process.exit(1);
}

async function testAPI() {
  console.log(`\n🧪 Testing SlotSync API at ${API_URL}\n`);
  console.log(`📸 Image: ${imagePath}\n`);

  try {
    // Test health endpoint
    console.log('1️⃣  Testing health endpoint...');
    const healthResponse = await axios.get(`${API_URL}/health`);
    console.log('✅ Health check:', healthResponse.data);
    console.log('');

    // Test identify endpoint
    console.log('2️⃣  Testing identify-record endpoint...');
    const formData = new FormData();
    formData.append('image', fs.createReadStream(imagePath));

    const startTime = Date.now();
    const identifyResponse = await axios.post(
      `${API_URL}/api/identify-record`,
      formData,
      {
        headers: formData.getHeaders(),
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      }
    );
    const duration = Date.now() - startTime;

    console.log('✅ Identification successful!');
    console.log(`⏱️  Response time: ${duration}ms\n`);
    console.log('📋 Results:');
    console.log(JSON.stringify(identifyResponse.data, null, 2));
    console.log('');

    // Summary
    const result = identifyResponse.data;
    console.log('📊 Summary:');
    console.log(`   Confidence: ${(result.confidence * 100).toFixed(1)}%`);
    console.log(`   Best Match: ${result.bestMatch.artist} - ${result.bestMatch.title}`);
    if (result.bestMatch.year) {
      console.log(`   Year: ${result.bestMatch.year}`);
    }
    console.log(`   Alternates: ${result.alternates.length}`);
    console.log('');

    console.log('✅ All tests passed!\n');
  } catch (error) {
    console.error('❌ Test failed!\n');

    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    } else if (error.request) {
      console.error('No response received. Is the server running?');
      console.error('Make sure the server is started with: npm run start:vision');
    } else {
      console.error('Error:', error.message);
    }

    process.exit(1);
  }
}

testAPI();

