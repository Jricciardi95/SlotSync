#!/usr/bin/env node

/**
 * Verify Google Vision Setup
 * Run: node verify-setup.js
 */

const fs = require('fs');
const path = require('path');

console.log('🔍 Verifying Google Vision Setup...\n');

// Check 1: Credentials file exists
const credsPath = path.join(__dirname, 'credentials.json');
if (fs.existsSync(credsPath)) {
  console.log('✅ Credentials file found: credentials.json');
  
  try {
    const creds = JSON.parse(fs.readFileSync(credsPath, 'utf8'));
    
    // Check if it's a valid service account key
    if (creds.type === 'service_account' && creds.project_id) {
      console.log(`✅ Valid service account key`);
      console.log(`   Project: ${creds.project_id}`);
      console.log(`   Client Email: ${creds.client_email}`);
    } else {
      console.log('⚠️  File exists but may not be a valid service account key');
    }
  } catch (e) {
    console.log('❌ Credentials file exists but is not valid JSON');
  }
} else {
  console.log('❌ Credentials file not found: credentials.json');
  console.log('   Download from Google Cloud Console and save here');
}

// Check 2: Environment variable
const envVar = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (envVar) {
  console.log(`\n✅ GOOGLE_APPLICATION_CREDENTIALS is set`);
  console.log(`   Value: ${envVar}`);
  
  if (fs.existsSync(envVar)) {
    console.log('✅ Path exists and is accessible');
  } else {
    console.log('⚠️  Path does not exist');
  }
} else {
  console.log('\n⚠️  GOOGLE_APPLICATION_CREDENTIALS not set');
  console.log('   Run: export GOOGLE_APPLICATION_CREDENTIALS="./credentials.json"');
}

// Check 3: Try to initialize Vision client
console.log('\n🔍 Testing Vision API client...');
try {
  const { ImageAnnotatorClient } = require('@google-cloud/vision');
  const client = new ImageAnnotatorClient();
  console.log('✅ Vision API client initialized successfully!');
  console.log('   Google Vision is ready to use');
} catch (error) {
  if (error.message.includes('Could not load the default credentials')) {
    console.log('❌ Could not load credentials');
    console.log('   Make sure GOOGLE_APPLICATION_CREDENTIALS is set correctly');
  } else if (error.message.includes('PERMISSION_DENIED')) {
    console.log('❌ Permission denied');
    console.log('   Check that Vision API is enabled in Google Cloud');
    console.log('   Check service account has "Cloud Vision API User" role');
  } else {
    console.log('❌ Error:', error.message);
  }
}

console.log('\n📖 For setup instructions, see: GOOGLE_VISION_STEP_BY_STEP.md\n');

