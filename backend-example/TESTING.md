# Testing Guide for SlotSync Backend

## Setup

1. Install Jest (if not already installed):
```bash
cd backend-example
npm install jest --save-dev
```

## Running Tests

```bash
npm test
```

## Test Structure

Tests are located in `__tests__/unit/`:

- `textUtils.test.js` - Tests for text processing utilities:
  - `normalizeText()`
  - `cleanNoiseTokens()`
  - `cleanEcommerceText()`
  - `extractCandidates()`

- `imageHash.test.js` - Tests for image hash generation:
  - `generateImageHash()`

## Test Coverage

Each test file includes:
- **Normal cases**: Typical usage scenarios
- **Edge cases**: Empty input, null/undefined, unicode, multi-line text
- **Noise cases**: Real-world scenarios like e-commerce text, OCR artifacts, retailer junk

## Extracted Functions

The following pure utility functions were extracted from `server-hybrid.js` to `utils/`:

- `utils/textUtils.js`: Text processing functions (normalizeText, cleanNoiseTokens, cleanEcommerceText, extractCandidates)
- `utils/imageHash.js`: Image hash generation (generateImageHash)

These functions are now imported in `server-hybrid.js` and can be tested independently without requiring network calls or external API keys.

