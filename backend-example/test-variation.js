/**
 * Quick test script to verify the server returns different results
 * Run: node test-variation.js
 */

const http = require('http');
const fs = require('fs');
const FormData = require('form-data');
const path = require('path');

// Create a dummy image buffer for testing
const createDummyImage = () => {
  // Create a minimal valid JPEG header + some random data
  const jpegHeader = Buffer.from([
    0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46
  ]);
  const randomData = Buffer.alloc(1000);
  randomData.fill(Math.floor(Math.random() * 256));
  return Buffer.concat([jpegHeader, randomData]);
};

const testServer = async () => {
  console.log('Testing server variation...\n');
  
  for (let i = 1; i <= 5; i++) {
    const form = new FormData();
    const imageBuffer = createDummyImage();
    
    form.append('image', imageBuffer, {
      filename: `test-${i}.jpg`,
      contentType: 'image/jpeg',
    });
    
    await new Promise((resolve, reject) => {
      const req = http.request({
        hostname: 'localhost',
        port: 3000,
        path: '/api/identify-record',
        method: 'POST',
        headers: form.getHeaders(),
      }, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const result = JSON.parse(data);
            console.log(`Test ${i}: ${result.bestMatch.artist} - ${result.bestMatch.title}`);
            resolve();
          } catch (e) {
            console.error(`Test ${i} failed:`, e.message);
            reject(e);
          }
        });
      });
      
      req.on('error', (e) => {
        console.error(`Test ${i} error:`, e.message);
        reject(e);
      });
      
      form.pipe(req);
    });
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log('\n✅ Variation test complete!');
};

testServer().catch(console.error);

