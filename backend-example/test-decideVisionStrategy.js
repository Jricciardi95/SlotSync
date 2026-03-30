/**
 * Unit Tests for decideVisionStrategy()
 * 
 * Tests the visual-first decision policy without requiring external services.
 * Run with: node test-decideVisionStrategy.js
 */

// Mock the decideVisionStrategy function (extract from server-hybrid.js logic)
// For testing, we'll require the actual function or copy the logic here

// Test helper
function assert(condition, message) {
  if (!condition) {
    throw new Error(`❌ ASSERTION FAILED: ${message}`);
  }
  console.log(`✅ ${message}`);
}

// Mock decideVisionStrategy (simplified version for testing)
// In real implementation, this would be imported from server-hybrid.js
function decideVisionStrategy({
  embeddingMatches = [],
  datasetSize = 0,
  hasValidIndex = true,
  enableVision = true,
  thresholds = {}
}) {
  const {
    strongAccept = 0.94,
    strongAcceptMargin = 0.04,
    skipVision = 0.92,
    margin = 0.03,
    minDatasetSize = 200
  } = thresholds;

  // Guardrail: Never skip Vision if embeddingMatches is empty
  if (embeddingMatches.length === 0) {
    return {
      decision: 'RUN_VISION',
      reason: 'no_embedding_matches',
      top1: { similarity: 0, discogsId: null, recordId: null },
      top2: null,
      margin: null,
      marginUnavailable: true
    };
  }

  const topMatch = embeddingMatches[0];
  const top1Similarity = topMatch.similarity;
  const top1Id = topMatch.discogsId || topMatch.recordId || topMatch.metadata?.discogsId || topMatch.metadata?.recordId || null;
  
  // Guardrail: Never skip Vision if top1 has no valid discogsId/recordId
  const hasValidId = !!(topMatch.discogsId || topMatch.recordId || topMatch.metadata?.discogsId || topMatch.metadata?.recordId);
  if (!hasValidId) {
    return {
      decision: 'RUN_VISION',
      reason: 'no_valid_id',
      top1: { similarity: top1Similarity, discogsId: null, recordId: null },
      top2: null,
      margin: null,
      marginUnavailable: true
    };
  }

  // Guardrail: Never skip Vision if dataset is too small (cold start)
  const isColdStart = datasetSize < minDatasetSize;
  if (isColdStart) {
    return {
      decision: 'RUN_VISION',
      reason: `cold_start_dataset_size_${datasetSize}_<_${minDatasetSize}`,
      top1: { similarity: top1Similarity, discogsId: top1Id, recordId: top1Id },
      top2: null,
      margin: null,
      marginUnavailable: true
    };
  }

  // Guardrail: Ensure valid index was used
  if (!hasValidIndex) {
    return {
      decision: 'RUN_VISION',
      reason: 'invalid_index',
      top1: { similarity: top1Similarity, discogsId: top1Id, recordId: top1Id },
      top2: null,
      margin: null,
      marginUnavailable: true
    };
  }

  // Get top2 for margin check
  const top2Match = embeddingMatches.length > 1 ? embeddingMatches[1] : null;
  const top2Similarity = top2Match ? top2Match.similarity : null;
  const calculatedMargin = top2Similarity !== null ? (top1Similarity - top2Similarity) : null;
  const marginUnavailable = calculatedMargin === null;

  // Check if margin requirement is met (if margin check is enabled)
  // If margin is unavailable (no top2), only allow if margin threshold is disabled (<= 0)
  // Otherwise, require calculatedMargin >= threshold
  const marginCheck = margin <= 0 || (marginUnavailable ? false : calculatedMargin >= margin);
  const strongMarginCheck = strongAcceptMargin <= 0 || (marginUnavailable ? false : calculatedMargin >= strongAcceptMargin);

  // Decision 1: STRONG_ACCEPT (treat as final, no OCR override)
  if (top1Similarity >= strongAccept && strongMarginCheck && hasValidId && !isColdStart) {
    return {
      decision: 'ACCEPT_EMBEDDING_FINAL',
      reason: `strong_accept_similarity_${top1Similarity.toFixed(3)}_margin_${calculatedMargin !== null ? calculatedMargin.toFixed(3) : 'N/A'}`,
      top1: { similarity: top1Similarity, discogsId: top1Id, recordId: top1Id },
      top2: top2Similarity !== null ? { similarity: top2Similarity } : null,
      margin: calculatedMargin,
      marginUnavailable: marginUnavailable
    };
  }

  // Decision 2: SKIP_VISION (proceed without Vision, but allow OCR refinement)
  if (top1Similarity >= skipVision && marginCheck && hasValidId && !isColdStart && enableVision) {
    return {
      decision: 'SKIP_VISION',
      reason: `skip_vision_similarity_${top1Similarity.toFixed(3)}_margin_${calculatedMargin !== null ? calculatedMargin.toFixed(3) : 'N/A'}`,
      top1: { similarity: top1Similarity, discogsId: top1Id, recordId: top1Id },
      top2: top2Similarity !== null ? { similarity: top2Similarity } : null,
      margin: calculatedMargin,
      marginUnavailable: marginUnavailable
    };
  }

  // Decision 3: RUN_VISION (fallback)
  const reasons = [];
  if (top1Similarity < skipVision) reasons.push(`similarity_${top1Similarity.toFixed(3)}_<_${skipVision}`);
  if (!marginCheck && margin > 0) {
    if (marginUnavailable) {
      reasons.push(`margin_unavailable`);
    } else {
      reasons.push(`margin_${calculatedMargin.toFixed(3)}_<_${margin}`);
    }
  }
  if (!hasValidId) reasons.push('no_valid_id');
  if (isColdStart) reasons.push(`cold_start_dataset_${datasetSize}_<_${minDatasetSize}`);
  if (!enableVision) reasons.push('vision_disabled');

  return {
    decision: 'RUN_VISION',
    reason: reasons.length > 0 ? reasons.join('_') : 'default_fallback',
    skipReasons: reasons,
    top1: { similarity: top1Similarity, discogsId: top1Id, recordId: top1Id },
    top2: top2Similarity !== null ? { similarity: top2Similarity } : null,
    margin: calculatedMargin,
    marginUnavailable: marginUnavailable
  };
}

// Test Case A: Strong accept (top1=0.95, top2=0.90, valid id, datasetSize=500) => ACCEPT_EMBEDDING_FINAL
console.log('\n=== Test Case A: Strong Accept ===');
const testA = decideVisionStrategy({
  embeddingMatches: [
    { similarity: 0.95, discogsId: '12345', metadata: { artist: 'Artist', title: 'Album' } },
    { similarity: 0.90, discogsId: '67890', metadata: { artist: 'Other', title: 'Other' } }
  ],
  datasetSize: 500,
  hasValidIndex: true,
  enableVision: true,
  thresholds: {
    strongAccept: 0.94,
    strongAcceptMargin: 0.04,
    skipVision: 0.92,
    margin: 0.03,
    minDatasetSize: 200
  }
});
assert(testA.decision === 'ACCEPT_EMBEDDING_FINAL', 'Case A: Should return ACCEPT_EMBEDDING_FINAL');
assert(testA.top1.similarity === 0.95, 'Case A: top1 similarity should be 0.95');
assert(testA.top1.discogsId === '12345', 'Case A: top1 discogsId should be 12345');
assert(Math.abs(testA.margin - 0.05) < 0.001, `Case A: margin should be ~0.05, got ${testA.margin}`);
assert(testA.marginUnavailable === false, 'Case A: margin should be available');

// Test Case B: Borderline similarity (top1=0.91) => RUN_VISION
console.log('\n=== Test Case B: Borderline Similarity ===');
const testB = decideVisionStrategy({
  embeddingMatches: [
    { similarity: 0.91, discogsId: '12345', metadata: { artist: 'Artist', title: 'Album' } },
    { similarity: 0.88, discogsId: '67890', metadata: { artist: 'Other', title: 'Other' } }
  ],
  datasetSize: 500,
  hasValidIndex: true,
  enableVision: true,
  thresholds: {
    strongAccept: 0.94,
    strongAcceptMargin: 0.04,
    skipVision: 0.92,
    margin: 0.03,
    minDatasetSize: 200
  }
});
assert(testB.decision === 'RUN_VISION', 'Case B: Should return RUN_VISION');
assert(testB.skipReasons && testB.skipReasons.length > 0, 'Case B: Should have skip reasons');
assert(testB.skipReasons.some(r => r.includes('similarity')), 'Case B: Should include similarity reason');

// Test Case C: Cold start (datasetSize=50) even with top1=0.95 => RUN_VISION
console.log('\n=== Test Case C: Cold Start ===');
const testC = decideVisionStrategy({
  embeddingMatches: [
    { similarity: 0.95, discogsId: '12345', metadata: { artist: 'Artist', title: 'Album' } },
    { similarity: 0.90, discogsId: '67890', metadata: { artist: 'Other', title: 'Other' } }
  ],
  datasetSize: 50, // Below minDatasetSize (200)
  hasValidIndex: true,
  enableVision: true,
  thresholds: {
    strongAccept: 0.94,
    strongAcceptMargin: 0.04,
    skipVision: 0.92,
    margin: 0.03,
    minDatasetSize: 200
  }
});
assert(testC.decision === 'RUN_VISION', 'Case C: Should return RUN_VISION (cold start)');
assert(testC.reason.includes('cold_start'), 'Case C: Reason should mention cold start');

// Test Case D: No valid id => RUN_VISION
console.log('\n=== Test Case D: No Valid ID ===');
const testD = decideVisionStrategy({
  embeddingMatches: [
    { similarity: 0.95, discogsId: null, recordId: null, metadata: { artist: 'Artist', title: 'Album' } },
    { similarity: 0.90, discogsId: null, metadata: { artist: 'Other', title: 'Other' } }
  ],
  datasetSize: 500,
  hasValidIndex: true,
  enableVision: true,
  thresholds: {
    strongAccept: 0.94,
    strongAcceptMargin: 0.04,
    skipVision: 0.92,
    margin: 0.03,
    minDatasetSize: 200
  }
});
assert(testD.decision === 'RUN_VISION', 'Case D: Should return RUN_VISION (no valid ID)');
assert(testD.reason === 'no_valid_id', 'Case D: Reason should be no_valid_id');

// Test Case E: Empty matches => RUN_VISION
console.log('\n=== Test Case E: Empty Matches ===');
const testE = decideVisionStrategy({
  embeddingMatches: [],
  datasetSize: 500,
  hasValidIndex: true,
  enableVision: true,
  thresholds: {
    strongAccept: 0.94,
    strongAcceptMargin: 0.04,
    skipVision: 0.92,
    margin: 0.03,
    minDatasetSize: 200
  }
});
assert(testE.decision === 'RUN_VISION', 'Case E: Should return RUN_VISION (empty matches)');
assert(testE.reason === 'no_embedding_matches', 'Case E: Reason should be no_embedding_matches');

// Test Case F: Margin unavailable (only one match) => Should still allow SKIP if margin threshold is 0
console.log('\n=== Test Case F: Margin Unavailable (Single Match) ===');
const testF = decideVisionStrategy({
  embeddingMatches: [
    { similarity: 0.95, discogsId: '12345', metadata: { artist: 'Artist', title: 'Album' } }
  ],
  datasetSize: 500,
  hasValidIndex: true,
  enableVision: true,
  thresholds: {
    strongAccept: 0.94,
    strongAcceptMargin: 0.04, // Requires margin, so should not accept (but skipVision margin is 0)
    skipVision: 0.92,
    margin: 0, // Margin check disabled, so should allow skip
    minDatasetSize: 200
  }
});
// With margin=0, it should skip vision even without top2
assert(testF.decision === 'SKIP_VISION', `Case F: Should return SKIP_VISION (margin disabled), got ${testF.decision}`);
assert(testF.marginUnavailable === true, 'Case F: marginUnavailable should be true');

console.log('\n✅ All tests passed!');

