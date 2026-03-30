# Endpoint HTTP Status Code Reference

## Standardized Error Response Format

All error responses follow this format:

```json
{
  "error": "<error_code>",
  "message": "<human readable message>",
  "details": { ... }  // Optional, for additional context
}
```

Legacy fields are preserved for backward compatibility.

## Endpoints

### GET /health

**Status Codes:**
- **200**: Server is healthy

**Response:**
```json
{
  "ok": true,
  "time": "2024-01-01T00:00:00.000Z"
}
```

---

### GET /api/ping

**Status Codes:**
- **200**: Server is healthy

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "server": "SlotSync API",
  "version": "1.0.0"
}
```

---

### GET /api

**Status Codes:**
- **200**: API information

**Response:**
```json
{
  "name": "SlotSync API",
  "version": "1.0.0",
  "features": [...],
  "endpoints": {...}
}
```

---

### POST /api/identify-record

**Status Codes:**
- **400**: Invalid input (missing file, empty file, invalid mime type, file too large)
  - Error codes: `NO_FILE`, `EMPTY_FILE`, `INVALID_INPUT`
- **200**: Valid request - always returns 200 with `status` field:
  - `status: 'ok'` - High confidence match found
  - `status: 'low_confidence'` - Matches found but low confidence
  - `status: 'no_match'` - No matches found, but request was valid
- **500**: Unexpected server error
  - Error code: `INTERNAL_ERROR`
- **504**: Request timeout
  - Error code: `TIMEOUT`

**Error Response (400):**
```json
{
  "error": "NO_FILE",
  "message": "Please provide an image file in the request",
  "success": false
}
```

**Success Response (200):**
```json
{
  "status": "ok" | "low_confidence" | "no_match",
  "confidenceLevel": "high" | "medium" | "low",
  "suggestions": [...],
  "best": {...} | null,
  "success": true | false,
  "albumSuggestions": [...],
  "message": "...",
  "debug": {...}
}
```

---

### GET /api/debug/env (dev only)

**Status Codes:**
- **403**: Production mode (debug endpoints disabled)
  - Error code: `FORBIDDEN`
- **200**: Environment configuration info

**Error Response (403):**
```json
{
  "error": "FORBIDDEN",
  "message": "Debug endpoint disabled in production"
}
```

---

### GET /api/debug/vision (dev only)

**Status Codes:**
- **403**: Production mode (debug endpoints disabled)
  - Error code: `FORBIDDEN`
- **200**: Vision configuration info

**Error Response (403):**
```json
{
  "error": "FORBIDDEN",
  "message": "Debug endpoint disabled in production"
}
```

---

### POST /api/feedback

**Status Codes:**
- **400**: Invalid input (missing imageHash)
  - Error code: `MISSING_PARAMETER`
- **200**: Feedback logged successfully
- **500**: Unexpected server error
  - Error code: `INTERNAL_ERROR`

**Error Response (400):**
```json
{
  "error": "MISSING_PARAMETER",
  "message": "imageHash is required",
  "details": {
    "required": ["imageHash"]
  }
}
```

**Success Response (200):**
```json
{
  "success": true,
  "message": "Feedback logged"
}
```

---

### POST /api/metadata/resolve-by-text

**Status Codes:**
- **400**: Invalid input (missing artist or albumTitle)
  - Error code: `MISSING_PARAMETER`
- **200**: Metadata resolved (even if no cover art found)
- **500**: Unexpected server error
  - Error code: `INTERNAL_ERROR`

**Error Response (400):**
```json
{
  "error": "MISSING_PARAMETER",
  "message": "Artist and albumTitle are required",
  "details": {
    "required": ["artist", "albumTitle"]
  }
}
```

**Success Response (200):**
```json
{
  "success": true,
  "metadata": {
    "artist": "...",
    "album": "...",
    "coverImage": "...",
    ...
  }
}
```

---

### POST /api/identify-by-text

**Status Codes:**
- **400**: Invalid input (missing artist or title)
  - Error code: `MISSING_PARAMETER`
- **200**: Valid request - always returns 200 with `status` field:
  - `status: 'ok'` - Match found (includes bestMatch and suggestions)
  - `status: 'no_match'` - No matches found (includes empty suggestions)
- **500**: Unexpected server error
  - Error code: `INTERNAL_ERROR`

**Error Response (400):**
```json
{
  "error": "MISSING_PARAMETER",
  "message": "Both artist and title are required for text lookup",
  "details": {
    "required": ["artist", "title"]
  },
  "success": false
}
```

**Success Response (200) - Match Found:**
```json
{
  "status": "ok",
  "bestMatch": {...},
  "suggestions": [...],
  "success": true,
  "confidence": 0.85,
  "alternates": [...]
}
```

**Success Response (200) - No Match:**
```json
{
  "status": "no_match",
  "message": "Could not find album \"...\" by \"...\". Please check spelling or try manual entry.",
  "suggestions": [],
  "success": false,
  "code": "NOT_FOUND",
  "error": "Could not find album"
}
```

---

### GET /api/discogs/release/:id

**Status Codes:**
- **400**: Invalid input (invalid release ID format)
  - Error code: `INVALID_PARAMETER`
- **503**: Service unavailable (Discogs API not configured)
  - Error code: `SERVICE_UNAVAILABLE`
- **404**: Release not found
  - Error code: `NOT_FOUND`
- **200**: Release data
- **500**: Unexpected server error
  - Error code: `INTERNAL_ERROR`
- **Other**: Propagates Discogs API errors
  - Error code: `EXTERNAL_API_ERROR`

**Error Response (400):**
```json
{
  "error": "INVALID_PARAMETER",
  "message": "Invalid release ID",
  "details": {
    "parameter": "id",
    "value": "..."
  }
}
```

**Error Response (503):**
```json
{
  "error": "SERVICE_UNAVAILABLE",
  "message": "Discogs API not configured"
}
```

**Error Response (404):**
```json
{
  "error": "NOT_FOUND",
  "message": "Release not found",
  "details": {
    "releaseId": 123
  }
}
```

**Success Response (200):**
```json
{
  "success": true,
  "discogsId": 123,
  "artist": "...",
  "title": "...",
  "year": 1977,
  "coverImageRemoteUrl": "...",
  "tracks": [...],
  "genres": [...],
  "styles": [...]
}
```

---

### POST /api/dev-test (dev only, requires ENABLE_DEV_TEST=true)

**Status Codes:**
- **400**: Invalid input (invalid test name)
  - Error code: `INVALID_PARAMETER`
- **200**: Test result
- **500**: Unexpected server error
  - Error code: `INTERNAL_ERROR`

**Error Response (400):**
```json
{
  "error": "INVALID_PARAMETER",
  "message": "Invalid test name",
  "details": {
    "parameter": "testName",
    "value": "...",
    "availableTests": [...]
  }
}
```

**Success Response (200):**
```json
{
  "success": true,
  "testName": "...",
  "result": {...}
}
```

---

### GET /api/dev-test/run-all (dev only, requires ENABLE_DEV_TEST=true)

**Status Codes:**
- **200**: All test results
- **500**: Unexpected server error
  - Error code: `INTERNAL_ERROR`

**Success Response (200):**
```json
{
  "success": true,
  "results": {...}
}
```

**Error Response (500):**
```json
{
  "error": "INTERNAL_ERROR",
  "message": "Test execution failed",
  "details": {
    "originalError": "..."
  },
  "success": false
}
```

---

## Error Codes Reference

| Code | Description |
|------|-------------|
| `NO_FILE` | No file provided in request |
| `EMPTY_FILE` | File is empty (0 bytes) |
| `INVALID_INPUT` | Invalid input parameters or format |
| `MISSING_PARAMETER` | Required parameter is missing |
| `INVALID_PARAMETER` | Parameter format is invalid |
| `FORBIDDEN` | Access denied (e.g., debug endpoint in production) |
| `NOT_FOUND` | Resource not found |
| `SERVICE_UNAVAILABLE` | External service not configured |
| `EXTERNAL_API_ERROR` | Error from external API (Discogs, etc.) |
| `INTERNAL_ERROR` | Unexpected server error |
| `TIMEOUT` | Request timeout |

