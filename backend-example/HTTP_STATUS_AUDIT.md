# HTTP Status Code Audit and Standardization

## Endpoints Summary

### GET /health (from routes/health.js)
- **Status Code**: 200 (OK)
- **Response**: `{ ok: true, time: ISO string }`
- **Status**: ✅ Already correct

### GET /api/ping (from routes/health.js)
- **Status Code**: 200 (OK)
- **Response**: `{ status: 'ok', timestamp: ISO string, server: string, version: string }`
- **Status**: ✅ Already correct

### GET /api
- **Status Code**: 200 (OK)
- **Response**: API info JSON
- **Status**: ✅ Already correct

### POST /api/identify-record
- **Invalid Input (400)**: Missing file, empty file, invalid mime
- **Valid Request (200)**: Always returns 200 with status field ('ok', 'low_confidence', 'no_match')
- **Unexpected Errors (500)**: Standardized error shape
- **Status**: ⚠️ Needs standardization of error responses

### GET /api/debug/env (dev only)
- **Production (403)**: Debug endpoint disabled
- **Success (200)**: Environment info
- **Status**: ✅ Already correct

### GET /api/debug/vision (dev only)
- **Production (403)**: Debug endpoint disabled
- **Success (200)**: Vision configuration info
- **Status**: ✅ Already correct

### POST /api/feedback
- **Invalid Input (400)**: Missing imageHash
- **Success (200)**: Feedback logged
- **Unexpected Errors (500)**: Needs standardization
- **Status**: ⚠️ Needs standardization of error responses

### POST /api/metadata/resolve-by-text
- **Invalid Input (400)**: Missing artist or albumTitle
- **Success (200)**: Metadata resolved (even if no cover art found)
- **Unexpected Errors (500)**: Needs standardization
- **Status**: ⚠️ Needs standardization of error responses

### POST /api/identify-by-text
- **Invalid Input (400)**: Missing artist or title
- **Valid Request (200)**: Should return 200 even if no match (currently returns 400 for no match - NEEDS FIX)
- **Unexpected Errors (500)**: Needs standardization
- **Status**: ⚠️ Needs fix: no match should be 200 with status field, not 400

### GET /api/discogs/release/:id
- **Invalid Input (400)**: Invalid release ID
- **Service Unavailable (503)**: Discogs API not configured
- **Not Found (404)**: Release not found
- **Success (200)**: Release data
- **Unexpected Errors (500)**: Needs standardization
- **Status**: ⚠️ Needs standardization of error responses

### POST /api/dev-test (dev only, if ENABLE_DEV_TEST=true)
- **Invalid Input (400)**: Invalid test name
- **Success (200)**: Test result
- **Unexpected Errors (500)**: Needs standardization
- **Status**: ⚠️ Needs standardization of error responses

### GET /api/dev-test/run-all (dev only, if ENABLE_DEV_TEST=true)
- **Success (200)**: All test results
- **Unexpected Errors (500)**: Needs standardization
- **Status**: ⚠️ Needs standardization of error responses

## Standardized Error Response Shape

All error responses should follow this format:

```json
{
  "error": "<error_code>",
  "message": "<human readable message>",
  "details": { ... }  // Optional, for additional context
}
```

For backward compatibility, legacy fields may be included (e.g., `success: false`, `code`, etc.)

