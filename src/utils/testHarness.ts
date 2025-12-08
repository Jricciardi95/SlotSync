/**
 * Test Harness for Identification Pipeline
 * 
 * Dev-only utility for testing identification with hard cases.
 * 
 * Usage:
 *   import { testIdentification } from '../utils/testHarness';
 *   await testIdentification('test-image.jpg');
 */

import { identifyAlbumFromImage } from '../services/identification/orchestrator';
import { DEBUG_IDENTIFICATION } from './debug';

/**
 * Test cases for hard-to-identify albums
 */
export const TEST_CASES = {
  'Mick Jagger – Primitive Cool': {
    description: 'Hard case: apostrophe in artist name, special characters',
    expectedArtist: 'Mick Jagger',
    expectedAlbum: 'Primitive Cool',
  },
  "The B-52's – Party Mix!": {
    description: 'Hard case: apostrophe, exclamation mark, "The" prefix',
    expectedArtist: "The B-52's",
    expectedAlbum: 'Party Mix!',
  },
} as const;

/**
 * Test identification with a local image
 * 
 * @param imageUri - Local file URI of test image
 * @param testName - Optional test case name for logging
 * @returns Test result with candidates, final album, and confidence
 */
export async function testIdentification(
  imageUri: string,
  testName?: string
): Promise<{
  success: boolean;
  candidates: any[];
  finalAlbum: any | null;
  confidence: number;
  error?: string;
  timing: {
    total: number;
    vision?: number;
    metadata?: number;
  };
}> {
  const startTime = Date.now();
  
  console.log('='.repeat(60));
  console.log(`🧪 TEST HARNESS: ${testName || 'Unknown Test'}`);
  console.log('='.repeat(60));
  console.log(`Image: ${imageUri}`);
  console.log(`Debug mode: ${DEBUG_IDENTIFICATION ? 'ON' : 'OFF'}`);
  console.log('');

  try {
    const result = await identifyAlbumFromImage(imageUri, {
      minConfidence: 0.5, // Lower threshold for testing
      preferVinyl: true,
      fetchTracks: true,
      fetchCoverArt: true,
    });

    const totalTime = Date.now() - startTime;

    console.log('');
    console.log('='.repeat(60));
    console.log('📊 TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`✅ Success: ${result ? 'YES' : 'NO'}`);
    
    if (result) {
      console.log(`Artist: ${result.album.artist}`);
      console.log(`Album: ${result.album.albumTitle}`);
      console.log(`Year: ${result.album.releaseYear || 'N/A'}`);
      console.log(`Confidence: ${result.album.confidence.toFixed(3)}`);
      console.log(`From Cache: ${result.fromCache ? 'YES' : 'NO'}`);
      console.log(`Candidates Used: ${result.sourceCandidates.length}`);
      console.log(`Tracks: ${result.album.tracks.length}`);
      console.log(`Discogs ID: ${result.album.discogsId || 'N/A'}`);
      console.log(`MusicBrainz ID: ${result.album.musicbrainzId || 'N/A'}`);
      console.log(`Cover Art: ${result.album.coverHdUrl ? 'SET' : 'NULL'}`);
    }
    
    console.log(`Total Time: ${totalTime}ms`);
    console.log('='.repeat(60));

    return {
      success: !!result,
      candidates: result?.sourceCandidates || [],
      finalAlbum: result?.album || null,
      confidence: result?.album.confidence || 0,
      timing: {
        total: totalTime,
      },
    };
  } catch (error: any) {
    const totalTime = Date.now() - startTime;
    
    console.log('');
    console.log('='.repeat(60));
    console.log('❌ TEST FAILED');
    console.log('='.repeat(60));
    console.log(`Error: ${error.message || error}`);
    console.log(`Code: ${error.code || 'UNKNOWN'}`);
    if (error.candidates) {
      console.log(`Candidates Found: ${error.candidates.length}`);
      console.log('Top candidates:');
      error.candidates.slice(0, 5).forEach((c: any, i: number) => {
        console.log(`  ${i + 1}. ${c.artist} - ${c.title || c.album} (${c.confidence?.toFixed(3) || 'N/A'})`);
      });
    }
    if (error.extractedText) {
      console.log(`Extracted Text: ${error.extractedText.substring(0, 200)}...`);
    }
    console.log(`Total Time: ${totalTime}ms`);
    console.log('='.repeat(60));

    return {
      success: false,
      candidates: error.candidates || [],
      finalAlbum: null,
      confidence: 0,
      error: error.message || String(error),
      timing: {
        total: totalTime,
      },
    };
  }
}

/**
 * Run all test cases (if test images are available)
 */
export async function runAllTests(testImages: Record<string, string>): Promise<void> {
  console.log('🧪 Running all test cases...');
  console.log('');

  const results: Array<{ name: string; success: boolean }> = [];

  for (const [name, imageUri] of Object.entries(testImages)) {
    const result = await testIdentification(imageUri, name);
    results.push({ name, success: result.success });
    
    // Wait a bit between tests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  console.log('');
  console.log('='.repeat(60));
  console.log('📈 TEST SUMMARY');
  console.log('='.repeat(60));
  results.forEach((r, i) => {
    console.log(`${i + 1}. ${r.name}: ${r.success ? '✅ PASS' : '❌ FAIL'}`);
  });
  console.log(`Total: ${results.length} tests, ${results.filter(r => r.success).length} passed`);
  console.log('='.repeat(60));
}

