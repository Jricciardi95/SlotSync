/**
 * CORS middleware configuration
 * 
 * Configures CORS with allowed origins from environment variable.
 * In production, NEVER use "*" - always specify exact origins.
 */

const cors = require('cors');
const logger = require('../services/logger');
const config = require('../config');

/**
 * Get CORS configuration based on environment
 * @returns {Object} CORS middleware configuration
 */
function getCorsConfig() {
  const isDev = config.IS_DEV;
  let allowedOrigins = [];

  if (config.cors.allowedOrigins && config.cors.allowedOrigins.length > 0) {
    // Use configured origins from config module
    allowedOrigins = config.cors.allowedOrigins;
  } else if (isDev) {
    // Development defaults: allow localhost and Expo dev server origins
    allowedOrigins = [
      'http://localhost:8081', // Expo default
      'http://localhost:19000', // Expo web
      'http://localhost:19006', // Expo web alternative
      'http://127.0.0.1:8081',
      'http://127.0.0.1:19000',
      'http://127.0.0.1:19006',
    ];
  } else {
    // Production: no defaults, must be set via ALLOWED_ORIGINS
    logger.warn('[Config] ⚠️  ALLOWED_ORIGINS not set in production - CORS will block all requests!');
    allowedOrigins = [];
  }

  // Log configured origins (sanitized - don't log full list in production)
  if (allowedOrigins.length > 0) {
    logger.info(`[Config] ✅ CORS configured for ${allowedOrigins.length} origin(s)`);
    if (isDev) {
      logger.info(`[Config]   Origins: ${allowedOrigins.join(', ')}`);
    }
  } else {
    logger.warn('[Config] ⚠️  No CORS origins configured - all requests will be blocked!');
  }

  return cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, Postman, etc.)
      if (!origin) {
        return callback(null, true);
      }
      
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        logger.warn(`[CORS] ⚠️  Blocked request from origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true,
    optionsSuccessStatus: 200,
  });
}

module.exports = {
  getCorsConfig,
};

