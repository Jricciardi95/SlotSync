# HTTP Status Code Standardization Summary

## Standardized Error Response Format

All error responses now follow this format:

```json
{
  "error": "<error_code>",
  "message": "<human readable message>",
  "details": { ... }  // Optional, for additional context
}
```

Legacy fields are preserved for backward compatibility (e.g., `success: false`, `code`, etc.)

## Endpoint Status Code Behavior

### GET /health
- **200**: Always returns 200 with `{ ok: true, time: ISO string }`

### GET /api/ping
- **200**: Always returns 200 with health check info

### GET /api
- **200**: Always returns 200 with API info

### POST /api/identify-record
- **400**: Invalid input (missing file, empty file, invalid mime, file too large)
  - Error codes: `NO_FILE`, `EMPTY_FILE`, `INVALID_INPUT`
- **200**: Valid request - always returns 200 with `status` field:
  - `status: 'ok'` - High confidence match found
  - `status: 'low_confidence'` - Matches found but low confidence
  - `status: 'no_match'` - No matches found, but request was valid
- **500**: Unexpected server error
  - Error code: `INTERNAL_ERROR`
- **504**: Request timeout
  - Error code: `TIMEOUT`

### GET /api/debug/env (dev only)
- **403**: Production mode (debug endpoints disabled)
  - Error code: `FORBIDDEN`
- **200**: Environment configuration info

### GET /api/debug/vision (dev only)
- **403**: Production mode (debug endpoints disabled)
  - Error code: `FORBIDDEN`
- **200**: Vision configuration info

### POST /api/feedback
- **400**: Invalid input (missing imageHash)
  - Error code: `MISSING_PARAMETER`
- **200**: Feedback logged successfully
- **500**: Unexpected server error
  - Error code: `INTERNAL_ERROR`

### POST /api/metadata/resolve-by-text
- **400**: Invalid input (missing artist or albumTitle)
  - Error code: `MISSING_PARAMETER`
- **200**: Metadata resolved (even if no cover art found)
- **500**: Unexpected server error
  - Error code: `INTERNAL_ERROR`

### POST /api/identify-by-text
- **400**: Invalid input (missing artist or title)
  - Error code: `MISSING_PARAMETER`
- **200**: Valid request - always returns 200 with `status` field:
  - `status: 'ok'` - Match found (includes bestMatch and suggestions)
  - `status: 'no_match'` - No matches found (includes empty suggestions)
- **500**: Unexpected server error
  - Error code: `INTERNAL_ERROR`

**Note**: This endpoint was previously returning 400 for "no match" - now correctly returns 200 with `status: 'no_match'`.

### GET /api/discogs/release/:id
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

### POST /api/dev-test (dev only, if ENABLE_DEV_TEST=true)
- **400**: Invalid input (invalid test name)
  - Error code: `INVALID_PARAMETER`
- **200**: Test result
- **500**: Unexpected server error
  - Error code: `INTERNAL_ERROR`

### GET /api/dev-test/run-all (dev only, if ENABLE_DEV_TEST=true)
- **200**: All test results
- **500**: Unexpected server error
  - Error code: `INTERNAL_ERROR`

## Error Codes Reference

- `NO_FILE` - No file provided in request
- `EMPTY_FILE` - File is empty (0 bytes)
- `INVALID_INPUT` - Invalid input parameters or format
- `MISSING_PARAMETER` - Required parameter is missing
- `INVALID_PARAMETER` - Parameter format is invalid
- `FORBIDDEN` - Access denied (e.g., debug endpoint in production)
- `NOT_FOUND` - Resource not found
- `SERVICE_UNAVAILABLE` - External service not configured
- `EXTERNAL_API_ERROR` - Error from external API (Discogs, etc.)
- `INTERNAL_ERROR` - Unexpected server error
- `TIMEOUT` - Request timeout

