/**
 * Debug Utilities
 * 
 * Centralized debug logging for the identification pipeline.
 * All debug logs are behind a flag and sanitize sensitive data.
 */

/**
 * Enable debug logging for identification pipeline
 * Set to true to see detailed logs, false for production
 */
export const DEBUG_IDENTIFICATION = __DEV__ && (process.env.EXPO_PUBLIC_DEBUG_IDENTIFICATION === 'true' || false);

/**
 * Sanitize sensitive data from logs
 */
function sanitizeForLogging(data: any): any {
  if (!data || typeof data !== 'object') {
    return data;
  }

  const sanitized = Array.isArray(data) ? [...data] : { ...data };

  // Remove or mask sensitive fields
  const sensitiveFields = [
    'apiKey',
    'apiSecret',
    'token',
    'auth',
    'password',
    'secret',
    'key',
    'credentials',
    'authorization',
    'cookie',
  ];

  for (const key in sanitized) {
    const lowerKey = key.toLowerCase();
    if (sensitiveFields.some(field => lowerKey.includes(field))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeForLogging(sanitized[key]);
    }
  }

  return sanitized;
}

/**
 * Debug log helper - only logs if DEBUG_IDENTIFICATION is true
 */
export function debugLog(category: string, message: string, data?: any): void {
  if (!DEBUG_IDENTIFICATION) {
    return;
  }

  const sanitizedData = data ? sanitizeForLogging(data) : undefined;
  
  console.log(`[DEBUG:${category}] ${message}`, sanitizedData || '');
}

/**
 * Debug log for identification pipeline stages
 */
export const debugIdentification = {
  imageHash: (hash: string) => {
    debugLog('IDENTIFICATION', `Image hash: ${hash.substring(0, 16)}...`);
  },

  visionEntities: (entities: any[], limit = 5) => {
    debugLog('VISION', `Top ${limit} web entities:`, 
      entities.slice(0, limit).map(e => ({
        description: e.description,
        score: e.score,
      }))
    );
  },

  visionOcr: (text: string | null, lines?: string[]) => {
    if (text) {
      debugLog('VISION', `OCR text (${text.length} chars):`, text.substring(0, 200) + (text.length > 200 ? '...' : ''));
    }
    if (lines && lines.length > 0) {
      debugLog('VISION', `Top OCR lines:`, lines.slice(0, 5));
    }
  },

  candidates: (candidates: any[], limit = 10) => {
    debugLog('CANDIDATES', `Generated ${candidates.length} candidates (showing top ${limit}):`, 
      candidates.slice(0, limit).map(c => ({
        artist: c.artist,
        album: c.album || c.title,
        source: c.source,
        confidence: c.confidence,
      }))
    );
  },

  discogsQueries: (queries: string[]) => {
    debugLog('DISCOGS', `Generated ${queries.length} query variations:`, queries.slice(0, 10));
  },

  discogsMatches: (matches: any[], limit = 5) => {
    debugLog('DISCOGS', `Top ${limit} Discogs matches:`, 
      matches.slice(0, limit).map(m => ({
        artist: m.artist,
        title: m.title,
        year: m.year,
        similarity: m.similarity,
        discogsId: m.discogsId,
      }))
    );
  },

  resolvedAlbum: (album: any) => {
    debugLog('RESOLVED', `Final ResolvedAlbum:`, {
      artist: album.artist,
      albumTitle: album.albumTitle,
      releaseYear: album.releaseYear,
      discogsId: album.discogsId,
      musicbrainzId: album.musicbrainzId,
      confidence: album.confidence,
      tracksCount: album.tracks?.length || 0,
      coverHdUrl: album.coverHdUrl ? 'SET' : 'NULL',
    });
  },

  cacheHit: (hash: string) => {
    debugLog('CACHE', `✅ Cache hit for hash: ${hash.substring(0, 16)}...`);
  },

  cacheMiss: (hash: string) => {
    debugLog('CACHE', `❌ Cache miss for hash: ${hash.substring(0, 16)}...`);
  },

  error: (stage: string, error: any) => {
    debugLog('ERROR', `Error in ${stage}:`, {
      message: error.message,
      code: error.code,
      // Don't log full error object to avoid secrets
    });
  },

  timing: (stage: string, duration: number) => {
    debugLog('TIMING', `${stage}: ${duration}ms`);
  },
};

/**
 * Simple debug utility with log, warn, error methods
 * Used by orchestrator and other services
 */
type LogCategory = 'IDENTIFICATION' | 'VISION' | 'CANDIDATES' | 'METADATA' | 'DISCOGS' | 'MUSICBRAINZ' | 'CAA' | 'DB' | 'GENERAL';

const log = (category: LogCategory, message: string, data?: any) => {
  if (DEBUG_IDENTIFICATION) {
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    let formattedMessage = `[${timestamp}][${category}] ${message}`;
    let sanitizedData = data;

    if (typeof data === 'object' && data !== null) {
      sanitizedData = sanitizeForLogging(data);
    }

    if (sanitizedData) {
      console.log(formattedMessage, sanitizedData);
    } else {
      console.log(formattedMessage);
    }
  }
};

const warn = (category: LogCategory, message: string, data?: any) => {
  if (DEBUG_IDENTIFICATION) {
    log(category, `⚠️ ${message}`, data);
  }
};

const error = (category: LogCategory, message: string, err?: any) => {
  if (DEBUG_IDENTIFICATION) {
    log(category, `❌ ${message}`, err);
  }
};

export const debug = {
  log,
  warn,
  error,
  isEnabled: DEBUG_IDENTIFICATION,
};

