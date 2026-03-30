/**
 * Album Identification Pipeline
 * 
 * Three-phase identification system:
 * 1. generateCandidatesFromInput - Input → Candidates
 * 2. resolveBestAlbum - Candidates → Best Album ID
 * 3. enrichAlbumMetadata - Album ID → Full Metadata
 */

const visionExtractor = require('./visionExtractor');
const imageEmbedding = require('./imageEmbedding');
const imagePreprocessing = require('./imagePreprocessing');
const embeddingDatabase = require('./embeddingDatabase');
const gpt4Vision = require('./gpt4Vision');
const { searchReleaseByArtistAndTitle } = require('./musicbrainzService');
const { searchDiscogsByBarcode } = require('../server-hybrid');
const { processImageWithGoogleVision, extractCandidates, key } = require('../server-hybrid');
const { discogsHttpRequest } = require('./discogsHttpClient');

/**
 * Phase 1: Generate Candidates from Input
 * 
 * @param {Object} req - Express request object
 * @param {Buffer} imageBuffer - Image buffer (if image input)
 * @param {Object} debugInfo - Debug information object
 * @returns {Promise<Array>} Array of candidate objects
 */
async function generateCandidatesFromInput(req, imageBuffer, debugInfo) {
  const candidates = [];
  const inputType = req.file ? 'image' : (req.body.barcode ? 'barcode' : 'text');
  debugInfo.inputType = inputType;
  debugInfo.sourcesUsed = [];

  // Handle image input
  if (inputType === 'image' && imageBuffer) {
    // Preprocess image if enabled
    if (imagePreprocessing.isEnabled()) {
      try {
        console.log(`[Pipeline] 🎨 Preprocessing image for better OCR...`);
        const preprocessedStart = Date.now();
        imageBuffer = await imagePreprocessing.preprocessImageFull(imageBuffer, {
          enhanceContrast: true,
          enhanceBrightness: true,
          reduceNoise: true,
          sharpen: true,
          normalize: true,
        });
        const preprocessedTime = Date.now() - preprocessedStart;
        console.log(`[Pipeline] ✅ Image preprocessing complete in ${preprocessedTime}ms`);
      } catch (preprocessError) {
        console.warn(`[Pipeline] ⚠️  Image preprocessing failed, using original:`, preprocessError.message);
      }
    }

    // Google Vision processing
    const config = require('../config');
    const ENABLE_GOOGLE_VISION = config.googleVision.enabled;
    if (ENABLE_GOOGLE_VISION && req.visionClient) {
      try {
        const visionStart = Date.now();
        console.log(`[Pipeline] 🔍 Starting Google Vision analysis...`);
        
        const visionPromise = processImageWithGoogleVision(imageBuffer);
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Vision API timeout after 45 seconds')), 45000);
        });
        
        const visionResult = await Promise.race([visionPromise, timeoutPromise]);
        const visionTime = Date.now() - visionStart;
        debugInfo.visionProcessing = visionTime;

        // Store OCR text
        if (visionResult.extractedText) {
          debugInfo.rawOcrText = visionResult.extractedText;
        }

        // Store web entities/page titles in debugInfo
        debugInfo.webEntities = visionResult.webEntities?.length || 0;
        debugInfo.pageTitles = visionResult.pageTitles?.length || 0;

        console.log(`[Pipeline] ✅ Vision analysis complete in ${visionTime}ms`);
        console.log(`[Pipeline] ✅ OCR text: ${visionResult.extractedText ? `"${visionResult.extractedText.substring(0, 100)}..."` : 'none'}`);

        // Primary extraction using visionExtractor
        const extracted = visionExtractor.extractArtistTitleFromVision(visionResult);
        if (extracted && extracted.artist && extracted.title) {
          console.log(`[Pipeline] ✅ Primary extraction: "${extracted.artist}" - "${extracted.title}"`);
          candidates.push({
            artist: extracted.artist,
            title: extracted.title,
            confidence: 0.9,
            source: extracted.source || 'vision_primary',
          });
          debugInfo.sourcesUsed.push('vision');
        }

        // Add secondary OCR candidates (cap at 3-5 total, filter low confidence)
        if (visionResult.extractedText) {
          const textCandidates = extractCandidates(visionResult.extractedText);
          for (const candidate of textCandidates) {
            if (candidate.confidence >= 0.3 && candidates.length < 5) {
              if (!candidates.find(c => key(c) === key(candidate))) {
                candidates.push(candidate);
              }
            }
          }
        }

        // Add vision result candidates (filter low confidence)
        for (const candidate of visionResult.candidates || []) {
          if (candidate.confidence >= 0.3 && candidates.length < 5) {
            if (!candidates.find(c => key(c) === key(candidate))) {
              candidates.push(candidate);
            }
          }
        }

        debugInfo.candidatesExtracted = candidates.length;
        console.log(`[Pipeline] Total ${candidates.length} candidates from Vision`);

        // GPT-4 Vision fallback if candidates insufficient
        if (candidates.length === 0 || (candidates.length > 0 && candidates[0].confidence < 0.5)) {
          if (gpt4Vision.isEnabled()) {
            console.log(`[Pipeline] 🧠 Vision candidates insufficient, trying GPT-4 Vision fallback...`);
            try {
              const gpt4Result = await gpt4Vision.identifyWithGPT4Vision(imageBuffer, null, candidates);
              if (gpt4Result && gpt4Result.confidence >= 0.5) {
                console.log(`[Pipeline] ✅ GPT-4 Vision identified: "${gpt4Result.artist}" - "${gpt4Result.title}"`);
                candidates.unshift({
                  artist: gpt4Result.artist,
                  title: gpt4Result.title,
                  confidence: gpt4Result.confidence,
                  source: 'gpt4_vision',
                  year: gpt4Result.year,
                  tracks: gpt4Result.tracks
                });
                debugInfo.gpt4VisionUsed = true;
                debugInfo.sourcesUsed.push('gpt4_vision');
              }
            } catch (gpt4Error) {
              console.error('[Pipeline] GPT-4 Vision error:', gpt4Error.message);
              debugInfo.errors.push(`GPT-4 Vision: ${gpt4Error.message}`);
            }
          }
        }

      } catch (error) {
        const errorMsg = error.message || 'Unknown Vision API error';
        debugInfo.errors.push(`Google Vision: ${errorMsg}`);
        console.error('[Pipeline] Google Vision error:', errorMsg);
      }
    }

    // Embedding-based similarity search (if no candidates yet)
    if (candidates.length === 0 && imageEmbedding.isEnabled()) {
      try {
        console.log(`[Pipeline] 🎨 Checking for similar albums using embeddings...`);
        const queryEmbedding = await imageEmbedding.generateImageEmbedding(imageBuffer);
        if (queryEmbedding) {
          const similarAlbums = await embeddingDatabase.searchSimilarAlbums(queryEmbedding, 0.85, 5);
          if (similarAlbums.length > 0) {
            console.log(`[Pipeline] ✅ Found ${similarAlbums.length} visually similar albums`);
            for (const similar of similarAlbums) {
              if (candidates.length < 5) {
                candidates.push({
                  artist: similar.artist,
                  title: similar.title,
                  confidence: 0.8 * similar.similarity,
                  source: 'embedding_match',
                  year: similar.year,
                  discogsId: similar.discogsId,
                });
              }
            }
            debugInfo.embeddingMatches = similarAlbums.length;
            debugInfo.sourcesUsed.push('embedding');
          }
        }
      } catch (embeddingError) {
        console.warn(`[Pipeline] ⚠️  Embedding search failed:`, embeddingError.message);
        debugInfo.errors.push(`Embedding search: ${embeddingError.message}`);
      }
    }

    // OCR → MusicBrainz fallback (last resort)
    if (candidates.length === 0 && debugInfo.rawOcrText && debugInfo.rawOcrText.trim().length > 0) {
      console.log(`[Pipeline] 🎵 No candidates from Vision/Embedding, trying MusicBrainz OCR fallback...`);
      try {
        const words = debugInfo.rawOcrText
          .split(/\s+/)
          .filter(w => w.length > 2 && !/^(stereo|vinyl|record|album|lp|cd)$/i.test(w))
          .slice(0, 6)
          .join(' ');
        
        if (words.length > 5) {
          const mbFallback = await searchReleaseByArtistAndTitle(null, words);
          if (mbFallback) {
            candidates.push({
              artist: mbFallback.artist,
              title: mbFallback.title,
              confidence: 0.5,
              source: 'musicbrainz_ocr_fallback',
              musicbrainz: {
                mbid: mbFallback.mbid,
                year: mbFallback.year,
              },
            });
            debugInfo.fallbackUsed = 'musicbrainz_ocr_fallback';
            debugInfo.sourcesUsed.push('musicbrainz_ocr_fallback');
            console.log(`[Pipeline] ✅ MusicBrainz OCR fallback found: "${mbFallback.artist}" - "${mbFallback.title}"`);
          }
        }
      } catch (mbError) {
        console.warn(`[Pipeline] ⚠️  MusicBrainz OCR fallback failed: ${mbError.message}`);
        debugInfo.errors.push(`MusicBrainz OCR fallback: ${mbError.message}`);
      }
    }

  } else if (inputType === 'barcode') {
    const barcode = req.body.barcode?.trim();
    if (!barcode) {
      throw new Error('No barcode provided');
    }

    console.log(`[Pipeline] 📷 Processing barcode: ${barcode}`);
    const barcodeMatch = await searchDiscogsByBarcode(barcode);
    
    if (barcodeMatch) {
      console.log(`[Pipeline] ✅ Barcode match found: "${barcodeMatch.artist}" - "${barcodeMatch.title}"`);
      candidates.push({
        artist: barcodeMatch.artist,
        title: barcodeMatch.title,
        confidence: 0.95,
        source: 'barcode_discogs',
        discogsId: barcodeMatch.discogsId,
        year: barcodeMatch.year,
        coverImageRemoteUrl: barcodeMatch.coverImageRemoteUrl,
        tracks: barcodeMatch.tracks,
      });
      debugInfo.barcodeMatch = true;
      debugInfo.sourcesUsed.push('barcode');
    } else {
      throw new Error(`No Discogs match for barcode ${barcode}`);
    }

  } else if (inputType === 'text') {
    const artist = req.body.artist?.trim() || '';
    const title = req.body.title?.trim() || '';
    if (!artist && !title) {
      throw new Error('No text input provided (artist or title required)');
    }
    
    candidates.push({
      artist,
      title,
      confidence: 0.9,
      source: 'user_input'
    });
    debugInfo.sourcesUsed.push('user_input');
    console.log(`[Pipeline] Processing text: ${artist} - ${title}`);
  }

  // Sort candidates by confidence (highest first)
  candidates.sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
  
  debugInfo.candidateCount = candidates.length;
  console.log(`[Pipeline] ✅ Generated ${candidates.length} candidates from ${debugInfo.sourcesUsed.join(', ')}`);
  
  return candidates;
}

/**
 * Phase 2: Resolve Best Album from Candidates
 * 
 * @param {Array} candidates - Array of candidate objects
 * @param {string} imageHash - Image hash (for local DB lookup)
 * @param {Object} debugInfo - Debug information object
 * @returns {Promise<Object|null>} Best album object or null
 */
async function resolveBestAlbum(candidates, imageHash, debugInfo) {
  if (!candidates || candidates.length === 0) {
    console.log(`[Resolver] ❌ No candidates to resolve`);
    return null;
  }

  // Import required functions (they're in server-hybrid.js)
  const { searchLocalDatabase, searchDiscogsEnhanced } = require('../server-hybrid');
  const { searchReleaseByArtistAndTitle } = require('./musicbrainzService');

  let bestAlbum = null;
  let bestConfidence = 0;
  const config = require('../config');
  const CONFIDENCE_THRESHOLD = config.scoring.confidenceThreshold;

  // Short-circuit for barcode matches
  const barcodeCandidate = candidates.find(c => c.source === 'barcode_discogs' || c.source === 'discogs_barcode');
  if (barcodeCandidate && barcodeCandidate.discogsId) {
    console.log(`[Resolver] ✅ Barcode match found, using directly`);
    bestAlbum = {
      artist: barcodeCandidate.artist,
      title: barcodeCandidate.title,
      year: barcodeCandidate.year || null,
      discogsId: barcodeCandidate.discogsId,
      coverImageUrl: barcodeCandidate.coverImageRemoteUrl || null,
      confidence: barcodeCandidate.confidence || 0.95,
      source: barcodeCandidate.source,
      musicbrainz: barcodeCandidate.musicbrainz || null,
      tracks: barcodeCandidate.tracks || null,
    };
    bestConfidence = bestAlbum.confidence;
  } else {
    // Process each candidate
    for (const candidate of candidates) {
      // Check local database first
      if (candidate.artist && candidate.title) {
        try {
          const localMatch = await searchLocalDatabase(candidate.artist, candidate.title, imageHash);
          if (localMatch) {
            debugInfo.localDbChecks++;
            const localConfidence = candidate.confidence * localMatch.confidence;
            if (localConfidence > bestConfidence) {
              bestAlbum = {
                artist: localMatch.artist,
                title: localMatch.title,
                year: localMatch.year || candidate.year || null,
                discogsId: localMatch.discogsId || null,
                coverImageUrl: localMatch.coverImageRemoteUrl || null,
                confidence: localConfidence,
                source: 'local_db',
                musicbrainz: candidate.musicbrainz || null,
              };
              bestConfidence = localConfidence;
              console.log(`[Resolver] ✅ Local DB match: "${bestAlbum.artist}" - "${bestAlbum.title}"`);
              continue; // Skip Discogs search for local match
            }
          }
        } catch (localError) {
          console.warn(`[Resolver] ⚠️  Local DB check failed: ${localError.message}`);
        }
      }

      // Search Discogs
      if (candidate.artist && candidate.title) {
        try {
          debugInfo.discogsSearches++;
          const discogsResult = await searchDiscogsEnhanced(candidate.artist, candidate.title, false);
          
          if (discogsResult.bestMatch) {
            const combinedConfidence = candidate.confidence * discogsResult.bestMatch.confidence;
            
            if (combinedConfidence > bestConfidence) {
              // Attach MusicBrainz MBID if not already present
              let musicbrainz = candidate.musicbrainz || null;
              if (!musicbrainz) {
                try {
                  const mbRelease = await searchReleaseByArtistAndTitle(candidate.artist, candidate.title);
                  if (mbRelease) {
                    musicbrainz = {
                      mbid: mbRelease.mbid,
                      year: mbRelease.year,
                    };
                    debugInfo.musicbrainzSearches++;
                  }
                } catch (mbError) {
                  // Ignore MusicBrainz errors - optional
                }
              }

              bestAlbum = {
                artist: discogsResult.bestMatch.artist,
                title: discogsResult.bestMatch.title,
                year: discogsResult.bestMatch.year || candidate.year || null,
                discogsId: discogsResult.bestMatch.discogsId,
                coverImageUrl: discogsResult.bestMatch.coverImageRemoteUrl || null,
                confidence: combinedConfidence,
                source: candidate.source,
                musicbrainz: musicbrainz,
              };
              bestConfidence = combinedConfidence;
              console.log(`[Resolver] ✅ Discogs match: "${bestAlbum.artist}" - "${bestAlbum.title}" (confidence: ${combinedConfidence.toFixed(2)})`);
            }
          }
        } catch (discogsError) {
          console.warn(`[Resolver] ⚠️  Discogs search failed for "${candidate.artist} - ${candidate.title}": ${discogsError.message}`);
          debugInfo.errors.push(`Discogs search: ${discogsError.message}`);
        }
      }
    }
  }

  // Check if we have a good enough match
  if (bestAlbum && bestConfidence >= CONFIDENCE_THRESHOLD) {
    console.log(
      `[Resolver] ✅ Best album resolved: "${bestAlbum.artist}" - "${bestAlbum.title}", ` +
      `confidence=${bestConfidence.toFixed(2)}, ` +
      `discogsId=${bestAlbum.discogsId || 'none'}, ` +
      `mbid=${bestAlbum.musicbrainz?.mbid || 'none'}`
    );
    return bestAlbum;
  } else if (bestAlbum) {
    debugInfo.lowConfidence = true;
    console.log(
      `[Resolver] ⚠️  Low confidence match: "${bestAlbum.artist}" - "${bestAlbum.title}", ` +
      `confidence=${bestConfidence.toFixed(2)} (threshold: ${CONFIDENCE_THRESHOLD})`
    );
    return bestAlbum; // Return anyway, but mark as low confidence
  }

  console.log(`[Resolver] ❌ No album resolved from ${candidates.length} candidates`);
  return null;
}

/**
 * Phase 3: Enrich Album Metadata
 * 
 * @param {Object} bestAlbum - Best album object from Phase 2
 * @param {Object} debugInfo - Debug information object
 * @returns {Promise<Object>} Enriched album metadata
 */
async function enrichAlbumMetadata(bestAlbum, debugInfo) {
  const { getReleaseDetailsWithTracks, getCoverArtUrlForRelease } = require('./musicbrainzService');
  const axios = require('axios');
  
  const config = require('../config');
  const DISCOGS_PERSONAL_ACCESS_TOKEN = config.discogs.personalAccessToken;
  const DISCOGS_API_KEY = config.discogs.apiKey;
  const DISCOGS_API_SECRET = config.discogs.apiSecret;

  const primary = {
    artist: bestAlbum.artist,
    title: bestAlbum.title,
    year: bestAlbum.year || null,
    discogsId: bestAlbum.discogsId || null,
    musicbrainz: bestAlbum.musicbrainz || null,
    tracks: [],
    coverImageUrl: bestAlbum.coverImageUrl || null,
    genres: [],
    styles: [],
    confidence: bestAlbum.confidence,
    source: bestAlbum.source,
  };

  // Fetch Discogs release details (primary source)
  if (primary.discogsId) {
    try {
      console.log(`[Enricher] 📀 Fetching Discogs release details: ${primary.discogsId}`);
      const headers = {
        'User-Agent': 'SlotSync/1.0.0 (contact@slotsync.app)',
      };
      if (DISCOGS_PERSONAL_ACCESS_TOKEN) {
        headers['Authorization'] = `Discogs token=${DISCOGS_PERSONAL_ACCESS_TOKEN}`;
      }

      const release = await discogsHttpRequest(
        `https://api.discogs.com/releases/${primary.discogsId}`,
        {
          params: DISCOGS_PERSONAL_ACCESS_TOKEN ? {} : {
            key: DISCOGS_API_KEY,
            secret: DISCOGS_API_SECRET,
          },
          headers: headers,
        },
        {
          timeoutMs: 5000,
          reqId: 'N/A',
          op: 'release_fetch',
          meta: { discogsId: primary.discogsId }
        }
      );
      
      // Extract year
      if (release.year && !primary.year) {
        primary.year = release.year;
      }

      // Extract genres and styles
      if (release.genres && Array.isArray(release.genres)) {
        primary.genres = release.genres;
      }
      if (release.styles && Array.isArray(release.styles)) {
        primary.styles = release.styles;
      }

      // Extract tracks
      if (release.tracklist && Array.isArray(release.tracklist)) {
        const { parseDuration } = require('../server-hybrid');
        for (const track of release.tracklist) {
          if (track.title && track.title.trim()) {
            primary.tracks.push({
              title: track.title.trim(),
              trackNumber: track.position ? parseInt(track.position.split(/[-.]/)[0]) || null : null,
              discNumber: track.position && track.position.includes('.') ? parseInt(track.position.split('.')[0]) : null,
              side: track.position && track.position.match(/^[A-Z]/) ? track.position.match(/^([A-Z])/)[1] : null,
              durationSeconds: track.duration ? parseDuration(track.duration) : null,
            });
          }
        }
        console.log(`[Enricher] ✅ Extracted ${primary.tracks.length} tracks from Discogs`);
      }

      // Extract cover image
      if (release.images && release.images.length > 0) {
        primary.coverImageUrl = release.images[0].uri || release.images[0].resource_url || null;
      }

    } catch (discogsError) {
      console.warn(`[Enricher] ⚠️  Discogs release fetch failed: ${discogsError.message}`);
      debugInfo.errors.push(`Discogs release fetch: ${discogsError.message}`);
    }
  }

  // MusicBrainz enrichment (fallback + additional data)
  if (primary.musicbrainz?.mbid) {
    try {
      console.log(`[Enricher] 🎵 Fetching MusicBrainz release details: ${primary.musicbrainz.mbid}`);
      const mbDetails = await getReleaseDetailsWithTracks(primary.musicbrainz.mbid);
      
      if (mbDetails) {
        debugInfo.musicbrainzUsed = true;
        
        // Use MusicBrainz tracks if Discogs has none
        if (primary.tracks.length === 0 && mbDetails.tracks && mbDetails.tracks.length > 0) {
          primary.tracks = mbDetails.tracks.map(t => ({
            title: t.title,
            trackNumber: t.trackNumber || null,
            discNumber: t.disc || null,
            durationSeconds: t.lengthMs ? Math.floor(t.lengthMs / 1000) : null,
          }));
          console.log(`[Enricher] ✅ MusicBrainz provided ${primary.tracks.length} tracks`);
        }

        // Use MusicBrainz year if missing
        if (!primary.year && mbDetails.year) {
          primary.year = mbDetails.year;
        }

        // Note: MusicBrainz genres/tags would need to be extracted from MB API response
        // For now, we'll keep Discogs genres/styles as primary
      }
    } catch (mbError) {
      console.warn(`[Enricher] ⚠️  MusicBrainz enrichment failed: ${mbError.message}`);
      debugInfo.errors.push(`MusicBrainz enrichment: ${mbError.message}`);
    }
  }

  // Cover Art Archive fallback
  if ((!primary.coverImageUrl || primary.coverImageUrl.includes('spacer.gif')) && primary.musicbrainz?.mbid) {
    try {
      console.log(`[Enricher] 🖼️  Fetching cover art from Cover Art Archive...`);
      const caaUrl = await getCoverArtUrlForRelease(primary.musicbrainz.mbid);
      if (caaUrl) {
        primary.coverImageUrl = caaUrl;
        debugInfo.coverArtArchiveUsed = true;
        console.log(`[Enricher] ✅ Cover Art Archive provided cover image`);
      }
    } catch (caaError) {
      console.warn(`[Enricher] ⚠️  Cover Art Archive failed: ${caaError.message}`);
    }
  }

  console.log(
    `[Enricher] ✅ Metadata enriched: ` +
    `tracks=${primary.tracks.length}, ` +
    `genres=${primary.genres.length}, ` +
    `styles=${primary.styles.length}, ` +
    `cover=${primary.coverImageUrl ? 'yes' : 'no'}`
  );

  return primary;
}

module.exports = {
  generateCandidatesFromInput,
  resolveBestAlbum,
  enrichAlbumMetadata,
};

