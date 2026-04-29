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
import { logger } from './logger';

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
  
  logger.debug('='.repeat(60));
  logger.debug(`🧪 TEST HARNESS: ${testName || 'Unknown Test'}`);
  logger.debug('='.repeat(60));
  logger.debug(`Image: ${imageUri}`);
  logger.debug(`Debug mode: ${DEBUG_IDENTIFICATION ? 'ON' : 'OFF'}`);
  logger.debug('');

  try {
    const result = await identifyAlbumFromImage(imageUri, {
      minConfidence: 0.5, // Lower threshold for testing
      preferVinyl: true,
      fetchTracks: true,
      fetchCoverArt: true,
    });

    const totalTime = Date.now() - startTime;

    logger.debug('');
    logger.debug('='.repeat(60));
    logger.debug('📊 TEST RESULTS');
    logger.debug('='.repeat(60));
    logger.debug(`✅ Success: ${result ? 'YES' : 'NO'}`);
    
    if (result) {
      logger.debug(`Artist: ${result.album.artist}`);
      logger.debug(`Album: ${result.album.albumTitle}`);
      logger.debug(`Year: ${result.album.releaseYear || 'N/A'}`);
      logger.debug(`Confidence: ${result.album.confidence.toFixed(3)}`);
      logger.debug(`From Cache: ${result.fromCache ? 'YES' : 'NO'}`);
      logger.debug(`Candidates Used: ${result.sourceCandidates.length}`);
      logger.debug(`Tracks: ${result.album.tracks.length}`);
      logger.debug(`Discogs ID: ${result.album.discogsId || 'N/A'}`);
      logger.debug(`MusicBrainz ID: ${result.album.musicbrainzId || 'N/A'}`);
      logger.debug(`Cover Art: ${result.album.coverHdUrl ? 'SET' : 'NULL'}`);
    }
    
    logger.debug(`Total Time: ${totalTime}ms`);
    logger.debug('='.repeat(60));

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
    
    logger.debug('');
    logger.debug('='.repeat(60));
    logger.debug('❌ TEST FAILED');
    logger.debug('='.repeat(60));
    logger.debug(`Error: ${error.message || error}`);
    logger.debug(`Code: ${error.code || 'UNKNOWN'}`);
    if (error.candidates) {
      logger.debug(`Candidates Found: ${error.candidates.length}`);
      logger.debug('Top candidates:');
      error.candidates.slice(0, 5).forEach((c: any, i: number) => {
        logger.debug(`  ${i + 1}. ${c.artist} - ${c.title || c.album} (${c.confidence?.toFixed(3) || 'N/A'})`);
      });
    }
    if (error.extractedText) {
      logger.debug(`Extracted Text: ${error.extractedText.substring(0, 200)}...`);
    }
    logger.debug(`Total Time: ${totalTime}ms`);
    logger.debug('='.repeat(60));

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
  logger.debug('🧪 Running all test cases...');
  logger.debug('');

  const results: Array<{ name: string; success: boolean }> = [];

  for (const [name, imageUri] of Object.entries(testImages)) {
    const result = await testIdentification(imageUri, name);
    results.push({ name, success: result.success });
    
    // Wait a bit between tests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  logger.debug('');
  logger.debug('='.repeat(60));
  logger.debug('📈 TEST SUMMARY');
  logger.debug('='.repeat(60));
  results.forEach((r, i) => {
    logger.debug(`${i + 1}. ${r.name}: ${r.success ? '✅ PASS' : '❌ FAIL'}`);
  });
  logger.debug(`Total: ${results.length} tests, ${results.filter(r => r.success).length} passed`);
  logger.debug('='.repeat(60));
}

