# Production Safety Hardening Summary

## Overview
This document describes the production safety measures added to `backend-example/server-hybrid.js` to protect against common attacks and resource exhaustion.

## Changes Made

### 1. Rate Limiting ✅

**Package Added:**
- `express-rate-limit@^7.1.5` (added to `package.json`)

**Implementation:**
- **General API Limiter**: Applied to all `/api/` routes
  - **Limit**: 100 requests per 15 minutes per IP
  - **Headers**: Uses standard `RateLimit-*` headers (legacy disabled)
  - **Message**: "Too many requests from this IP, please try again later."

- **Stricter Identify Record Limiter**: Applied specifically to `/api/identify-record`
  - **Limit**: 20 requests per 15 minutes per IP
  - **Reason**: More restrictive due to API costs (Google Vision, Discogs)
  - **Headers**: Same as general limiter
  - **Message**: "Too many identification requests from this IP, please try again later."

**Code Location:**
- Lines ~560-580 in `server-hybrid.js`
- Applied to `/api/identify-record` endpoint at line ~4169

### 2. CORS Restrictions ✅

**Implementation:**
- Replaced permissive `cors()` with restricted origin-based CORS
- **Production**: Requires `ALLOWED_ORIGINS` environment variable (never allows `"*"`)
- **Development**: Defaults to localhost and Expo dev server origins
- Allows requests with no origin (mobile apps, Postman, etc.)
- Logs blocked origins for debugging

**Code Location:**
- Lines ~582-638 in `server-hybrid.js`

**Allowed Origins (Development Defaults):**
- `http://localhost:8081` (Expo default)
- `http://localhost:19000` (Expo web)
- `http://localhost:19006` (Expo web alternative)
- `http://127.0.0.1:8081`
- `http://127.0.0.1:19000`
- `http://127.0.0.1:19006`

### 3. Body Size Limits ✅

**Implementation:**
- **JSON Body Limit**: 1MB
- **URL Encoded Body Limit**: 1MB (extended mode enabled)
- Prevents DoS attacks via large payloads

**Code Location:**
- Lines ~640-643 in `server-hybrid.js`

**Previous State:**
- No explicit limits (Express default is 100kb, but better to be explicit)

## Environment Variables

### Required for Production

```bash
# CORS Origins (comma-separated list)
ALLOWED_ORIGINS=https://yourdomain.com,https://www.yourdomain.com

# Node Environment
NODE_ENV=production
```

### Optional Configuration

```bash
# Override rate limits (if needed)
# Note: These are hardcoded currently, but can be made configurable if needed
# API_LIMIT_MAX=100
# API_LIMIT_WINDOW_MS=900000
# IDENTIFY_LIMIT_MAX=20
# IDENTIFY_LIMIT_WINDOW_MS=900000
```

## Installation

1. **Install Dependencies:**
   ```bash
   cd backend-example
   npm install
   ```

   This will install `express-rate-limit@^7.1.5` if not already present.

2. **Set Environment Variables:**
   
   **Development** (optional - uses defaults):
   ```bash
   # Uses localhost defaults, no ALLOWED_ORIGINS needed
   NODE_ENV=development
   ```
   
   **Production** (required):
   ```bash
   export NODE_ENV=production
   export ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
   ```

3. **Start Server:**
   ```bash
   npm start
   # or
   node server-hybrid.js
   ```

## Security Benefits

### Rate Limiting
- **Prevents DoS Attacks**: Limits request volume per IP
- **Cost Protection**: Stricter limits on expensive endpoints (identify-record)
- **Resource Management**: Prevents server resource exhaustion

### CORS Restrictions
- **CSRF Protection**: Only allows requests from trusted origins
- **Prevents Unauthorized Access**: Blocks requests from unknown domains
- **Production Safety**: Never allows wildcard `"*"` in production

### Body Size Limits
- **DoS Prevention**: Prevents memory exhaustion from large payloads
- **Resource Management**: Limits memory usage per request
- **Explicit Configuration**: Clear limits prevent unexpected behavior

## Testing

### Test Rate Limiting

```bash
# Test general API limiter (should allow 100 requests)
for i in {1..101}; do
  curl -X GET http://localhost:3000/api/ping
done

# Test identify-record limiter (should allow 20 requests)
for i in {1..21}; do
  curl -X POST http://localhost:3000/api/identify-record \
    -F "image=@test-image.jpg"
done
```

### Test CORS

```bash
# Should succeed (allowed origin)
curl -X GET http://localhost:3000/api/ping \
  -H "Origin: http://localhost:8081"

# Should fail (blocked origin)
curl -X GET http://localhost:3000/api/ping \
  -H "Origin: https://evil.com"
```

### Test Body Size Limits

```bash
# Should fail (payload too large)
curl -X POST http://localhost:3000/api/identify-record \
  -H "Content-Type: application/json" \
  -d "$(python3 -c "print('x' * 2000000)")"
```

## Monitoring

### Rate Limit Headers

When rate limited, responses include:
- `RateLimit-Limit`: Maximum requests allowed
- `RateLimit-Remaining`: Remaining requests in current window
- `RateLimit-Reset`: Time when limit resets (Unix timestamp)

### Logging

The server logs:
- CORS blocked origins (warnings)
- Rate limit configuration on startup
- CORS configuration on startup (number of origins, list in dev mode only)

## Notes

- Rate limiting uses in-memory storage (default)
- For distributed systems, consider using Redis store for rate limiting
- CORS origins are case-sensitive
- Mobile apps (no origin) are allowed by default (can be restricted if needed)
- Body size limits apply to both JSON and URL-encoded payloads

## Future Enhancements

Possible improvements:
1. Redis-based rate limiting for distributed deployments
2. Per-user rate limiting (if authentication added)
3. Rate limit whitelist for trusted IPs
4. Configurable rate limit values via environment variables
5. Rate limit bypass for health check endpoints

## Related Files

- `backend-example/server-hybrid.js` - Main server file with security middleware
- `backend-example/package.json` - Dependencies (includes express-rate-limit)
- `.env` (not in repo) - Environment variable configuration

