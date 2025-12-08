/**
 * Verify Discogs API Configuration
 * 
 * Quick script to test if Discogs credentials are working.
 * Run this before starting the server to ensure everything is configured.
 */

const axios = require('axios');

const DISCOGS_PERSONAL_ACCESS_TOKEN = process.env.DISCOGS_PERSONAL_ACCESS_TOKEN || process.env.DISCOGS_TOKEN;
const DISCOGS_API_KEY = process.env.DISCOGS_API_KEY || process.env.DISCOGS_CONSUMER_KEY;
const DISCOGS_API_SECRET = process.env.DISCOGS_API_SECRET || process.env.DISCOGS_CONSUMER_SECRET;

async function verifyDiscogs() {
  console.log('🔍 Verifying Discogs API Configuration...\n');

  // Check if credentials are set
  if (!DISCOGS_PERSONAL_ACCESS_TOKEN && !DISCOGS_API_KEY) {
    console.error('❌ ERROR: No Discogs credentials found!');
    console.log('\n📝 To fix:');
    console.log('   export DISCOGS_PERSONAL_ACCESS_TOKEN="your_token_here"');
    console.log('   OR');
    console.log('   export DISCOGS_API_KEY="your_key"');
    console.log('   export DISCOGS_API_SECRET="your_secret"');
    process.exit(1);
  }

  console.log('✅ Credentials found');
  if (DISCOGS_PERSONAL_ACCESS_TOKEN) {
    console.log('   Using: Personal Access Token');
  } else {
    console.log('   Using: API Key + Secret');
  }

  // Test with a simple search
  const headers = {
    'User-Agent': 'SlotSync/1.0.0 (contact@slotsync.app)',
  };

  if (DISCOGS_PERSONAL_ACCESS_TOKEN) {
    headers['Authorization'] = `Discogs token=${DISCOGS_PERSONAL_ACCESS_TOKEN}`;
  }

  const params = {
    q: 'Pink Floyd Dark Side',
    type: 'release',
    per_page: 1,
  };

  if (!DISCOGS_PERSONAL_ACCESS_TOKEN) {
    params.key = DISCOGS_API_KEY;
    params.secret = DISCOGS_API_SECRET;
  }

  try {
    console.log('\n🔍 Testing Discogs API search...');
    const response = await axios.get('https://api.discogs.com/database/search', {
      params,
      headers,
      timeout: 5000,
    });

    if (response.data && response.data.results && response.data.results.length > 0) {
      const result = response.data.results[0];
      console.log('✅ Discogs API is working!');
      console.log(`   Test result: "${result.title}"`);
      console.log(`   Discogs ID: ${result.id}`);
      console.log('\n🎉 All good! You can start the server now.');
      process.exit(0);
    } else {
      console.warn('⚠️  API responded but no results found');
      console.log('   This might be okay - the API is reachable');
      process.exit(0);
    }
  } catch (error) {
    console.error('\n❌ ERROR: Discogs API test failed!');
    console.error(`   ${error.message}`);
    
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Response: ${JSON.stringify(error.response.data, null, 2)}`);
      
      if (error.response.status === 401) {
        console.error('\n   This is an authentication error.');
        console.error('   Check that your token/key is correct.');
      } else if (error.response.status === 429) {
        console.error('\n   Rate limit exceeded.');
        console.error('   Wait a few minutes and try again.');
      }
    } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
      console.error('\n   Network error - check your internet connection.');
    }
    
    process.exit(1);
  }
}

verifyDiscogs();
