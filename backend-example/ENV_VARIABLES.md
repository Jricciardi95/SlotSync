# Environment Variables Reference

This document lists all environment variables used by the SlotSync backend, their defaults, and when they're required.

## Quick Start

For development, create a `.env` file in `backend-example/`:

```bash
# Required for production
DISCOGS_PERSONAL_ACCESS_TOKEN=your_token_here
GOOGLE_APPLICATION_CREDENTIALS=/path/to/credentials.json

# Optional
PORT=3000
LOG_LEVEL=info
```

## Configuration

All environment variables are centralized in `backend-example/config/index.js`. The config module:
- Provides sensible defaults for all variables
- Auto-discovers Google Vision credentials if not set
- Validates required config in production (but doesn't block dev/test)
- Allows running tests without API keys (`NODE_ENV=test`)

## Server Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port number |
| `NODE_ENV` | `development` | Environment: `development`, `production`, or `test` |

## Google Vision API

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `GOOGLE_APPLICATION_CREDENTIALS` | Auto-discovered | Production | Path to Google Cloud service account JSON file. Auto-discovered from: `backend-example/credentials.json`, `backend-example/credentials/credentials.json`, or repo root `credentials.json` |
| `ENABLE_GOOGLE_VISION` | `true` | No | Set to `false` to disable Google Vision API |
| `VISION_TIMEOUT_MS` | `20000` | No | Vision API timeout in milliseconds (20 seconds) |

## Discogs API

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| `DISCOGS_PERSONAL_ACCESS_TOKEN` | `null` | Production | Discogs personal access token (preferred) |
| `DISCOGS_TOKEN` | `null` | Production | Alias for `DISCOGS_PERSONAL_ACCESS_TOKEN` |
| `DISCOGS_API_KEY` | `null` | Production* | Discogs API key (alternative to token) |
| `DISCOGS_CONSUMER_KEY` | `null` | Production* | Alias for `DISCOGS_API_KEY` |
| `DISCOGS_API_SECRET` | `null` | Production* | Discogs API secret (required if using API key) |
| `DISCOGS_CONSUMER_SECRET` | `null` | Production* | Alias for `DISCOGS_API_SECRET` |
| `DISCOGS_USER_AGENT` | `SlotSync/1.0 (james@example.com)` | No | User-Agent string for Discogs API requests |
| `DISCOGS_SEARCH_TIMEOUT_MS` | `12000` | No | Discogs search timeout in milliseconds (12 seconds) |
| `DISCOGS_FETCH_TIMEOUT_MS` | `12000` | No | Discogs fetch timeout in milliseconds (12 seconds) |
| `DISCOGS_SELF_TEST` | `false` | No | Set to `true` to run Discogs connectivity test on startup |

*Required in production if `DISCOGS_PERSONAL_ACCESS_TOKEN` is not set.

## Database

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_PATH` | `backend-example/identified_records.db` | SQLite database file path |

## Embedding Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `EMBEDDING_TIMEOUT_MS` | `30000` | Embedding computation timeout in milliseconds (30 seconds) |
| `EMBEDDING_K` | `5` | Number of nearest neighbors to return from vector search |
| `EMBEDDING_MIN_SIMILARITY` | `0.65` | Minimum similarity threshold for embedding matches |
| `VECTOR_SEARCH_TIMEOUT_MS` | `5000` | Vector search timeout in milliseconds (5 seconds) |
| `MIN_EMBEDDING_DATASET_SIZE` | `200` | Minimum dataset size before using embeddings (cold start protection) |

## Scoring & Thresholds

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTO_ACCEPT_THRESHOLD` | `0.8` | Score threshold for auto-accepting matches |
| `SUGGESTIONS_THRESHOLD` | `0.5` | Score threshold for returning suggestions |
| `CONFIDENCE_THRESHOLD` | `0.5` | Legacy confidence threshold (used in some code paths) |
| `STRONG_ACCEPT_THRESHOLD` | `0.94` | Threshold for treating embedding match as final (no OCR override) |
| `STRONG_ACCEPT_MARGIN` | `0.04` | Margin for strong accept threshold |
| `SKIP_VISION_EMBEDDING_THRESHOLD` | `0.92` | Threshold for skipping Vision API (proceed without OCR) |
| `SKIP_VISION_MARGIN_THRESHOLD` | `0.03` | Margin for skip Vision threshold |

## Phase 2 Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `PHASE2_BUDGET_MS` | `45000` | Maximum time budget for Phase 2 processing (45 seconds) |
| `MAX_DISCOGS_SEARCHES` | `5` | Maximum number of Discogs searches per request |

## Request Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `REQUEST_DEADLINE_MS` | `80000` | Request deadline in milliseconds (80 seconds, client timeout is 90s) |
| `REQUEST_TIMEOUT_MS` | `85000` | Server-side request timeout in milliseconds (85 seconds) |

## CORS Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `ALLOWED_ORIGINS` | Dev defaults* | Comma-separated list of allowed CORS origins. In dev, defaults to localhost/Expo origins. In production, **must** be set explicitly. |

*Development defaults: `http://localhost:8081`, `http://localhost:19000`, `http://localhost:19006`, `http://127.0.0.1:8081`, `http://127.0.0.1:19000`, `http://127.0.0.1:19006`

## OpenAI Configuration (Optional)

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | `null` | OpenAI API key for GPT-based OCR parsing and Vinyl Vision |
| `GPT_MODEL` | `gpt-4o` | GPT model to use |
| `USE_GPT_OCR_PARSING` | `false` | Set to `true` to use GPT for OCR text parsing |
| `ENABLE_VINYL_VISION` | `true` | Set to `false` to disable Vinyl Vision feature |
| `ENABLE_GPT4_VISION` | `false` | Set to `true` to enable GPT-4 Vision API |

## Logging Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `LOG_LEVEL` | `info` | Log level: `debug`, `info`, `warn`, or `error` |
| `DEBUG_CACHE` | `false` | Set to `true` to enable cache debug logging |
| `DEBUG_EMBEDDINGS` | `false` | Set to `true` to enable embedding debug logging |
| `DEBUG_SCORING` | `false` | Set to `true` to enable scoring debug logging |
| `DEBUG_IDENTIFY` | `false` | Set to `true` to include debug output in identify-record responses |
| `DEBUG_IDENTIFICATION` | `false` | Set to `true` to enable identification pipeline debug logging |
| `SCAN_DECISION_LOG_PATH` | `null` | Path to log file for scan decisions (optional) |

## Feature Flags

| Variable | Default | Description |
|----------|---------|-------------|
| `ENABLE_DEV_TEST` | `false` | Set to `true` to enable dev test endpoint |

## Production Requirements

In production (`NODE_ENV=production`), the following are validated (warnings logged, but server still starts):

1. **Discogs API**: Either `DISCOGS_PERSONAL_ACCESS_TOKEN` or `DISCOGS_API_KEY` must be set
2. **Google Vision**: `GOOGLE_APPLICATION_CREDENTIALS` must be set and point to a valid file

## Test Environment

When `NODE_ENV=test`:
- No API keys are required
- All validation is skipped
- Server can run without Discogs or Vision credentials

## Usage Examples

### Development
```bash
# .env file
DISCOGS_PERSONAL_ACCESS_TOKEN=your_token_here
GOOGLE_APPLICATION_CREDENTIALS=./credentials.json
LOG_LEVEL=debug
```

### Production
```bash
# .env file
NODE_ENV=production
PORT=3000
DISCOGS_PERSONAL_ACCESS_TOKEN=your_token_here
GOOGLE_APPLICATION_CREDENTIALS=/absolute/path/to/credentials.json
ALLOWED_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
LOG_LEVEL=info
```

### Testing
```bash
# Tests run with NODE_ENV=test automatically
# No API keys needed
npm test
```

## Accessing Configuration in Code

All configuration is centralized in `backend-example/config/index.js`:

```javascript
const config = require('./config');

// Server
const port = config.server.port;
const isProduction = config.IS_PRODUCTION;

// Discogs
const token = config.discogs.personalAccessToken;
const timeout = config.discogs.searchTimeoutMs;

// Google Vision
const credsPath = config.googleVision.credentialsPath;
const enabled = config.googleVision.enabled;

// Scoring
const threshold = config.scoring.autoAcceptThreshold;
```

## Migration Notes

If you're migrating from direct `process.env` usage:
- All `process.env.*` reads have been replaced with `config.*` throughout the codebase
- The config module maintains backward compatibility by setting `process.env.GOOGLE_APPLICATION_CREDENTIALS` if auto-discovered
- Defaults are preserved - no behavior changes

