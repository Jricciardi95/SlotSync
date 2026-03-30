/**
 * Shared Discogs HTTP Client
 * 
 * Single source of truth for all Discogs API calls with AbortController timeout enforcement.
 * Uses native fetch (undici) instead of axios for reliable abort behavior.
 * Ensures NO request can hang indefinitely by using AbortController at the network layer.
 * 
 * Supports parent signal for request-level abort propagation.
 */

const logger = require('./logger');

/**
 * Shared Discogs HTTP request helper with AbortController timeout enforcement.
 * Uses native fetch for reliable abort behavior.
 * 
 * @param {string} url - Base Discogs API URL
 * @param {Object} config - Request config object
 * @param {Object} config.params - Query parameters (will be converted to URLSearchParams)
 * @param {Object} config.headers - HTTP headers
 * @param {Object} timeoutConfig - Timeout configuration
 * @param {number} timeoutConfig.timeoutMs - Timeout in milliseconds (default: 12000)
 * @param {string} timeoutConfig.reqId - Request ID for logging context
 * @param {string} timeoutConfig.op - Operation name for logging (e.g., "search", "release", "master")
 * @param {Object} timeoutConfig.meta - Additional metadata for logging
 * @param {AbortSignal} timeoutConfig.parentSignal - Parent abort signal (from request-level controller)
 * @returns {Promise<Object>} Response data (parsed JSON)
 */
async function discogsHttpRequest(url, config = {}, timeoutConfig = {}) {
  const {
    timeoutMs = 12000,
    reqId = 'N/A',
    op = 'discogs',
    meta = {},
    parentSignal = null
  } = timeoutConfig;
  
  const startTime = Date.now();
  const controller = new AbortController();
  let timeoutId;
  
  // If parent signal aborts, abort this request too
  if (parentSignal) {
    if (parentSignal.aborted) {
      const abortErr = new Error(`Discogs ${op} aborted by parent signal`);
      abortErr.code = 'EABORTED';
      abortErr.operation = op;
      abortErr.url = url;
      abortErr.reqId = reqId;
      throw abortErr;
    }
    parentSignal.addEventListener('abort', () => {
      controller.abort();
      const elapsed = Date.now() - startTime;
      logger.debug(`[REQ ${reqId}] discogs_${op}_aborted_by_parent elapsed=${elapsed}ms`);
    });
  }
  
  // Build URL with query parameters
  let fullUrl = url;
  if (config.params && Object.keys(config.params).length > 0) {
    const urlParams = new URLSearchParams();
    for (const [key, value] of Object.entries(config.params)) {
      if (value !== null && value !== undefined) {
        urlParams.append(key, String(value));
      }
    }
    const queryString = urlParams.toString();
    fullUrl = `${url}${url.includes('?') ? '&' : '?'}${queryString}`;
  }
  
  // Log start (debug level - detailed info only shown in debug mode)
  logger.debug(`[REQ ${reqId}] discogs_${op}_start url=${fullUrl.substring(0, 80)}...`, meta);
  
  // Set up timeout that aborts the request
  timeoutId = setTimeout(() => {
    controller.abort();
    const elapsed = Date.now() - startTime;
    logger.warn(`[REQ ${reqId}] discogs_${op}_timeout elapsed=${elapsed}ms`);
  }, timeoutMs);
  
  try {
    // 1) Determine token from environment
    const config = require('../config');
    const token = (config.discogs.personalAccessToken || '').trim();
    const tokenLen = token.length;
    const hasSpace = token.includes(' ');
    
    // DEBUG: Log token info (first time only, or on error)
    if (!globalThis.__discogsTokenLogged || tokenLen === 0) {
      logger.info(`[Discogs] Token check: length=${tokenLen}, hasSpace=${hasSpace}, prefix=${token.substring(0, 4)}...`);
      globalThis.__discogsTokenLogged = true;
    }
    
    // 2) Build required headers (these WIN merge order - override caller headers)
    const requiredHeaders = {
      'User-Agent': config.discogs.userAgent,
      'Accept': 'application/json',
    };
    if (token) {
      requiredHeaders['Authorization'] = `Discogs token=${token}`;
      // DEBUG: Log authorization header format (first request only)
      if (!globalThis.__discogsAuthLogged) {
        logger.debug(`[Discogs] Authorization header format: "Discogs token=${token.substring(0, 4)}..."`);
        globalThis.__discogsAuthLogged = true;
      }
    } else {
      logger.warn(`[Discogs] ⚠️  No token found in config.discogs.personalAccessToken`);
    }
    
    // 3) Merge headers: caller headers first, then required headers override
    const headers = { ...(config.headers || {}), ...requiredHeaders };
    
    // 4) Debug logging RIGHT before fetch (debug level - not shown in production)
    const urlTruncated = fullUrl.length > 120 ? fullUrl.substring(0, 120) + '...' : fullUrl;
    logger.debug(`[REQ ${reqId}] discogs_${op}_fetch_prepare url=${urlTruncated}`);
    
    // Headers logged at debug level only (logger will sanitize Authorization automatically)
    logger.debug(`[REQ ${reqId}] discogs_${op}_headers`, {
      'User-Agent': headers['User-Agent'],
      'Accept': headers['Accept'],
      'Authorization': headers['Authorization'], // Logger will sanitize this
    });
    
    // Make request with native fetch and AbortController signal
    const fetchOptions = {
      method: 'GET',
      headers: headers,
      signal: controller.signal,
    };
    
    const response = await fetch(fullUrl, fetchOptions);
    
    const elapsed = Date.now() - startTime;
    clearTimeout(timeoutId);
    
    // Check if response is ok
    if (!response.ok) {
      // 5) Improved error logging for 401/403
      let bodyText = '';
      try {
        bodyText = await response.text();
      } catch (e) {
        // Ignore read errors
      }
      
      const error = new Error(`Discogs ${op} failed: ${response.status} ${response.statusText}`);
      error.code = 'HTTP_ERROR';
      error.status = response.status;
      error.statusText = response.statusText;
      error.operation = op;
      error.url = fullUrl;
      error.reqId = reqId;
      
      // Log detailed error info for 401/403 (error level for auth issues)
      if (response.status === 401 || response.status === 403) {
        logger.error(`[REQ ${reqId}] discogs_${op}_failed elapsedMs=${elapsed} status=${response.status} error=${response.statusText}`);
      } else {
        logger.warn(`[REQ ${reqId}] discogs_${op}_failed elapsedMs=${elapsed} status=${response.status} error=${response.statusText}`);
      }
      
      throw error;
    }
    
    // Parse JSON response
    const data = await response.json();
    
    // Log success (debug level - detailed info only shown in debug mode)
    const resultsCount = data?.results?.length || data?.pagination?.items || 0;
    const status = response.status || 'N/A';
    logger.debug(`[REQ ${reqId}] discogs_${op}_complete elapsedMs=${elapsed} status=${status} resultsCount=${resultsCount}`);
    
    return data;
  } catch (error) {
    clearTimeout(timeoutId);
    const elapsed = Date.now() - startTime;
    
    // Check if aborted (timeout or parent signal)
    if (error.name === 'AbortError' || error.code === 'EABORTED' || error.message?.includes('aborted')) {
      const timeoutErr = new Error(`Discogs ${op} timeout after ${timeoutMs}ms`);
      timeoutErr.code = controller.signal.aborted ? 'EABORTED' : 'ETIMEDOUT';
      timeoutErr.operation = op;
      timeoutErr.url = fullUrl;
      timeoutErr.reqId = reqId;
      const statusStr = controller.signal.aborted ? 'ABORT' : 'TIMEOUT';
      logger.warn(`[REQ ${reqId}] discogs_${op}_${statusStr.toLowerCase()} elapsedMs=${elapsed}`);
      throw timeoutErr;
    }
    
    // Log error (warn level for network errors, error level for HTTP errors)
    const statusCode = error.status || 'N/A';
    const errorMsg = error.message || 'Unknown error';
    if (error.status && error.status >= 400) {
      logger.error(`[REQ ${reqId}] discogs_${op}_error elapsedMs=${elapsed} status=${statusCode} error=${errorMsg.substring(0, 100)}`);
    } else {
      logger.warn(`[REQ ${reqId}] discogs_${op}_error elapsedMs=${elapsed} error=${errorMsg.substring(0, 100)}`);
    }
    
    throw error;
  }
}

/**
 * PR2: Discogs HTTP request with retry logic for 429/5xx errors
 * 
 * @param {string} url - Base Discogs API URL
 * @param {Object} config - Request config object
 * @param {Object} timeoutConfig - Timeout configuration
 * @param {number} timeoutConfig.maxRetries - Maximum retries (default: 1)
 * @param {number} timeoutConfig.retryDelayMs - Delay between retries (default: 1000)
 * @returns {Promise<Object>} Response data (parsed JSON)
 */
async function discogsHttpRequestWithRetry(url, config = {}, timeoutConfig = {}) {
  const {
    maxRetries = 1,
    retryDelayMs = 1000,
    ...restTimeoutConfig
  } = timeoutConfig;
  
  let lastError;
  let attempt = 0;
  
  while (attempt <= maxRetries) {
    try {
      return await discogsHttpRequest(url, config, restTimeoutConfig);
    } catch (error) {
      lastError = error;
      const status = error.status || error.code;
      const reqId = restTimeoutConfig.reqId || 'N/A';
      
      // Only retry on 429 (rate limit) or 5xx (server errors)
      const shouldRetry = attempt < maxRetries && (
        status === 429 || 
        (status >= 500 && status < 600) ||
        (error.code === 'ETIMEDOUT' && status !== 401 && status !== 403)
      );
      
      if (!shouldRetry) {
        throw error;
      }
      
      attempt++;
      const delay = retryDelayMs * attempt; // Exponential backoff
      logger.warn(`[REQ ${reqId}] discogs_retry attempt=${attempt}/${maxRetries} delay=${delay}ms status=${status}`);
      
      // Wait before retry
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

module.exports = {
  discogsHttpRequest,
  discogsHttpRequestWithRetry,
};
