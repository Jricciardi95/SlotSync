# Logger Implementation Summary

## Overview
Replaced ad-hoc `console.log` usage with a lightweight logger utility that supports log levels and automatic secret sanitization.

## Logger Utility

**Location:** `backend-example/services/logger.js`

**Features:**
- **LOG_LEVEL support**: `debug|info|warn|error` (default: `info`)
- **Automatic secret sanitization**: Redacts keys like `token`, `key`, `secret`, `password`, `authorization`, `credential`
- **Preserves log prefixes**: Maintains existing prefixes like `[REQ]`, `[Discogs]`, `[Vision]`, etc.
- **Level-aware logging**: Reduces log noise in production by default

## Log Levels

- **`debug`**: Detailed information for development (not shown in production by default)
- **`info`**: General informational messages (shown in production)
- **`warn`**: Warning messages (always shown)
- **`error`**: Error messages (always shown)

## Environment Variable

```bash
# Set log level (default: info)
export LOG_LEVEL=debug   # Show all logs (development)
export LOG_LEVEL=info    # Show info, warn, error (production default)
export LOG_LEVEL=warn    # Show only warnings and errors
export LOG_LEVEL=error   # Show only errors
```

## Changes Made

### 1. Created Logger Utility ✅
- New file: `backend-example/services/logger.js`
- Supports all log levels with automatic sanitization
- Preserves existing log prefix format

### 2. Converted Discogs Request Headers Logging ✅
**Location:** `backend-example/services/discogsHttpClient.js`

**Before:**
- Logged full headers including Authorization tokens
- Verbose logging at info level
- Manual sanitization in some places

**After:**
- Headers logged at `debug` level only
- Automatic sanitization by logger
- Reduced to single summary log at `info` level
- Errors still logged at appropriate levels

**Key Changes:**
- `discogs_${op}_headers`: Moved to `debug` level (logger auto-sanitizes Authorization)
- `discogs_${op}_start`: Moved to `debug` level
- `discogs_${op}_complete`: Moved to `debug` level (success cases)
- Errors remain at `warn`/`error` levels

### 3. Converted Vision Credential Logs ✅
**Location:** `backend-example/server-hybrid.js`

**Before:**
- Logged full credential paths (absolute paths)
- Multiple log statements for credential validation

**After:**
- Logs only basename of credential files (no full paths)
- Consolidated validation logging
- All credential logs at `info` level (important startup info)

**Key Changes:**
- `Auto-configured GOOGLE_APPLICATION_CREDENTIALS`: Uses `path.basename()` for sanitization
- `Using GOOGLE_APPLICATION_CREDENTIALS`: Uses `path.basename()` for sanitization
- Credential validation logs: Preserved at `info` level

### 4. Converted identify-record Pipeline Noisy Logs ✅
**Location:** `backend-example/server-hybrid.js`

**Before:**
- Phase logs at `info` level (phase1_start, phase1_complete, etc.)
- Detailed candidate/embedding logs at `info` level
- Verbose Discogs search logs

**After:**
- Phase logs moved to `debug` level
- Candidate/embedding logs remain at `debug` level
- Discogs search logs: Summary at `info`, details at `debug`
- Key events (START, errors) remain at `info`/`warn`/`error` levels

**Key Changes:**
- `[REQ ${reqId}] START`: Remains at `info` level (key event)
- `[REQ ${reqId}] phase*_start`: Moved to `debug` level
- `[REQ ${reqId}] phase*_complete`: Moved to `debug` level
- `parse_upload OK`: Moved to `debug` level
- `parse_upload FAIL`: Remains at `warn` level (errors)
- Discogs search: Summary at `info`, detailed query logs at `debug`
- `HARD TIMEOUT`: Remains at `error` level

## Production Impact

### Before (LOG_LEVEL=info)
- Hundreds of log lines per request
- Credential paths exposed
- Headers with tokens logged
- Detailed phase-by-phase logging

### After (LOG_LEVEL=info)
- Key events only: START, errors, warnings, final results
- Credential paths sanitized (basename only)
- Headers/tokens automatically sanitized
- Phase details hidden (only shown in debug mode)

### Example Log Reduction

**Before (one identify-record request):**
```
[REQ abc123] START /api/identify-record content-type=multipart/form-data
[REQ abc123] parse_upload OK fileSizeBytes=245678 mime=image/jpeg
[REQ abc123] phase1_start
[Discogs] 🔍 Starting Discogs search...
[Discogs] 🔍 Artist: "Bob Seger"
[Discogs] 🔍 Title: "Live Bullet"
[Discogs] 🔍 Generated 12 query variations
[Discogs]   Query 1/12: "Bob Seger Live Bullet"
[REQ abc123] discogs_search_query_start url=...
[REQ abc123] discogs_search_query_headers User-Agent="..." Authorization="Discogs token=abcd..."
[REQ abc123] discogs_search_query_complete elapsedMs=1234 status=200 resultsCount=5
[Discogs]     → Found 5 raw results (will filter by similarity)
... (many more lines)
[REQ abc123] phase1_complete elapsed=4567ms candidates=5
[REQ abc123] phase2_start candidates=5
... (many more lines)
[REQ abc123] phase2_complete elapsed=1234ms
[REQ abc123] phase3_start
... (many more lines)
[REQ abc123] phase3_complete elapsed=567ms
```

**After (LOG_LEVEL=info):**
```
[Logger] ✅ Initialized with LOG_LEVEL=info (current level: 1)
[REQ abc123] START /api/identify-record
[Discogs] 🔍 Generated 12 query variations
[Discogs] 📊 Search Summary: 3 results from 8/12 queries
[Discogs]   🏆 Best match: "Bob Seger" - "Live Bullet" (similarity: 0.829)
```

**After (LOG_LEVEL=debug):**
- Shows all the detailed logs (same as before, but with automatic sanitization)

## Secret Sanitization

The logger automatically sanitizes:

1. **Sensitive keys**: `token`, `key`, `secret`, `password`, `authorization`, `credential`, etc.
2. **String patterns**: 
   - Long alphanumeric strings (>20 chars) → `xxxx...[REDACTED:lengthchars]`
   - Authorization headers → `Bearer xxxx...[REDACTED]`
   - Token patterns → `token=xxxx...[REDACTED]`
3. **Object values**: Recursively sanitizes nested objects

**Example:**
```javascript
// Input
logger.info('Headers:', { 'Authorization': 'Discogs token=abc123xyz789' });

// Output (at info level)
[Discogs] Headers: { 'Authorization': 'Discs...[REDACTED:20chars]' }
```

## Migration Strategy

- **NOT a full refactor**: Only converted the noisiest areas:
  1. Discogs request headers logging
  2. Vision credential logs
  3. identify-record pipeline phase logs
- **Preserved existing patterns**: Still uses same log prefixes and format
- **Gradual migration**: Other areas can be converted incrementally

## Testing

### Test in Development Mode
```bash
export LOG_LEVEL=debug
node server-hybrid.js
# Should show all logs with sanitization
```

### Test in Production Mode
```bash
export LOG_LEVEL=info
node server-hybrid.js
# Should show only key events and errors
```

### Test Secret Sanitization
```javascript
const logger = require('./services/logger');
logger.info('Test', { 
  token: 'secret123456789',
  headers: { Authorization: 'Bearer abc123' }
});
// Should output sanitized versions
```

## Files Modified

1. **backend-example/services/logger.js** (NEW) - Logger utility
2. **backend-example/server-hybrid.js** - Converted noisy logs
3. **backend-example/services/discogsHttpClient.js** - Converted header logs

## Next Steps (Optional)

To complete the migration:
1. Convert remaining `console.log` statements throughout the codebase
2. Convert `console.warn` to `logger.warn`
3. Convert `console.error` to `logger.error`
4. Consider structured logging format (JSON) for production
5. Add request ID correlation to all log statements

## Notes

- Logger initialization message is logged at `info` level (visible in production)
- All error/warning logs remain at appropriate levels (always visible)
- Debug logs are completely hidden in production (LOG_LEVEL=info)
- Secret sanitization works recursively on nested objects
- Log prefixes are preserved for consistency with existing tooling

