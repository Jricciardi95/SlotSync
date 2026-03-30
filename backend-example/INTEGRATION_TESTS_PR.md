# Integration Tests for `/api/identify-record` Endpoint

## Summary

This PR adds comprehensive integration tests for the `/api/identify-record` endpoint using `supertest`. All external dependencies (Google Vision API, Discogs API, CLIP embeddings, SQLite database) are mocked to ensure tests can run without network calls or API keys.

## Changes Made

### 1. Added Dependencies
- Added `supertest@^6.3.3` to `devDependencies` in `package.json`

### 2. Created Integration Test File
- Created `backend-example/__tests__/integration/identifyRecord.test.js`
  - Comprehensive test suite covering input validation, successful identification, error handling, and response structure
  - All external APIs are mocked (Vision, Discogs, embeddings, database)
  - Tests can run with `NODE_ENV=test` and no API keys

### 3. Fixed Code Issue
- Removed duplicate `generateImageHash` function declaration in `server-hybrid.js` (line 775)
  - The function was already extracted to `utils/imageHash.js` but the original definition was not removed

### 4. Updated Jest Configuration
- Updated `jest.config.js` to increase `testTimeout` to 30000ms for integration tests

## Test Coverage

### Input Validation Tests
- ✅ Returns 400 when no file is provided
- ✅ Returns 400 when file is empty
- ✅ Returns 400 when file is too large (>10MB)
- ✅ Returns 400 when file type is invalid

### Successful Identification Tests
- ✅ Returns 200 with suggestions when Vision finds candidates and Discogs finds matches
- ✅ Returns 200 with `no_match` status when no candidates are found
- ✅ Returns 200 with `low_confidence` when matches found but confidence is low

### Error Handling Tests
- ✅ Returns 500 when Vision API fails
- ✅ Returns 200 with low_confidence when Discogs API fails (graceful degradation)

### Response Structure Tests
- ✅ Includes all required fields (`status`, `confidenceLevel`, `suggestions`)
- ✅ Validates `status` is one of: `ok`, `low_confidence`, `no_match`
- ✅ Validates `confidenceLevel` is one of: `high`, `medium`, `low`

## Mocking Strategy

### External Dependencies Mocked
1. **Google Vision API** (`@google-cloud/vision`)
   - Mocks `ImageAnnotatorClient` and `batchAnnotateImages` method

2. **Discogs HTTP Client** (`services/discogsHttpClient`)
   - Mocks `discogsHttpRequest` function

3. **Embedding Service** (`services/embeddingService`)
   - Mocks `getImageEmbedding` to avoid CLIP model loading

4. **Vector Index** (`services/vectorIndex`)
   - Mocks `initialize`, `initializeVectorIndex`, `findNearestCovers`, `indexCoverEmbedding`, `getEmbeddingCount`

5. **SQLite Database** (`sqlite3`)
   - Mocks database initialization and all database methods (`run`, `get`, `all`, `close`)

## Running Tests

```bash
# Run all tests
cd backend-example
npm test

# Run only integration tests
npm run test:integration

# Run only unit tests
npm run test:unit

# Run with verbose output
npm test -- __tests__/integration/identifyRecord.test.js --verbose
```

## TROUBLESHOOTING

### Issue: `sh: jest: command not found`

**Cause:** Jest is not installed locally, or `node_modules` is missing/corrupted.

**Solution:**
```bash
cd backend-example
rm -rf node_modules package-lock.json
npm install
npm test
```

### Issue: `npm EPERM` error referencing global npm paths

**Cause:** npm is trying to write to global directories instead of local `node_modules`.

**Solution:**
1. Ensure you're in the `backend-example` directory
2. Remove any global npm cache issues:
   ```bash
   cd backend-example
   rm -rf node_modules package-lock.json
   npm install
   ```
3. Verify local installation:
   ```bash
   ls node_modules/.bin/jest  # Should exist
   npm test  # Should use local jest
   ```

### Issue: Tests fail with "Could not load the default credentials"

**Cause:** `NODE_ENV` is not set to `test`, causing server startup code to run.

**Solution:**
- Tests automatically set `NODE_ENV=test` via `jest.setup.js`
- If issues persist, verify `jest.config.js` includes `setupFilesAfterEnv: ['<rootDir>/jest.setup.js']`

### Issue: Tests require API keys

**Cause:** Mocks are not properly set up.

**Solution:**
- All external APIs are mocked in `__tests__/integration/identifyRecord.test.js`
- Tests should pass with no API keys
- Verify mocks are declared before `require('../../server-hybrid')`

### Verifying Local Installation

To ensure everything uses local dependencies:

```bash
cd backend-example
# Check jest is installed locally
ls node_modules/.bin/jest

# Check supertest is installed locally
ls node_modules/.bin/supertest || echo "supertest is a library, not a CLI tool"

# Run tests (should use local jest)
npm test
```

If `npm test` still fails, try:
```bash
# Use npx to explicitly use local jest
npx jest
```

## Environment Setup

Tests automatically set `NODE_ENV=test` and provide mock values for:
- `DISCOGS_PERSONAL_ACCESS_TOKEN` (set to `'test-token'`)
- `GOOGLE_APPLICATION_CREDENTIALS` (set to `/fake/path.json`)

No actual API keys or credentials are required to run tests.

## Files Changed

1. `backend-example/package.json` - Added `supertest` dependency
2. `backend-example/jest.config.js` - Increased test timeout
3. `backend-example/server-hybrid.js` - Removed duplicate `generateImageHash` function
4. `backend-example/__tests__/integration/identifyRecord.test.js` - New integration test file

## Next Steps

- Run tests to ensure they pass: `npm test`
- Consider adding more test cases for edge cases (e.g., malformed Discogs responses, partial Vision API failures)
- Consider adding performance tests for the endpoint

