/**
 * withTimeout Helper Function
 * 
 * Bulletproof timeout wrapper for promises to prevent silent hangs.
 * Uses a finished flag to prevent race conditions where timeout fires after promise settles.
 * This ensures no orphaned timers or phantom timeouts that poison the request lifecycle.
 * 
 * @param {Promise} promise - Promise to wrap
 * @param {number} ms - Timeout in milliseconds
 * @param {string} label - Label for logging (e.g., "embedding", "vision", "discogs")
 * @param {string} reqId - Request ID for logging context (optional, defaults to 'N/A')
 * @returns {Promise} Promise that rejects with Error(`Timeout in ${label} after ${ms}ms`) if exceeded
 * 
 * @example
 * const result = await withTimeout(
 *   someAsyncOperation(),
 *   15000,  // 15 seconds
 *   'discogs_search',
 *   reqId
 * );
 */
function withTimeout(promise, ms, label, reqId = 'N/A') {
  let timeoutId;
  let finished = false;

  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      if (finished) return;

      const err = new Error(`Timeout in ${label} after ${ms}ms`);
      err.code = 'ETIMEDOUT';
      err.label = label;
      if (reqId) err.reqId = reqId;
      
      console.log(`[REQ ${reqId}] TIMEOUT ${label} after ${ms}ms`);
      reject(err);
    }, ms);
  });

  return Promise.race([promise, timeoutPromise])
    .then((result) => {
      finished = true;
      return result;
    })
    .finally(() => {
      finished = true;
      if (timeoutId) clearTimeout(timeoutId);
    });
}

// Export for Node.js modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = withTimeout;
}

// Export for ES6 modules
if (typeof exports !== 'undefined') {
  exports.withTimeout = withTimeout;
}

