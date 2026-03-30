/**
 * Identify Record Route
 * 
 * POST /api/identify-record
 * 
 * Identifies a vinyl record from an album cover image.
 * 
 * HTTP Status Code Contract:
 * - 400: Invalid input (missing file, empty file, invalid mime type, file too large)
 * - 200: Valid request - always returns 200 with status field:
 *   - status: 'ok' (high confidence match found)
 *   - status: 'low_confidence' (matches found but low confidence)
 *   - status: 'no_match' (no matches found, but request was valid)
 * - 500: Unexpected server error
 * - 504: Request timeout
 * 
 * Error Response Format:
 * { error: "<code>", message: "<human readable>", details?: {...} }
 */

const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');

const logger = require('../services/logger');
const config = require('../config');
const { generateImageHash } = require('../utils/imageHash');
const { getImageEmbedding } = require('../services/embeddingService');
const { indexCoverEmbedding } = require('../services/vectorIndex');
const { getFeedback, logFeedback } = require('../services/feedbackRepository');
const { AUTO_ACCEPT_THRESHOLD, SUGGESTIONS_THRESHOLD } = require('../services/discogsScoring');
const { identifyRecordLimiter } = require('../middleware/rateLimit');
const { validateMagicBytes } = require('../utils/fileValidation');
const {
  getImageHashCache,
  setImageHashCache,
  getDiscogsReleaseCache,
  setDiscogsReleaseCache,
  getDiscogsSearchCache,
  setDiscogsSearchCache,
} = require('../src/services/cache/identificationCache');

/**
 * Create identify record route
 * 
 * @param {Object} dependencies - Dependencies from server-hybrid.js
 * @param {Function} dependencies.generateCandidatesFromInput
 * @param {Function} dependencies.resolveBestAlbum
 * @param {Function} dependencies.enrichAlbumMetadata
 * @param {Function} dependencies.getScanEmbedding
 * @param {Function} dependencies.storeInLocalDatabase
 * @param {Function} dependencies.ensureRecordEmbedding
 * @param {Object} dependencies.db - Database instance
 * @param {Object} dependencies.upload - Multer upload instance
 * @returns {express.Router} Express router with the route handler
 */
function createIdentifyRecordRoute(dependencies) {
  const router = express.Router();
  const {
    generateCandidatesFromInput,
    resolveBestAlbum,
    enrichAlbumMetadata,
    getScanEmbedding,
    storeInLocalDatabase,
    ensureRecordEmbedding,
    db,
    upload,
  } = dependencies;

  // Wrapper for multer upload to catch errors
  const uploadMiddleware = (req, res, next) => {
    upload.single('image')(req, res, (err) => {
      if (err) {
        if (err instanceof multer.MulterError) {
          if (err.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
              ok: false,
              code: 'FILE_TOO_LARGE',
              message: 'File size exceeds the 10MB limit',
              retryable: false,
              // Legacy fields for backward compatibility
              error: 'FILE_TOO_LARGE',
              success: false,
            });
          }
          // Other multer errors
          return res.status(400).json({
            ok: false,
            code: 'INVALID_INPUT',
            message: err.message || 'File upload error',
            retryable: false,
            // Legacy fields for backward compatibility
            error: 'INVALID_INPUT',
            success: false,
          });
        }
        if (err.message && err.message.includes('Only image files are allowed')) {
          return res.status(400).json({
            ok: false,
            code: 'INVALID_FILE_TYPE',
            message: 'Only image files are allowed (JPEG, PNG, GIF, WebP, HEIC)',
            retryable: false,
            // Legacy fields for backward compatibility
            error: 'INVALID_FILE_TYPE',
            success: false,
          });
        }
        return next(err);
      }
      next();
    });
  };

  router.post('/', identifyRecordLimiter, uploadMiddleware, async (req, res) => {
    // PR1: Generate UUID request ID for better traceability
    const reqId = uuidv4();
    const t0 = Date.now();
    
    // PR1: Initialize timings object
    const timings = {
      preprocessMs: 0,
      visionMs: 0,
      discogsMs: 0,
      totalMs: 0,
    };
    
    // 3) Timeout constants
    const EMBEDDING_TIMEOUT_MS = config.embedding.timeoutMs;
    const VECTOR_SEARCH_TIMEOUT_MS = config.embedding.vectorSearchTimeoutMs;
    const VISION_TIMEOUT_MS = config.googleVision.timeoutMs;
    const DISCOGS_FETCH_TIMEOUT_MS = config.discogs.fetchTimeoutMs; // 12 seconds per call
    const DISCOGS_SEARCH_TIMEOUT_MS = config.discogs.searchTimeoutMs; // 12 seconds per call
    // PR0: Per-request timeout budget (10-12 seconds for total request)
    const REQUEST_DEADLINE_MS = parseInt(process.env.REQUEST_DEADLINE_MS || '12000', 10); // 12s deadline
    const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '12000', 10); // 12s server-side timeout
    
    // Log START immediately (info level - key event)
    logger.info(`[REQ ${reqId}] START /api/identify-record`);
    
    // 3) Propagate global deadline through entire request
    // Create request-scoped AbortController for deadline propagation
    const reqController = new AbortController();
    const requestDeadline = Date.now() + REQUEST_DEADLINE_MS;
    const deadlineTimer = setTimeout(() => {
      const elapsed = Date.now() - t0;
      logger.warn(`[REQ ${reqId}] request_abort event=deadline elapsed=${elapsed}ms`);
      if (!res.writableEnded) {
        reqController.abort();
      }
    }, REQUEST_DEADLINE_MS);
    
    // 1) Abort on true client abort during upload (req.aborted event) - ONLY event that triggers abort
    req.on('aborted', () => {
      const elapsed = Date.now() - t0;
      logger.debug(`[REQ ${reqId}] request_abort event=aborted elapsed=${elapsed}ms res.writableEnded=${res.writableEnded}`);
      if (!res.writableEnded) {
        reqController.abort();
        clearTimeout(deadlineTimer);
        clearTimeout(hardTimeout);
      }
    });
    
    // 2) Log response close (for debugging) - DO NOT abort here
    res.on('close', () => {
      const elapsed = Date.now() - t0;
      const writableEnded = res.writableEnded;
      logger.debug(`[REQ ${reqId}] response_close event=res_close elapsed=${elapsed}ms res.writableEnded=${writableEnded}`);
      // Logging only - no abort behavior
    });
    
    // 3) Log successful response completion and clear timers
    res.on('finish', () => {
      const elapsed = Date.now() - t0;
      const statusCode = res.statusCode || 'N/A';
      logger.debug(`[REQ ${reqId}] request_finish elapsed=${elapsed}ms statusCode=${statusCode}`);
      clearTimeout(deadlineTimer);
      clearTimeout(hardTimeout);
    });
    
    // 2) Request-level timeout safety net (fallback if deadline doesn't fire)
    let timeoutFired = false;
    const hardTimeout = setTimeout(() => {
      const elapsed = Date.now() - t0;
      logger.error(`[REQ ${reqId}] HARD TIMEOUT after ${REQUEST_TIMEOUT_MS}ms elapsed=${elapsed}ms`);
      
      if (!res.headersSent && !res.writableEnded) {
        res.status(504).json({
          ok: false,
          code: 'TIMEOUT',
          message: 'Request timeout - operation took too long',
          retryable: true,
          debug: { timeoutMs: REQUEST_TIMEOUT_MS, reqId },
          // Legacy fields for backward compatibility
          error: 'TIMEOUT',
          details: { timeoutMs: REQUEST_TIMEOUT_MS, reqId }
        });
        res.set('Connection', 'close');
      }
      // Ensure the socket closes
      try { res.end(); } catch (e) {}
      // Also abort request controller if response not finished
      if (!res.writableEnded) {
        reqController.abort();
      }
    }, REQUEST_TIMEOUT_MS);
    
    // 4) Upload parse step logging
    let imageBuffer = null;
    let imageHash = null;
    let tempFilePath = null; // Track temp file path for cleanup
    
    // Multer middleware runs before this handler, so req.file is already parsed
    if (!req.file) {
      clearTimeout(hardTimeout);
      logger.warn(`[REQ ${reqId}] parse_upload FAIL missing_or_empty`);
      return res.status(400).json({
        ok: false,
        code: 'NO_FILE',
        message: 'Please provide an image file in the request',
        retryable: false,
        // Legacy fields for backward compatibility
        error: 'NO_FILE',
        success: false
      });
    }
    
    const fileSizeBytes = req.file.size;
    const fileMime = req.file.mimetype || 'unknown';
    
    if (fileSizeBytes === 0) {
      clearTimeout(hardTimeout);
      logger.warn(`[REQ ${reqId}] parse_upload FAIL missing_or_empty`);
      // Cleanup temp file if it exists
      tempFilePath = req.file.path;
      try {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      return res.status(400).json({
        ok: false,
        code: 'EMPTY_FILE',
        message: 'The uploaded file is empty',
        retryable: false,
        // Legacy fields for backward compatibility
        error: 'EMPTY_FILE',
        success: false
      });
    }
    
    // Upload parse OK (debug level - detailed info)
    logger.debug(`[REQ ${reqId}] parse_upload OK fileSizeBytes=${fileSizeBytes} mime=${fileMime}`);
    
    // Read file from disk (multer.diskStorage stores to req.file.path)
    // This reduces memory pressure compared to memoryStorage during concurrent uploads
    tempFilePath = req.file.path;
    try {
      imageBuffer = fs.readFileSync(tempFilePath);
      logger.debug(`[REQ ${reqId}] ✅ Read ${imageBuffer.length} bytes from temp file: ${path.basename(tempFilePath)}`);
    } catch (readError) {
      clearTimeout(hardTimeout);
      logger.error(`[REQ ${reqId}] ❌ Failed to read temp file: ${readError.message}`);
      // Try to cleanup temp file even if read failed
      try {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      return res.status(500).json({
        ok: false,
        code: 'INTERNAL_ERROR',
        message: 'Failed to read uploaded file',
        retryable: true,
        // Legacy fields for backward compatibility
        error: 'INTERNAL_ERROR',
        success: false
      });
    }
    
    // PR0: Magic byte validation to prevent spoofed files
    try {
      const magicValidation = validateMagicBytes(imageBuffer, fileMime);
      if (!magicValidation.valid) {
        clearTimeout(hardTimeout);
        logger.warn(`[REQ ${reqId}] ❌ Magic byte validation failed: ${magicValidation.reason}`);
        // Cleanup temp file
        try {
          if (tempFilePath && fs.existsSync(tempFilePath)) {
            fs.unlinkSync(tempFilePath);
          }
        } catch (cleanupError) {
          // Ignore cleanup errors
        }
        return res.status(400).json({
          ok: false,
          code: 'INVALID_FILE_TYPE',
          message: magicValidation.reason || 'File type validation failed',
          retryable: false,
          // Legacy fields for backward compatibility
          error: 'INVALID_FILE_TYPE',
          success: false
        });
      }
      logger.debug(`[REQ ${reqId}] ✅ Magic byte validation passed (detected: ${magicValidation.detectedType || fileMime})`);
    } catch (validationError) {
      clearTimeout(hardTimeout);
      logger.error(`[REQ ${reqId}] ❌ Magic byte validation error: ${validationError.message}`);
      // Cleanup temp file
      try {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      return res.status(400).json({
        ok: false,
        code: 'VALIDATION_ERROR',
        message: 'File validation failed',
        retryable: false,
        // Legacy fields for backward compatibility
        error: 'VALIDATION_ERROR',
        success: false
      });
    }
    
    imageHash = generateImageHash(imageBuffer);
    
    // PR2: Cache A check - if we have a cached result, return immediately
    const cachedResult = getImageHashCache(imageHash);
    if (cachedResult) {
      clearTimeout(hardTimeout);
      logger.info(`[REQ ${reqId}] ✅ Cache A HIT (imageHash: ${imageHash.substring(0, 8)}...)`);
      
      // PR1: Add requestId and timings to cached response
      const cacheTimings = {
        preprocessMs: 0,
        visionMs: 0,
        discogsMs: 0,
        totalMs: Date.now() - t0, // Cache hit is very fast
      };
      
      // Add cache hit info to response
      const response = {
        ...cachedResult,
        // PR1: Add requestId and timings
        requestId: reqId,
        timings: cacheTimings,
        debug: {
          ...cachedResult.debug,
          cacheHit: 'imageHash',
          requestId: reqId,
        }
      };
      
      // Cleanup temp file
      try {
        if (tempFilePath && fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (cleanupError) {
        // Ignore cleanup errors
      }
      
      return res.status(200).json(response);
    }
    
    const debugInfo = {
      requestId: reqId, // Always use reqId
      inputType: null,
      imageSize: null,
      imageMimeType: null,
      imageDimensions: null,
      visionProcessing: null,
      candidatesExtracted: 0, // Will be updated after candidate generation
      candidateCount: 0, // Will be updated after candidate generation
      discogsSearches: 0,
      discogsDirectFetches: 0, // NEW: Track direct fetch-by-ID calls
      localDbChecks: 0,
      musicbrainzSearches: 0,
      musicbrainzUsed: false,
      coverArtArchiveUsed: false,
      rawOcrText: null,
      sourcesUsed: [],
      lowConfidence: false,
      errors: [],
      visionResult: null, // Store VisionResult for frontend
      fastPathUsed: false, // NEW: Track if fast path was used
      fastPathType: null, // NEW: Which fast path (barcode, embedding, local_db)
      // PR2: Cache and skip-work tracking
      cacheHit: null, // Will be set to 'imageHash', 'discogsRelease', 'titleArtist', or null
      visionUsed: false,
      discogsUsed: false,
      performanceMetrics: {
        phase1Time: null,
        phase2Time: null,
        phase3Time: null,
        totalTime: null,
        embeddingTime: null,
        visionTime: null,
        preprocessMs: null,
        discogsMs: null,
      },
    };

    try {
      // imageBuffer and imageHash already set in parse_upload phase above

      // PHASE 1: Generate Candidates from Input
      let candidates = [];
      try {
        const phase1Start = Date.now();
        logger.debug(`[REQ ${reqId}] phase1_start`);
        // Ensure debugInfo.requestId is always reqId
        debugInfo.requestId = reqId;
        debugInfo.requestDeadline = requestDeadline;
        debugInfo.reqControllerSignal = reqController.signal;
        candidates = await generateCandidatesFromInput(req, imageBuffer, debugInfo);
        const phase1Time = Date.now() - phase1Start;
        debugInfo.candidateCount = candidates.length;
        debugInfo.candidatesExtracted = candidates.length;
        debugInfo.phase1Time = phase1Time;
        logger.debug(`[REQ ${reqId}] phase1_complete elapsed=${phase1Time}ms candidates=${candidates.length}`);
      } catch (phase1Error) {
        const phase1Time = Date.now() - (Date.now() - (debugInfo.phase1Time || 0));
        logger.error(`[REQ ${reqId}] ERROR phase1 elapsed=${phase1Time}ms`, phase1Error);
        if (phase1Error.message.includes('barcode') || phase1Error.message.includes('No')) {
          return res.status(400).json({
            ok: false,
            code: 'INVALID_INPUT',
            message: phase1Error.message,
            retryable: false,
            debug: { phase: 'phase1', ...debugInfo },
            // Legacy fields for backward compatibility
            error: 'INVALID_INPUT',
            details: { phase: 'phase1' },
            success: false,
          });
        }
        throw phase1Error;
      }

      // Check for user feedback first (if imageHash exists)
      let feedbackMatch = null;
      if (imageHash) {
        try {
          feedbackMatch = await getFeedback(imageHash);
          if (feedbackMatch && feedbackMatch.finalDiscogsId) {
            logger.debug(`[API] ✅ Found user feedback for this image - using previous selection`);
          }
        } catch (feedbackError) {
          logger.warn(`[API] ⚠️  Feedback lookup failed: ${feedbackError.message}`);
        }
      }

      // PHASE 2: Resolve Best Album from Candidates
      const phase2Start = Date.now();
      logger.debug(`[REQ ${reqId}] phase2_start candidates=${candidates.length}`);
      // Ensure debugInfo.requestId is always reqId
      debugInfo.requestId = reqId;
      debugInfo.requestDeadline = requestDeadline;
      debugInfo.reqControllerSignal = reqController.signal;
      const bestAlbum = await resolveBestAlbum(candidates, imageHash, debugInfo, feedbackMatch, imageBuffer, reqId, reqController.signal);
      const phase2Time = Date.now() - phase2Start;
      debugInfo.phase2Time = phase2Time;
      logger.debug(`[REQ ${reqId}] phase2_complete elapsed=${phase2Time}ms`);

      // Handle Phase 2 return format (may be structured error response)
      if (!bestAlbum || (bestAlbum.success === false && (bestAlbum.reason === 'NO_CONFIRMED_DISCOGS_MATCH' || bestAlbum.reason === 'PHASE2_BUDGET_EXCEEDED'))) {
        // No album identified - return structured error with suggestions
        clearTimeout(hardTimeout);
        debugInfo.processingTime = Date.now() - t0;
        
        // If Phase 2 returned structured error, use it
        if (bestAlbum && (bestAlbum.reason === 'NO_CONFIRMED_DISCOGS_MATCH' || bestAlbum.reason === 'PHASE2_BUDGET_EXCEEDED')) {
          logger.debug(`[REQ ${reqId}] Phase2 returned: ${bestAlbum.reason} (tried ${bestAlbum.candidatesTried} candidates)`);
        }
        
        // NEW: Use suggestions from scoring system if available
        const albumSuggestions = [];
        if (debugInfo.suggestions && debugInfo.suggestions.length > 0) {
          // Use scored suggestions from new system
          logger.debug(`[API] Found ${debugInfo.suggestions.length} suggestions in debugInfo.suggestions`);
          for (const suggestion of debugInfo.suggestions) {
            // Include suggestions with discogsId OR with a valid score (even if discogsId is missing)
            if (suggestion.discogsId || (suggestion.score && suggestion.score > 0)) {
              albumSuggestions.push({
                artist: suggestion.artist || null,
                albumTitle: suggestion.title || null,
                releaseYear: suggestion.year || null,
                discogsId: suggestion.discogsId || null,
                confidence: suggestion.score || 0.5,
                source: 'discogs_scored',
              });
            }
          }
          logger.debug(`[API] Added ${albumSuggestions.length} suggestions from debugInfo.suggestions`);
        } else {
          logger.debug(`[API] No suggestions in debugInfo.suggestions, using fallback candidates`);
          // Fallback: Build from candidates (legacy)
          const seenDiscogsIds = new Set();
          const rawCandidates = candidates || [];
          for (const candidate of rawCandidates) {
            if (candidate.discogsId && !seenDiscogsIds.has(candidate.discogsId)) {
              const source = candidate.source || '';
              const badSources = ['web_page', 'amazon', 'ebay', 'wikipedia', 'store', 'url', 'page_title'];
              if (badSources.some(bad => source.toLowerCase().includes(bad))) {
                continue;
              }
              seenDiscogsIds.add(candidate.discogsId);
              albumSuggestions.push({
                artist: candidate.artist?.trim() || null,
                albumTitle: candidate.title?.trim() || null,
                releaseYear: candidate.year || null,
                discogsId: candidate.discogsId,
                confidence: candidate.confidence || 0.5,
                source: 'discogs',
              });
            }
          }
        }
        
        // Sort by confidence (highest first)
        albumSuggestions.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
        
        logger.debug(`[API] Built ${albumSuggestions.length} canonical album suggestions (from scoring system or candidates)`);
        logger.debug(`[API] Debug: debugInfo.suggestions.length=${debugInfo.suggestions?.length || 0}, albumSuggestions.length=${albumSuggestions.length}`);

        // CRITICAL: Always return 200 after input validation (low_confidence and no_match are valid responses)
        // HTTP 400 is only for invalid request input (missing file, invalid mime, etc.) - handled earlier
        const hasSuggestions = albumSuggestions.length > 0;
        const statusCode = 200; // Always 200 for valid requests with results (even if no_match)
        logger.debug(`[API] Setting statusCode=${statusCode} (hasSuggestions=${hasSuggestions})`);
        
        // Determine confidence level and status based on best suggestion score
        let confidenceLevel = 'low';
        let responseStatus = 'no_match'; // Default to no_match if no suggestions
        const bestScore = albumSuggestions.length > 0 ? (albumSuggestions[0].confidence || 0) : 0;
        
        // Only set status to 'ok' if we have valid suggestions with non-zero scores
        if (hasSuggestions && bestScore > 0) {
          if (bestScore >= AUTO_ACCEPT_THRESHOLD) {
            confidenceLevel = 'high';
            responseStatus = 'ok';
          } else if (bestScore >= SUGGESTIONS_THRESHOLD) {
            confidenceLevel = 'medium';
            responseStatus = 'ok';
          } else {
            confidenceLevel = 'low';
            responseStatus = 'low_confidence'; // Low confidence but still return 200 with suggestions
          }
        } else {
          // No suggestions or invalid/zero scores - status is 'no_match'
          responseStatus = 'no_match';
          confidenceLevel = 'low';
        }
        
        // Determine error code only for true failures (no suggestions) - informational only, doesn't change HTTP status
        let errorCode = null;
        if (!hasSuggestions) {
          if (debugInfo.phase1Failed) {
            errorCode = 'VISION_FAILED';
          } else if (debugInfo.phase2Failed) {
            errorCode = 'DISCOGS_FAILED';
          } else {
            errorCode = 'NO_CANDIDATES';
          }
        }

        // Build debug info with thresholds and scores (only if DEBUG_IDENTIFY=true)
        const debugOutput = config.logging.debugIdentify ? {
          ...debugInfo,
          scoring: {
            bestScore: bestScore,
            autoAcceptThreshold: AUTO_ACCEPT_THRESHOLD,
            suggestionsThreshold: SUGGESTIONS_THRESHOLD,
            responseType: debugInfo.responseType || null,
            reasons: {
              belowAutoAccept: bestScore < AUTO_ACCEPT_THRESHOLD,
              belowSuggestions: bestScore < SUGGESTIONS_THRESHOLD,
              hasSuggestions: hasSuggestions,
            },
          },
        } : debugInfo;

        // PR0: Include degraded mode info in response
        const visionAvailable = config.googleVision.available && config.googleVision.enabled;
        
        // PR2: Calculate timings
        const totalTime = Date.now() - t0;
        const timings = {
          preprocessMs: debugInfo.performanceMetrics.preprocessMs || 0,
          visionMs: debugInfo.performanceMetrics.visionTime || 0,
          discogsMs: debugInfo.performanceMetrics.discogsMs || 0,
          totalMs: totalTime,
        };
        
        // CRITICAL: Frontend requires bestMatch with artist and title fields
        // Use first suggestion if available, otherwise provide fallback
        const firstSuggestion = albumSuggestions.length > 0 ? albumSuggestions[0] : null;
        const bestMatchArtist = firstSuggestion?.artist || 'Unknown Artist';
        const bestMatchTitle = firstSuggestion?.albumTitle || 'Unknown Album';
        
        const response = {
          status: responseStatus, // 'ok', 'low_confidence', or 'no_match' - always included
          confidenceLevel: confidenceLevel, // 'high', 'medium', or 'low' - always included
          suggestions: albumSuggestions, // Always included (empty array if no_match)
          best: hasSuggestions && bestScore >= AUTO_ACCEPT_THRESHOLD ? albumSuggestions[0] : null,
          // PR1: Add requestId and timings
          requestId: reqId,
          timings,
          // PR0: Degraded mode indicator + PR2: Cache and skip-work info
          debug: {
            ...debugOutput,
            visionAvailable: visionAvailable, // Indicates if Google Vision was available
            cacheHit: debugInfo.cacheHit || null, // 'imageHash', 'discogsRelease', 'titleArtist', or null
            visionUsed: debugInfo.visionUsed || false,
            discogsUsed: debugInfo.discogsUsed || false,
          },
          // Legacy fields for backward compatibility
          success: hasSuggestions,
          albumSuggestions: albumSuggestions,
          hasCandidates: hasSuggestions,
          candidatesCount: albumSuggestions.length,
          // CRITICAL: Frontend requires bestMatch with artist and title (always present)
          bestMatch: {
            artist: bestMatchArtist,
            title: bestMatchTitle,
            year: firstSuggestion?.releaseYear || null,
            coverImageRemoteUrl: firstSuggestion?.coverImageUrl || null,
            discogsId: firstSuggestion?.discogsId || null,
            tracks: firstSuggestion?.tracks || [],
            confidence: bestScore,
            source: firstSuggestion?.source || 'api',
          },
          alternates: [], // Empty for now, can be populated if needed
          // Error fields (only if no suggestions)
          ...(errorCode ? {
            code: errorCode,
            error: 'Could not identify record',
            message: 'Please try manual entry or ensure the album cover is clear and well-lit',
          } : {
            message: hasSuggestions 
              ? (responseStatus === 'low_confidence' 
                ? 'Found possible matches with low confidence. Please review or enter manually.'
                : 'Please review the suggested album matches or enter manually.')
              : 'Could not identify record with sufficient confidence',
          }),
          // Keep extracted text for debugging only (not shown to user)
          hasExtractedText: !!debugInfo.rawOcrText,
          extractedText: debugInfo.rawOcrText ? debugInfo.rawOcrText.substring(0, 500) : null,
          // Legacy field for backward compatibility (deprecated - use suggestions)
          candidates: [],
          discogsSuggestions: albumSuggestions,
        };

        // CRITICAL: Log before sending response to verify status code
        logger.debug(`[API] Sending response with statusCode=${statusCode}, hasSuggestions=${hasSuggestions}, suggestionsCount=${albumSuggestions.length}`);
        
        // PR2: Cache A - Store successful identification result
        if (hasSuggestions && imageHash) {
          setImageHashCache(imageHash, response);
          logger.debug(`[REQ ${reqId}] ✅ Cached identification result (imageHash: ${imageHash.substring(0, 8)}...)`);
        }
        
        return res.status(statusCode).json(response);
      }

      // PHASE 3: Enrich Album Metadata
      const phase3Start = Date.now();
      logger.debug(`[REQ ${reqId}] phase3_start`);
      const primaryMatch = await enrichAlbumMetadata(bestAlbum, debugInfo);
      const phase3Time = Date.now() - phase3Start;
      debugInfo.phase3Time = phase3Time;
      debugInfo.performanceMetrics.phase3Time = phase3Time;
      logger.debug(`[REQ ${reqId}] phase3_complete elapsed=${phase3Time}ms`);
      
      // Store in local database for caching
      // CRITICAL: Always use HQ cover art from API, never user photo
      if (primaryMatch.discogsId || primaryMatch.coverImageUrl) {
        await storeInLocalDatabase({
          artist: primaryMatch.artist,
          title: primaryMatch.title,
          year: primaryMatch.year,
          // ALWAYS use HQ cover art from API, never user photo
          coverImageRemoteUrl: primaryMatch.coverImageUrl || null,
          discogsId: primaryMatch.discogsId || null
        }, null);

        // NEW: Index embedding for future similarity search (persist to database)
        // Strategy: Use user scan embedding if available, otherwise generate from cover image URL
        if (primaryMatch.discogsId) {
          try {
            let embedding = null;
            
            // Prefer user scan embedding (more accurate for this specific copy)
            // IMPORTANT: preprocessing must match scan+index (applied via getScanEmbedding -> getImageEmbedding -> getCLIPEmbedding)
            if (imageBuffer) {
              embedding = await getScanEmbedding(imageBuffer, debugInfo, reqId);
            }
            
            // Fallback: Generate from cover image URL if scan embedding failed
            // IMPORTANT: preprocessing must match scan+index (applied via getImageEmbedding -> getCLIPEmbedding)
            if (!embedding && primaryMatch.coverImageUrl) {
              logger.debug(`[API] 📥 Generating embedding from cover image URL for Discogs ID: ${primaryMatch.discogsId}`);
              try {
                const response = await axios.get(primaryMatch.coverImageUrl, {
                  responseType: 'arraybuffer',
                  timeout: 10000,
                });
                const coverImageBuffer = Buffer.from(response.data);
                // getImageEmbedding applies preprocessing via getCLIPEmbedding (same as scan path)
                embedding = await getImageEmbedding(coverImageBuffer);
                
                // CRITICAL: Validate embedding before storing (getImageEmbedding already validates)
                if (!embedding) {
                  logger.warn(`[API] ⚠️  Failed to generate embedding from cover image URL, skipping ensureRecordEmbedding`);
                } else {
                  // Store it using ensureRecordEmbedding (which will also validate)
                  const stored = await ensureRecordEmbedding(
                    primaryMatch.discogsId,
                    primaryMatch.coverImageUrl,
                    {
                      artist: primaryMatch.artist,
                      title: primaryMatch.title,
                      year: primaryMatch.year,
                      discogsId: primaryMatch.discogsId,
                    }
                  );
                  if (!stored) {
                    logger.warn(`[API] ⚠️  ensureRecordEmbedding returned false for Discogs ID: ${primaryMatch.discogsId}`);
                  }
                }
              } catch (coverImageError) {
                logger.warn(`[API] ⚠️  Failed to generate embedding from cover image URL: ${coverImageError.message}`);
              }
            }
            
            // CRITICAL: Validate embedding before storing (getImageEmbedding/getScanEmbedding already validate, but double-check)
            if (!embedding) {
              logger.debug(`[API] ⚠️  No valid embedding to index for Discogs ID: ${primaryMatch.discogsId}`);
            } else {
              try {
                await indexCoverEmbedding(
                  primaryMatch.discogsId,
                  embedding,
                  {
                    artist: primaryMatch.artist,
                    title: primaryMatch.title,
                    year: primaryMatch.year,
                    discogsId: primaryMatch.discogsId,
                  },
                  db // Pass database for persistence
                );
                logger.debug(`[API] ✅ Indexed embedding for Discogs ID: ${primaryMatch.discogsId}`);
              } catch (indexError) {
                logger.warn(`[API] ⚠️  Failed to index embedding: ${indexError.message}`);
                // Non-critical - continue without embedding index
              }
            }
          } catch (embeddingError) {
            logger.warn(`[API] ⚠️  Failed to index embedding: ${embeddingError.message}`);
            // Non-critical - continue without embedding
          }
        }
      }

      // GPT REMOVED – embedding storage not used in core SlotSync backend

      // PR1: Calculate timings for success response
      const totalTime = Date.now() - t0;
      debugInfo.processingTime = totalTime;
      debugInfo.performanceMetrics.totalTime = totalTime;
      const successTimings = {
        preprocessMs: debugInfo.performanceMetrics.preprocessMs || 0,
        visionMs: debugInfo.performanceMetrics.visionTime || 0,
        discogsMs: debugInfo.performanceMetrics.discogsMs || 0,
        totalMs: totalTime,
      };

      // Format success response - clean JSON matching SlotSync frontend expectations
      // Support both new format (for orchestrator) and legacy format (for barcode/backward compatibility)
      const confidence = primaryMatch?.confidence || 0;
      let confidenceLevel = 'low';
      let responseStatus = 'ok';
      
      // Check if we actually have a valid match (primaryMatch exists and has required fields)
      const hasValidMatch = primaryMatch && primaryMatch.artist && primaryMatch.title;
      
      // Determine status and confidence level based on score
      if (!hasValidMatch || confidence === 0) {
        // No valid match - return no_match
        confidenceLevel = 'low';
        responseStatus = 'no_match';
      } else if (confidence >= AUTO_ACCEPT_THRESHOLD) {
        confidenceLevel = 'high';
        responseStatus = 'ok';
      } else if (confidence >= SUGGESTIONS_THRESHOLD) {
        confidenceLevel = 'medium';
        responseStatus = 'ok'; // Still 'ok' but with suggestions
      } else {
        confidenceLevel = 'low';
        responseStatus = 'low_confidence'; // Low confidence but still return 200
      }
      
      // Build suggestions array if we have them in debugInfo
      const suggestions = [];
      if (debugInfo.suggestions && debugInfo.suggestions.length > 0) {
        for (const suggestion of debugInfo.suggestions) {
          if (suggestion.discogsId || (suggestion.score && suggestion.score > 0)) {
            suggestions.push({
              artist: suggestion.artist || null,
              albumTitle: suggestion.title || null,
              releaseYear: suggestion.year || null,
              discogsId: suggestion.discogsId || null,
              confidence: suggestion.score || 0.5,
              source: 'discogs_scored',
            });
          }
        }
        // Sort by confidence (highest first)
        suggestions.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
      }
      
      // Build debug info with thresholds and scores (only if DEBUG_IDENTIFY=true)
      const debugOutput = config.logging.debugIdentify ? {
        ...debugInfo,
        scoring: {
          bestScore: confidence,
          autoAcceptThreshold: AUTO_ACCEPT_THRESHOLD,
          suggestionsThreshold: SUGGESTIONS_THRESHOLD,
          responseType: debugInfo.responseType || null,
          reasons: {
            belowAutoAccept: confidence < AUTO_ACCEPT_THRESHOLD,
            belowSuggestions: confidence < SUGGESTIONS_THRESHOLD,
            hasSuggestions: suggestions.length > 0,
          },
        },
      } : debugInfo;
      
      // Ensure bestMatch always has valid artist and title (required by frontend)
      // If no valid match, use first suggestion or provide fallback
      let bestMatchArtist = primaryMatch?.artist || (suggestions.length > 0 ? suggestions[0]?.artist : 'Unknown Artist');
      let bestMatchTitle = primaryMatch?.title || (suggestions.length > 0 ? suggestions[0]?.albumTitle : 'Unknown Album');
      
      const response = {
        status: responseStatus, // 'ok' or 'low_confidence'
        confidenceLevel: confidenceLevel, // 'high', 'medium', or 'low'
        // PR1: Add requestId and timings
        requestId: reqId,
        timings: successTimings,
        best: primaryMatch && primaryMatch.confidence >= AUTO_ACCEPT_THRESHOLD ? {
          artist: primaryMatch.artist,
          albumTitle: primaryMatch.title,
          releaseYear: primaryMatch.year || null,
          discogsId: primaryMatch.discogsId || null,
          confidence: confidence,
        } : null,
        suggestions: suggestions, // Include suggestions even for confirmed matches if available
        success: true,
        confidence: confidence,
        artist: primaryMatch?.artist || bestMatchArtist,
        albumTitle: primaryMatch?.title || bestMatchTitle,
        releaseYear: primaryMatch?.year || null,
        discogsId: primaryMatch?.discogsId || null,
        coverImageUrl: primaryMatch?.coverImageUrl || null,
        tracks: (primaryMatch?.tracks || []).map(track => ({
          position: track.position || track.trackNumber || 0,
          title: track.title,
          side: track.side || null,
          discNumber: track.discNumber || null,
          durationSeconds: track.durationSeconds || null,
        })),
        // Include visionResult for frontend candidate extraction
        visionResult: debugInfo.visionResult || null,
        // Legacy format for backward compatibility (barcode scanning, etc.)
        // CRITICAL: bestMatch must always have artist and title (frontend requirement)
        bestMatch: {
          artist: bestMatchArtist,
          title: bestMatchTitle,
          year: primaryMatch?.year || null,
          coverImageRemoteUrl: primaryMatch?.coverImageUrl || null,
          discogsId: primaryMatch?.discogsId || null,
          tracks: (primaryMatch?.tracks || []).map(track => ({
            title: track.title,
            trackNumber: track.position || track.trackNumber || 0,
            side: track.side || null,
            discNumber: track.discNumber || null,
            durationSeconds: track.durationSeconds || null,
          })),
          confidence: confidence,
          source: primaryMatch?.source || 'api',
        },
        alternates: [], // Empty for now, can be populated if needed
        debug: debugOutput,
      };

      // CRITICAL: Log to confirm we're using HQ cover art from API, never user photo
      logger.debug(`[API] ✅ Final response: coverImageUrl=${response.coverImageUrl ? 'SET (HQ from API)' : 'NULL (no API art found)'}`);
      logger.debug(`[API] ✅ User photo was NEVER used as final cover art`);
      
      // Log before response send
      logger.debug(`[REQ ${reqId}] before_response_send`);
      
      // 5) Exactly ONE JSON decision log per scan
      // Phase 2A+: ScanDecision JSON log (one per scan)
      // IMPORTANT: This is the single source of truth for decision logging
      const scanDecisionLog = {
        timestamp: new Date().toISOString(),
        decision: debugInfo.visionDecision || (debugInfo.visionSkipped ? 'SKIP_VISION' : 'RUN_VISION'),
        reason: debugInfo.visionDecisionReason || debugInfo.visionSkipReason || 'default',
        topEmbeddingSimilarity: debugInfo.visionSkipTop1Similarity || debugInfo.embeddingMatches?.[0]?.similarity || null,
        top1Sim: debugInfo.visionSkipTop1Similarity || debugInfo.embeddingMatches?.[0]?.similarity || null, // Alias for compatibility
        top2Similarity: debugInfo.visionSkipTop2Similarity || (debugInfo.embeddingMatches?.length > 1 ? debugInfo.embeddingMatches[1].similarity : null),
        top2Sim: debugInfo.visionSkipTop2Similarity || (debugInfo.embeddingMatches?.length > 1 ? debugInfo.embeddingMatches[1].similarity : null), // Alias for compatibility
        margin: debugInfo.visionSkipMargin !== undefined ? debugInfo.visionSkipMargin : (debugInfo.embeddingMatches?.length > 1 ? (debugInfo.embeddingMatches[0].similarity - debugInfo.embeddingMatches[1].similarity) : null),
        marginUnavailable: debugInfo.visionSkipMarginUnavailable || false,
        top1Id: debugInfo.visionSkipTop1Id || debugInfo.embeddingMatches?.[0]?.discogsId || debugInfo.embeddingMatches?.[0]?.recordId || null,
        datasetSize: debugInfo.datasetSize || null,
        indexName: debugInfo.indexName || 'album_cover_embeddings',
        visionCalled: !!debugInfo.visionResult,
        finalDiscogsId: primaryMatch.discogsId || null,
        finalTitle: primaryMatch.title || null,
        finalArtist: primaryMatch.artist || null,
        latencyMs: debugInfo.processingTime,
        skipReasons: debugInfo.visionSkipReasons || null,
      };
      // 5) Exactly ONE JSON decision log per scan (no duplicates)
      logger.debug(`[ScanDecision] ${JSON.stringify(scanDecisionLog)}`);
      
      // Optional: Append to file if SCAN_DECISION_LOG_PATH is set (same log, just to file)
      const logPath = config.logging.scanDecisionLogPath;
      if (logPath) {
        try {
          const logDir = path.dirname(logPath);
          if (!fs.existsSync(logDir)) {
            fs.mkdirSync(logDir, { recursive: true });
          }
          fs.appendFileSync(logPath, JSON.stringify(scanDecisionLog) + '\n', { encoding: 'utf8' });
        } catch (fileError) {
          // Non-blocking: log error but don't break request
          logger.warn(`[ScanDecision] ⚠️  Failed to write to log file ${logPath}: ${fileError.message}`);
        }
      }

      // NEW: Log user feedback (will be confirmed when user clicks "Looks Good")
      // For now, we log the identification result
      // When frontend confirms, it should call a feedback endpoint
      if (imageHash && primaryMatch.discogsId) {
        try {
          const candidates = debugInfo.suggestions || [];
          // Get scan embedding for feedback logging
          let scanEmbedding = null;
          if (imageBuffer) {
            try {
              scanEmbedding = await getScanEmbedding(imageBuffer, {}, reqId);
              // Store embedding hash (first 16 values) for reference (not full vector)
              if (scanEmbedding) {
                scanEmbedding = scanEmbedding.slice(0, 16).map(v => v.toFixed(4)).join(',');
              }
            } catch (e) {
              // Non-critical
            }
          }
          
          await logFeedback({
            imageHash,
            finalRecordId: null,
            finalDiscogsId: String(primaryMatch.discogsId),
            candidates: candidates.map(c => ({
              artist: c.artist,
              title: c.title,
              discogsId: c.discogsId,
              score: c.score || 0,
              embeddingSimilarity: c.embeddingSimilarity || null,  // ✅ Include embedding similarity
            })),
            visionSummary: {
              ocrText: debugInfo.rawOcrText ? debugInfo.rawOcrText.substring(0, 200) : null,
              webEntitiesCount: debugInfo.webEntities || 0,
            },
            ocrSummary: debugInfo.ocrParsed || {},
            embeddingSummary: {  // ✅ NEW: Include embedding info
              embeddingComputed: debugInfo.embeddingComputed || false,
              embeddingNeighborsCount: debugInfo.embeddingNeighborsCount || 0,
              embeddingFallbackUsed: debugInfo.embeddingFallbackUsed || false,
              scanEmbeddingHash: scanEmbedding,  // First 16 values as reference
              topEmbeddingSimilarity: debugInfo.embeddingMatches?.[0]?.similarity || null,
            },
            source: 'scan',
          });
          logger.debug(`[API] ✅ Logged identification feedback for future learning`);
        } catch (feedbackError) {
          logger.warn(`[API] ⚠️  Failed to log feedback: ${feedbackError.message}`);
          // Non-critical - continue
        }
      }

      // E) Always log END with total time
      clearTimeout(hardTimeout);
      clearTimeout(deadlineTimer);
      const statusCode = 200;
      logger.debug(`[REQ ${reqId}] END status=${statusCode} totalMs=${totalTime}`);
      
      return res.json(response);

    } catch (err) {
      // A) On any error: log with phase and elapsed time
      clearTimeout(hardTimeout);
      clearTimeout(deadlineTimer);
      const totalTime = Date.now() - t0;
      debugInfo.processingTime = totalTime;
      
      // Determine which phase failed (if possible)
      const phase = err.phase || 'unknown';
      logger.error(`[REQ ${reqId}] ERROR ${phase} elapsed=${totalTime}ms`, err);
      
      // E) Always log END with total time
      const statusCode = res.headersSent ? 'SENT' : 500;
      logger.debug(`[REQ ${reqId}] END status=${statusCode} totalMs=${totalTime}`);
      
      // Provide more specific error messages
      let errorMessage = 'Unexpected error during identification';
      if (err.message) {
        errorMessage = err.message;
        // Check if it's a timeout
        if (err.message.includes('TIMEOUT:')) {
          const timeoutMatch = err.message.match(/TIMEOUT:([^:]+):(\d+)/);
          if (timeoutMatch) {
            errorMessage = `Operation timed out: ${timeoutMatch[1]} exceeded ${timeoutMatch[2]}ms`;
          }
        }
      } else if (err.code) {
        errorMessage = `Error code: ${err.code}`;
      }
      
      // Ensure response is sent (don't leave request hanging)
      if (!res.headersSent && !timeoutFired) {
        // CRITICAL: Frontend requires bestMatch with artist and title (always present)
        return res.status(500).json({
          ok: false,
          code: 'INTERNAL_ERROR',
          message: errorMessage,
          retryable: true,
          // CRITICAL: Frontend requires bestMatch with artist and title (always present)
          bestMatch: {
            artist: 'Unknown Artist',
            title: 'Unknown Album',
            year: null,
            coverImageRemoteUrl: null,
            discogsId: null,
            tracks: [],
            confidence: 0,
            source: 'error',
          },
          suggestions: [],
          alternates: [],
          debug: {
            reqId: reqId,
            phase: phase,
            errorName: err.name,
            errorCode: err.code,
            message: err.message,
            ...debugInfo,
          },
          // Legacy fields for backward compatibility
          error: 'INTERNAL_ERROR',
          details: {
            reqId: reqId,
            phase: phase,
            errorName: err.name,
            errorCode: err.code,
          },
          success: false,
          errorDetails: {
            message: err.message,
            code: err.code,
            name: err.name,
            phase: phase,
          },
        });
      }
    } finally {
      // CRITICAL: Always cleanup temp file after processing (success or error)
      // This prevents disk space leaks from concurrent uploads
      if (tempFilePath && fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
          logger.debug(`[REQ ${reqId}] 🧹 Cleaned up temp file: ${path.basename(tempFilePath)}`);
        } catch (cleanupError) {
          // Log but don't fail - cleanup errors are non-critical
          logger.warn(`[REQ ${reqId}] ⚠️  Failed to cleanup temp file ${path.basename(tempFilePath)}: ${cleanupError.message}`);
        }
      }
    }
  });

  return router;
}

module.exports = createIdentifyRecordRoute;

