/**
 * Rate limiting middleware
 * 
 * Provides rate limiters for API endpoints to prevent abuse
 */

const rateLimit = require('express-rate-limit');

/**
 * General API rate limiter: 100 requests per 15 minutes per IP
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

/**
 * Stricter rate limiter for identify-record endpoint: 20 requests per 15 minutes
 */
const identifyRecordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per windowMs (more restrictive due to API costs)
  message: 'Too many identification requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  apiLimiter,
  identifyRecordLimiter,
};

