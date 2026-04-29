/**
 * Rate limiting middleware
 * 
 * Provides rate limiters for API endpoints to prevent abuse
 */

const rateLimit = require('express-rate-limit');

const apiMax = Math.max(1, parseInt(process.env.API_RATE_LIMIT_MAX || '120', 10));
const identifyMax = Math.max(1, parseInt(process.env.IDENTIFY_RATE_LIMIT_MAX || '40', 10));

/**
 * General API rate limiter (tune with API_RATE_LIMIT_MAX for shared NAT / beta)
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: apiMax,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Stricter limiter for POST /api/identify-record (tune with IDENTIFY_RATE_LIMIT_MAX)
 */
const identifyRecordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: identifyMax,
  message: 'Too many identification requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  apiLimiter,
  identifyRecordLimiter,
};

