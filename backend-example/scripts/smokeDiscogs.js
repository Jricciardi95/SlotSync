#!/usr/bin/env node
/**
 * Smoke test for discogsHttpRequest
 * Tests a single Discogs search call to verify timeout behavior and header handling
 */

const { discogsHttpRequest } = require('../services/discogsHttpClient');

async function smokeTest() {
  console.log('🧪 Smoke test: discogsHttpRequest');
  console.log('Testing Discogs search with timeout...\n');
  
  // Check token from environment
  const token = (process.env.DISCOGS_PERSONAL_ACCESS_TOKEN || process.env.DISCOGS_TOKEN || '').trim();
  const tokenLen = token.length;
  const hasSpace = token.includes(' ');
  const hasAuth = !!token;
  
  console.log(`📋 Token check:`);
  console.log(`   Length: ${tokenLen}`);
  console.log(`   Has space: ${hasSpace}`);
  console.log(`   Authorization header will be set: ${hasAuth}`);
  if (hasAuth) {
    console.log(`   Authorization header: Discogs token=${token.slice(0, 4)}...`);
  } else {
    console.log(`   ⚠️  No token found in DISCOGS_PERSONAL_ACCESS_TOKEN or DISCOGS_TOKEN`);
  }
  console.log('');
  
  const startTime = Date.now();
  
  try {
    const result = await discogsHttpRequest(
      'https://api.discogs.com/database/search',
      {
        params: {
          q: 'Pink Floyd The Dark Side of the Moon',
          type: 'release',
          format: 'Vinyl',
          per_page: 5,
        },
        headers: {
          'User-Agent': 'SlotSync/1.0.0 (contact@slotsync.app)',
        },
      },
      {
        timeoutMs: 12000,
        reqId: 'smoke-test',
        op: 'smoke_search',
        meta: { test: true },
      }
    );
    
    const elapsed = Date.now() - startTime;
    console.log(`\n✅ SUCCESS: Discogs search completed in ${elapsed}ms`);
    console.log(`   Status: 200`);
    console.log(`   Authorization header was set: ${hasAuth}`);
    console.log(`   Results: ${result.results?.length || 0}`);
    if (result.results && result.results.length > 0) {
      console.log(`   Top result: ${result.results[0].title}`);
    }
    process.exit(0);
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error(`\n❌ FAILED: ${error.message}`);
    console.error(`   Status: ${error.status || 'N/A'}`);
    console.error(`   Code: ${error.code || 'N/A'}`);
    console.error(`   Authorization header was set: ${hasAuth}`);
    if (hasAuth && error.status === 401) {
      console.error(`   ⚠️  401 with token set - check token validity or header format`);
    }
    console.error(`   Elapsed: ${elapsed}ms`);
    process.exit(1);
  }
}

smokeTest();

