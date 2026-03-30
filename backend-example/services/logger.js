/**
 * Lightweight Logger Utility
 * 
 * Supports LOG_LEVEL=debug|info|warn|error (default: info)
 * Automatically sanitizes objects/strings to prevent secret leakage
 * Preserves existing log prefixes when possible
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const LOG_LEVEL = (process.env.LOG_LEVEL || 'info').toLowerCase();
const CURRENT_LEVEL = LOG_LEVELS[LOG_LEVEL] !== undefined ? LOG_LEVELS[LOG_LEVEL] : LOG_LEVELS.info;

// Sensitive keys to redact (case-insensitive)
const SENSITIVE_KEYS = [
  'token',
  'key',
  'secret',
  'password',
  'authorization',
  'credential',
  'apikey',
  'api_key',
  'access_token',
  'refresh_token',
  'private_key',
  'client_secret',
  'auth',
];

/**
 * Recursively sanitize an object to redact sensitive values
 */
function sanitizeValue(value, path = '') {
  if (value === null || value === undefined) {
    return value;
  }

  // Check if the current path/key is sensitive
  const isSensitiveKey = SENSITIVE_KEYS.some(sensitive => {
    const lowerPath = path.toLowerCase();
    return lowerPath.includes(sensitive);
  });

  // If it's a sensitive key, redact the value
  if (isSensitiveKey && typeof value === 'string') {
    if (value.length <= 4) {
      return '[REDACTED]';
    }
    // Show first 4 chars + length for tokens/keys
    return `${value.substring(0, 4)}...[REDACTED:${value.length}chars]`;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeValue(item, `${path}[${index}]`));
  }

  // Handle objects
  if (typeof value === 'object' && value.constructor === Object) {
    const sanitized = {};
    for (const [key, val] of Object.entries(value)) {
      sanitized[key] = sanitizeValue(val, path ? `${path}.${key}` : key);
    }
    return sanitized;
  }

  // Check if string value contains sensitive patterns
  if (typeof value === 'string') {
    // Redact if it looks like a token/key (long alphanumeric string)
    if (value.length > 20 && /^[A-Za-z0-9]+$/.test(value)) {
      return `${value.substring(0, 4)}...[REDACTED:${value.length}chars]`;
    }
    // Redact common patterns like "token=xxx" or "Authorization: xxx"
    const patterns = [
      /(token|key|secret|password|authorization)\s*[=:]\s*([^\s&,}]+)/gi,
      /Bearer\s+[\w-]+/gi,
    ];
    let sanitized = value;
    for (const pattern of patterns) {
      sanitized = sanitized.replace(pattern, (match) => {
        if (match.length > 20) {
          return match.substring(0, 10) + '...[REDACTED]';
        }
        return '[REDACTED]';
      });
    }
    return sanitized;
  }

  return value;
}

/**
 * Format log arguments with sanitization
 */
function formatArgs(args) {
  return args.map(arg => {
    if (typeof arg === 'object' && arg !== null) {
      return sanitizeValue(arg);
    }
    if (typeof arg === 'string') {
      return sanitizeValue(arg);
    }
    return arg;
  });
}

/**
 * Logger instance with level-aware methods
 */
const logger = {
  /**
   * Debug level logging (only shown if LOG_LEVEL=debug)
   */
  debug(...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.debug) {
      const sanitized = formatArgs(args);
      console.log(...sanitized);
    }
  },

  /**
   * Info level logging (shown for info, warn, error levels)
   */
  info(...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.info) {
      const sanitized = formatArgs(args);
      console.log(...sanitized);
    }
  },

  /**
   * Warning level logging (shown for warn, error levels)
   */
  warn(...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.warn) {
      const sanitized = formatArgs(args);
      console.warn(...sanitized);
    }
  },

  /**
   * Error level logging (always shown)
   */
  error(...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.error) {
      const sanitized = formatArgs(args);
      console.error(...sanitized);
    }
  },
};

// Log initial configuration (at debug level - only shown in debug mode)
if (CURRENT_LEVEL <= LOG_LEVELS.debug) {
  console.log(`[Logger] ✅ Initialized with LOG_LEVEL=${LOG_LEVEL} (current level: ${CURRENT_LEVEL})`);
}

module.exports = logger;

