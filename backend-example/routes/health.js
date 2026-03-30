/**
 * Health check routes
 * 
 * Provides simple health check endpoints for monitoring and connectivity testing
 */

const express = require('express');
const router = express.Router();

/**
 * GET /health
 * 
 * Simple health check endpoint.
 * 
 * HTTP Status Code Contract:
 * - 200: Server is healthy (always succeeds)
 */
router.get('/health', (req, res) => {
  res.json({
    ok: true,
    time: new Date().toISOString(),
  });
});

/**
 * GET /api/ping
 * 
 * Health check / ping endpoint for connectivity testing.
 * 
 * HTTP Status Code Contract:
 * - 200: Server is healthy (always succeeds)
 */
router.get('/api/ping', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    server: 'SlotSync API',
    version: '1.0.0',
  });
});

// Debug endpoint to test Discogs token
router.get('/api/debug/discogs', async (req, res) => {
  try {
    const config = require('../config');
    const token = (config.discogs.personalAccessToken || '').trim();
    
    const testResult = {
      tokenConfigured: !!token,
      tokenLength: token ? token.length : 0,
      tokenPrefix: token ? token.substring(0, 4) + '...' : null,
      userAgent: config.discogs.userAgent,
    };
    
    // Try to make a test request to Discogs API
    if (token) {
      try {
        const { discogsHttpRequest } = require('../services/discogsHttpClient');
        const testResponse = await discogsHttpRequest(
          'https://api.discogs.com/oauth/identity',
          {},
          {
            timeoutMs: 5000,
            reqId: 'debug-test',
            op: 'token_test',
          }
        );
        testResult.apiTest = {
          success: true,
          username: testResponse.username || null,
          resourceUrl: testResponse.resource_url || null,
        };
      } catch (apiError) {
        testResult.apiTest = {
          success: false,
          error: apiError.message,
          status: apiError.status || null,
          statusText: apiError.statusText || null,
        };
      }
    } else {
      testResult.apiTest = {
        success: false,
        error: 'No token configured',
      };
    }
    
    res.json(testResult);
  } catch (error) {
    res.status(500).json({
      error: 'Debug test failed',
      message: error.message,
    });
  }
});

module.exports = router;

