#!/usr/bin/env node

/**
 * Verify Discogs API Setup
 * Run: node verify-discogs.js
 */

console.log('🔍 Verifying Discogs API Setup...\n');

// Check environment variables (support both methods)
const personalToken = process.env.DISCOGS_PERSONAL_ACCESS_TOKEN || process.env.DISCOGS_TOKEN;
const apiKey = process.env.DISCOGS_API_KEY || process.env.DISCOGS_CONSUMER_KEY;
const apiSecret = process.env.DISCOGS_API_SECRET || process.env.DISCOGS_CONSUMER_SECRET;

if (personalToken) {
  console.log('✅ Discogs Personal Access Token found (recommended method)');
  console.log(`   Token: ${personalToken.substring(0, 10)}...${personalToken.substring(personalToken.length - 4)}`);
  console.log('\n✅ Discogs API is configured!');
  console.log('   Restart the server to use Discogs API');
} else if (apiKey && apiSecret) {
  console.log('✅ Discogs API keys found (OAuth method)');
  console.log(`   Key: ${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}`);
  console.log(`   Secret: ${apiSecret.substring(0, 10)}...${apiSecret.substring(apiSecret.length - 4)}`);
  console.log('\n✅ Discogs API is configured!');
  console.log('   Restart the server to use Discogs API');
} else {
  console.log('❌ Discogs API not configured');
  console.log('\n📋 Recommended: Personal Access Token (simpler)');
  console.log('   1. Go to: https://www.discogs.com/settings/developers');
  console.log('   2. Generate Personal Access Token');
  console.log('   3. Set: export DISCOGS_PERSONAL_ACCESS_TOKEN="your_token"');
  console.log('\n📋 Alternative: OAuth Key/Secret');
  console.log('   1. Go to: https://www.discogs.com/settings/developers');
  console.log('   2. Generate Consumer Key and Secret');
  console.log('   3. Set: export DISCOGS_API_KEY="your_key"');
  console.log('   4. Set: export DISCOGS_API_SECRET="your_secret"');
  console.log('\n📖 See: DISCOGS_AUTHENTICATION.md for detailed instructions');
}

console.log('');

